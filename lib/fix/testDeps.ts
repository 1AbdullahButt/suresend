// Test helper for "Fix the doc" (D-037): the locked fixture deps, plus hand-written extractions for DOC-101 once a fix has
// added the instant-transfer sentence. `badScope` extracts that sentence as scope "any", to prove an unsafe fix is dropped.
import type { CheckDeps, SourceClaim, SourceForExtraction } from "@/lib/engine/types";
import { fixtureDeps, seedBody } from "../../tests/helpers/fixtures";

const SOP_QUOTE = "When an outgoing transfer fails, the amount is reversed to the customer's wallet within 4 business days.";
export const EXCEPTION_QUOTE = "For instant transfers only, failed transfers are reversed within 1 business day.";

function claim(source: SourceForExtraction, n: number, quote: string, amount: number, rail: SourceClaim["scope"]["rail"]): SourceClaim {
  return {
    claimId: `${source.id}#${n}`,
    sourceId: source.id,
    sourceVersion: source.version,
    topic: "reversal_window",
    value: { amount, unit: "business_days" },
    valueText: `${amount} business day${amount === 1 ? "" : "s"}`,
    scope: { rail },
    effectiveFrom: null,
    statusWording: "in_force",
    supersedes: null,
    quote,
  };
}

export function fixAwareDeps(opts: { badScope?: boolean; failSources?: string[] } = {}) {
  const base = fixtureDeps(opts.failSources ? { failSources: opts.failSources } : {});
  const seed101 = seedBody("DOC-101");
  const extractSource: CheckDeps["extractSource"] = async (source) => {
    if (source.id === "DOC-101" && source.body !== seed101 && source.body.includes(EXCEPTION_QUOTE)) {
      return {
        claims: [claim(source, 1, SOP_QUOTE, 4, "any"), claim(source, 2, EXCEPTION_QUOTE, 1, opts.badScope ? "any" : "instant")],
        info: { mode: "saved", model: "fixture", latencyMs: 0, promptVersion: "fixture" },
      };
    }
    return base.extractSource(source);
  };
  const deps: CheckDeps = { ...base.deps, extractSource };
  return { deps, extractSource: base.extractSource };
}
