// The real CheckDeps: cache → saved responses → live provider chain (primary, then fallback; behind the shared
// limiter) → unavailable.
// Every AI output is zod-validated; invalid output is retried once, then rejected (SPEC §6.2).
import path from "node:path";
import type { z } from "zod";
import type { AiRunInfo, CheckDeps, DraftClaim, SafeReplyRequest, SourceClaim, SourceForExtraction } from "@/lib/engine/types";
import {
  AiInvalidOutputError,
  AiRateLimitedError,
  DEFAULT_MODELS,
  SCRIPT_INTERVAL_MS,
  configFor,
  createProvider,
  providerChain,
  throttled,
  type AiProvider,
  type ProviderName,
  type StructuredRequest,
} from "./client";
import { createAiCache, type AiCache, type CacheIdentity } from "./cache";
import type { FixDeps } from "@/lib/fix/propose";
import {
  DRAFT_SYSTEM,
  FIX_PROMPT_VERSION,
  FIX_SYSTEM,
  PROMPT_VERSION,
  REPLY_PROMPT_VERSION,
  REPLY_SYSTEM,
  SOURCE_SYSTEM,
  draftUserPrompt,
  fixUserPrompt,
  replyUserPrompt,
  sourceUserPrompt,
} from "./prompts";
import {
  DOC_FIX_JSON_SCHEMA,
  DocFixWire,
  DRAFT_JSON_SCHEMA,
  DraftExtractionWire,
  REPLY_JSON_SCHEMA,
  SCHEMA_VERSION,
  SOURCE_JSON_SCHEMA,
  SafeReplyWire,
  SourceExtractionWire,
  toDraftClaims,
  toSourceClaims,
} from "./schemas";

export const AI_CACHE_DIR = path.join(process.cwd(), "data", "ai-cache");

/** Thrown by an AI task; carries run info for the AI run panel. */
export class AiTaskError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "paused" | "invalid_output" | "provider_error",
    readonly info: AiRunInfo,
  ) {
    super(message);
  }
}

export interface ProviderSlot {
  name: string;
  model: string;
  /** Null when the provider has no key or AI_MODE=saved: its saved responses can still be used. */
  provider: AiProvider | null;
}

export interface AiRuntime {
  /** Primary first, then the fallback provider (D-017). */
  chain: ProviderSlot[];
  /**
   * Extra identities consulted for saved responses only (never called live): every other known provider, so a deploy or
   * CI run whose AI_PROVIDER differs from the recording still replays it (D-018).
   */
  savedLookup: Array<{ name: string; model: string }>;
  cache: AiCache;
  /** Asked once per check, on the first live call; false → "Live AI paused". */
  liveGate: () => Promise<boolean>;
  /** Eval: skip cache and saved responses so every run is a real model call. */
  bypassCache?: boolean;
  /** Record: write every live result to data/ai-cache. */
  persist?: boolean;
}

/** Memory entries remember whether they came from a live call in this process. */
interface LiveEntry {
  __live: true;
  output: unknown;
}
const isLiveEntry = (x: unknown): x is LiveEntry => typeof x === "object" && x !== null && "__live" in x;

let sharedCache: AiCache | null = null;
export function appCache(): AiCache {
  sharedCache ??= createAiCache({ dir: AI_CACHE_DIR, maxEntries: 500 });
  return sharedCache;
}

export interface RuntimeOptions {
  liveGate?: () => Promise<boolean>;
  cache?: AiCache;
  bypassCache?: boolean;
  persist?: boolean;
  /** Eval/record: use exactly this provider, with no fallback. */
  only?: ProviderName;
  /** Eval/record: space calls to stay under free-tier limits. */
  throttle?: boolean;
}

