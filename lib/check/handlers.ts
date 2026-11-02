// Framework-free request handlers behind the API routes (SPEC §12). Route files are thin wrappers that pass
// the real AI deps; tests pass fixture deps. Bodies are validated with zod; unknown keys (including any
// client-supplied "result") are stripped, so the client's earlier result is never trusted (SPEC §6.8).
import { z } from "zod";
import type { CheckDeps, HandlerResponse, Role } from "@/lib/engine/types";
import { CheckInputError, runCheck } from "@/lib/check/runCheck";
import { proposeFix, type FixDeps } from "@/lib/fix/propose";
import { MAX_DOC_CHARS, MAX_SOURCES_PER_CHECK } from "@/lib/workspace/merge";
import { visibleSources } from "@/lib/workspace/permissions";
import { seedSources, seedTickets } from "@/lib/workspace/seed";

export const MAX_DRAFT_CHARS = 1000;

const RoleSchema = z.enum(["support_agent", "ops_lead"]);
const RailSchema = z.enum(["instant", "standard", "unknown"]);
const IsoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO date-time");

// No `visibility`, `kind` or `title`: those come from the seed only (SPEC §8).
const OverrideSchema = z.object({
  id: z.string().min(1).max(32),
  body: z.string().max(MAX_DOC_CHARS).optional(),
  version: z.number().int().min(1).optional(),
  updatedAt: IsoTime.optional(),
  verification: z.enum(["verified", "unverified", "expired"]).optional(),
  verifiedAt: IsoTime.nullable().optional(),
  flaggedOutdated: z.boolean().optional(),
  ownerActive: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

const CheckBody = z.object({
  ticketId: z.string().min(1).max(32),
  rail: RailSchema,
  draft: z.string().trim().min(1, "Draft is empty").max(MAX_DRAFT_CHARS),
  role: RoleSchema,
  overrides: z.array(OverrideSchema).max(MAX_SOURCES_PER_CHECK * 2).optional(),
  decisionTime: IsoTime.optional(),
});

const SendBody = CheckBody.omit({ decisionTime: true }).extend({ acknowledged: z.boolean().default(false) });

function badRequest(error: z.ZodError): HandlerResponse {
  return {
    status: 400,
    body: { error: "INVALID_REQUEST", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
  };
}

/** Input errors keep their message; anything unexpected gets a generic body, and the detail goes to the server log only. */
function failure(e: unknown): HandlerResponse {
  if (e instanceof CheckInputError) return { status: e.status, body: { error: e.message } };
  console.error("[suresend] check failed:", e);
  return { status: 500, body: { error: "CHECK_FAILED", message: "Something went wrong while checking this reply. Try again." } };
}

/** GET /api/seed: tickets and the seed sources visible to the persona. */
export async function handleSeed(query: { role?: string | null }): Promise<HandlerResponse> {
  const parsed = RoleSchema.safeParse(query.role ?? "support_agent");
  if (!parsed.success) return badRequest(parsed.error);
  const role: Role = parsed.data;
  return { status: 200, body: { role, tickets: seedTickets(), sources: visibleSources(seedSources(), role) } };
}

/** POST /api/check */
export async function handleCheck(body: unknown, deps: CheckDeps, opts: { noCustomerMessage?: boolean } = {}): Promise<HandlerResponse> {
  const parsed = CheckBody.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return { status: 200, body: await runCheck({ ...parsed.data, ...opts }, deps) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * POST /api/fix (D-037): the same body as /api/check; returns a doc-fix proposal for a Hold or Ask first, or why there's
 * none. Read-only: nothing is applied, the browser applies an approved fix as an ordinary doc edit.
 */
export async function handleFix(body: unknown, deps: CheckDeps, fixDeps: FixDeps): Promise<HandlerResponse> {
  const parsed = CheckBody.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return { status: 200, body: await proposeFix(parsed.data, deps, fixDeps) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * POST /api/send: reruns the full check on the exact text, workspace and role submitted (SPEC §6.8).
 * ALLOW → 200 sent. CAUTION → sent only with acknowledged: true (else 428). HOLD/ESCALATE → 409 BLOCKED
 * (an intercept). AI_UNAVAILABLE → 503, not sent and not an intercept.
 */
export async function handleSend(body: unknown, deps: CheckDeps): Promise<HandlerResponse> {
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { acknowledged, ...input } = parsed.data;
  let result;
  try {
    result = await runCheck(input, deps);
  } catch (e) {
    return failure(e);
  }
  switch (result.decision) {
    case "ALLOW":
      return { status: 200, body: { sent: true, checkHash: result.checkHash, result } };
    case "CAUTION":
      return acknowledged
        ? { status: 200, body: { sent: true, checkHash: result.checkHash, result } }
        : { status: 428, body: { sent: false, error: "ACKNOWLEDGEMENT_REQUIRED", result } };
    case "HOLD":
    case "ESCALATE":
      return { status: 409, body: { blocked: true, result } };
    case "AI_UNAVAILABLE":
      return { status: 503, body: { sent: false, error: "AI_UNAVAILABLE", result } };
  }
}
