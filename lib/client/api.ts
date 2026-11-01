// Typed wrappers around the three API routes (SPEC §12, lib/check/handlers.ts).
import type { CheckResult, Rail, Role, SourceOverride } from "@/lib/engine/types";
import type { FixResult } from "@/lib/fix/propose";
import type { SeedResponse } from "./types";

export interface CheckRequest {
  ticketId: string;
  rail: Rail;
  draft: string;
  role: Role;
  overrides: SourceOverride[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown; issues?: Array<{ path?: string; message?: string }> };
    const first = Array.isArray(b.issues) ? b.issues[0] : undefined;
    if (first) return `${first.path ? first.path + ": " : ""}${first.message ?? "invalid request"}`;
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
  }
  return `Request failed (${status})`;
}

export async function fetchSeed(role: Role, signal?: AbortSignal): Promise<SeedResponse> {
  const res = await fetch(`/api/seed?role=${encodeURIComponent(role)}`, { signal, cache: "no-store" });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body));
  return body as SeedResponse;
}

export async function postCheck(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult> {
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body));
  return body as CheckResult;
}

/** POST /api/fix (D-037): a doc-fix proposal for a Hold or Ask first, or why there's none. Nothing is applied. */
export async function postFix(req: CheckRequest, signal?: AbortSignal): Promise<FixResult> {
  const res = await fetch("/api/fix", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, body));
  return body as FixResult;
}

export type SendOutcome =
  | { kind: "sent"; result: CheckResult }
  | { kind: "blocked"; result: CheckResult }
  | { kind: "ack_required"; result: CheckResult }
  | { kind: "unavailable"; result: CheckResult };

export async function postSend(req: CheckRequest & { acknowledged: boolean }): Promise<SendOutcome> {
  const res = await fetch("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  const body = (await readBody(res)) as { result?: CheckResult } | null;
  const result = body?.result;
  if (result) {
    if (res.status === 200) return { kind: "sent", result };
    if (res.status === 409) return { kind: "blocked", result };
    if (res.status === 428) return { kind: "ack_required", result };
    if (res.status === 503) return { kind: "unavailable", result };
  }
  throw new ApiError(res.status, errorMessage(res.status, body));
}