export function createRuntime(opts: RuntimeOptions = {}): AiRuntime {
  const configs = opts.only ? [configFor(opts.only)] : providerChain();
  let gate: Promise<boolean> | null = null;
  const liveGate = opts.liveGate ?? (async () => true);
  return {
    chain: configs.map((cfg) => {
      const p = createProvider(cfg);
      return { name: cfg.provider, model: cfg.model, provider: p && opts.throttle ? throttled(p, SCRIPT_INTERVAL_MS[cfg.provider]) : p };
    }),
    savedLookup: opts.only
      ? []
      : (Object.keys(DEFAULT_MODELS) as ProviderName[])
          .filter((name) => !configs.some((c) => c.provider === name))
          .map((name) => ({ name, model: configFor(name).model })),
    cache: opts.cache ?? appCache(),
    liveGate: () => (gate ??= liveGate()),
    bypassCache: opts.bypassCache,
    persist: opts.persist,
  };
}

type LiveSlot = ProviderSlot & { provider: AiProvider };

async function callLive<W, T>(
  rt: AiRuntime,
  slot: LiveSlot,
  identity: CacheIdentity,
  req: StructuredRequest,
  wire: z.ZodType<W>,
  map: (w: W) => T,
): Promise<{ value: T; info: AiRunInfo }> {
  const base = { model: slot.model, provider: slot.name, promptVersion: PROMPT_VERSION };
  const started = Date.now();
  let lastIssue = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: unknown;
    try {
      raw = await slot.provider.complete(req);
    } catch (e) {
      const latencyMs = Date.now() - started;
      if (e instanceof AiRateLimitedError) {
        throw new AiTaskError(`${slot.name}: rate limit or quota`, "paused", { ...base, mode: "unavailable", latencyMs, paused: true });
      }
      if (e instanceof SyntaxError || e instanceof AiInvalidOutputError) {
        lastIssue = `invalid JSON: ${e.message}`;
        continue; // invalid output → retry once
      }
      const message = e instanceof Error ? e.message : String(e);
      throw new AiTaskError(`${slot.name}: provider error: ${message}`, "provider_error", { ...base, mode: "unavailable", latencyMs });
    }
    const parsed = wire.safeParse(raw);
    if (parsed.success) {
      if (rt.persist) rt.cache.save(identity, parsed.data);
      const entry: LiveEntry = { __live: true, output: parsed.data };
      rt.cache.set(identity, entry);
      return { value: map(parsed.data), info: { ...base, mode: "live", latencyMs: Date.now() - started } };
    }
    lastIssue = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  throw new AiTaskError(`${slot.name}: invalid AI output after one retry (${lastIssue})`, "invalid_output", {
    ...base,
    mode: "live",
    latencyMs: Date.now() - started,
  });
}

/**
 * Cache/saved (primary identity, then the fallback's) → live primary → on rate limit/quota or provider error, the
 * fallback once → AiTaskError ("paused" when limits caused it: "Live AI paused, showing saved responses").
 */
async function runTask<W, T>(
  rt: AiRuntime,
  task: CacheIdentity["task"],
  inputText: string,
  extra: Partial<CacheIdentity>,
  req: StructuredRequest,
  wire: z.ZodType<W>,
  map: (w: W) => T,
): Promise<{ value: T; info: AiRunInfo }> {
  const primary = rt.chain[0]!;
  const base = { model: primary.model, provider: primary.name, promptVersion: PROMPT_VERSION };

  if (!rt.bypassCache) {
    for (const slot of [...rt.chain, ...rt.savedLookup]) {
      const hit = rt.cache.get(identityFor(slot, task, inputText, extra));
      if (hit === undefined) continue;
      const live = isLiveEntry(hit);
      const parsed = wire.safeParse(live ? hit.output : hit);
      if (parsed.success) {
        const info: AiRunInfo = { model: slot.model, provider: slot.name, promptVersion: PROMPT_VERSION, mode: live ? "live" : "saved", latencyMs: 0 };
        return { value: map(parsed.data), info };
      }
    }
  }

  const liveSlots = rt.chain.filter((s): s is LiveSlot => s.provider !== null);
  if (liveSlots.length === 0) {
    throw new AiTaskError("Live AI is not configured and no saved response matches", "unavailable", { ...base, mode: "unavailable", latencyMs: 0 });
  }
  if (!(await rt.liveGate())) {
    throw new AiTaskError("Live AI paused (rate limit) and no saved response matches", "paused", { ...base, mode: "unavailable", latencyMs: 0, paused: true });
  }

  let lastError: AiTaskError | null = null;
  let rateLimited = false;
  for (const [i, slot] of liveSlots.entries()) {
    try {
      const out = await callLive(rt, slot, identityFor(slot, task, inputText, extra), req, wire, map);
      return i > 0 ? { ...out, info: { ...out.info, fellBack: true } } : out;
    } catch (e) {
      if (!(e instanceof AiTaskError)) throw e;
      lastError = e;
      if (e.kind === "paused") rateLimited = true;
      // A model-quality failure is reported, not masked by another provider.
      if (e.kind === "invalid_output") throw e;
    }
  }
  // If limits were part of the reason, the UI should say "Live AI paused", not "AI unavailable".
  if (rateLimited && lastError!.kind !== "paused") {
    throw new AiTaskError(`${lastError!.message} (after a rate limit)`, "paused", { ...lastError!.info, paused: true });
  }
  throw lastError!;
}

export function identityFor(
  slot: { name: string; model: string },
  task: CacheIdentity["task"],
  inputText: string,
  extra: Partial<CacheIdentity> = {},
): CacheIdentity {
  return { task, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, provider: slot.name, model: slot.model, inputText, ...extra };
}

export function aiDeps(rt: AiRuntime): CheckDeps {
  return {
    async extractSource(source: SourceForExtraction): Promise<{ claims: SourceClaim[]; info: AiRunInfo }> {
      const { value, info } = await runTask(
        rt,
        "source_extraction",
        source.body,
        { sourceKind: source.kind },
        { system: SOURCE_SYSTEM, user: sourceUserPrompt(source), schemaName: "source_claims", schema: SOURCE_JSON_SCHEMA },
        SourceExtractionWire,
        (w) => toSourceClaims(w, source),
      );
      return { claims: value, info };
    },
    async extractDraft(draft: string): Promise<{ claims: DraftClaim[]; info: AiRunInfo }> {
      const { value, info } = await runTask(
        rt,
        "draft_extraction",
        draft,
        {},
        { system: DRAFT_SYSTEM, user: draftUserPrompt(draft), schemaName: "draft_claims", schema: DRAFT_JSON_SCHEMA },
        DraftExtractionWire,
        toDraftClaims,
      );
      return { claims: value, info };
    },
    async suggestReply(req: SafeReplyRequest): Promise<{ text: string; info: AiRunInfo }> {
      const { value, info } = await runTask(
        rt,
        "safe_reply",
        req.draft,
        {
          promptVersion: REPLY_PROMPT_VERSION,
          governing: { value: req.governing.value, quote: req.governing.quote, decision: req.decision },
          claims: req.claims,
        },
        { system: REPLY_SYSTEM, user: replyUserPrompt(req), schemaName: "safe_reply", schema: REPLY_JSON_SCHEMA },
        SafeReplyWire,
        (w) => w.reply,
      );
      return { text: value, info };
    },
  };
}

/**
 * "Fix the doc" (D-037): the AI drafts a minimal edit to the doc agents copied. Same chain as the extractions (cache →
 * saved → live → fallback), with its own prompt version in the identity. lib/fix validates and rechecks the edit.
 */
export function aiFixDeps(rt: AiRuntime): Required<FixDeps> {
  return {
    async draftDocFix(req) {
      const { value, info } = await runTask(
        rt,
        "doc_fix",
        req.sourceBody,
        {
          promptVersion: FIX_PROMPT_VERSION,
          // Every input the prompt uses (QA, D-037); the body is inputText.
          fix: {
            sourceId: req.sourceId,
            sourceQuote: req.sourceQuote,
            exceptionQuote: req.exceptionQuote,
            exceptionTitle: req.exceptionTitle,
            exceptionValue: req.exceptionValue,
            exceptionRail: req.exceptionRail,
            railHint: req.railHint,
          },
        },
        { system: FIX_SYSTEM, user: fixUserPrompt(req), schemaName: "doc_fix", schema: DOC_FIX_JSON_SCHEMA },
        DocFixWire,
        (w) => w,
      );
      return { edit: value, info };
    },
  };
}
