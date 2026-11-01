// Why a suggested reply's recheck came back Double-check, in a few plain words (D-034), e.g. "a Slack note proposes 1 day".
// It reads the recheck's own decision output (reason code, governing value, evidence); it never re-decides anything.
import type { DecideOutput } from "@/lib/engine/decide";
import { amountWithin, formatDate } from "@/lib/engine/normalize";
import type { Evidence, Source, Suggestion, Weakener } from "@/lib/engine/types";

export interface CheckedSuggestion extends Suggestion {
  /** Present only when the recheck is CAUTION. */
  recheckNote?: string;
}

const WEAKENER_NOTE: Record<Weakener, string> = {
  EDITED_AFTER_VERIFICATION: "the doc changed after it was verified",
  UNVERIFIED: "the doc isn't verified",
  VERIFICATION_EXPIRED: "the doc's verification has expired",
  OWNER_INACTIVE: "the doc's owner is inactive",
};

function signalNote(e: Evidence): string {
  const v = e.claim.valueText;
  if (e.standing === "NOT_YET_EFFECTIVE") {
    return e.claim.effectiveFrom ? `a change to ${v} takes effect ${formatDate(e.claim.effectiveFrom)}` : `a change to ${v} is coming`;
  }
  if (e.source.kind === "slack") return `a Slack note proposes ${v}`;
  if (e.source.kind === "release_note") return `a release note announces ${v}`;
  return e.claim.statusWording === "pending_approval" ? `a change to ${v} is pending approval` : `a change to ${v} is proposed`;
}

export function recheckNote(re: DecideOutput, sources: Source[]): string | undefined {
  if (re.decision !== "CAUTION") return undefined;
  const lead = re.claims.find((c) => c.reasonCode === re.reasonCode);
  const g = lead?.governing ?? null;
  switch (re.reasonCode) {
    case "CHANGE_SIGNALLED": {
      // The same signals D11(b) looks at: a proposal or future change that applies and whose amount falls outside V.
      const signal =
        lead && g
          ? lead.evidence.find(
              (e) =>
                (e.standing === "PROPOSAL" || e.standing === "NOT_YET_EFFECTIVE") &&
                e.applicability === "APPLIES" &&
                e.claim.value !== null &&
                !amountWithin(e.claim.value, g.value),
            )
          : undefined;
      return signal ? signalNote(signal) : "a change is signalled";
    }
    case "WEAK_BASIS": {
      const weakener = lead && g ? lead.evidence.find((e) => e.source.id === g.sourceId && e.weakeners.length > 0)?.weakeners[0] : undefined;
      return weakener ? WEAKENER_NOTE[weakener] : "the doc behind it is in doubt";
    }
    case "SOURCE_UNREAD": {
      const id = re.caps[0]?.sourceId;
      const title = sources.find((s) => s.id === id)?.title;
      return title ? `${title} couldn't be read` : "a doc couldn't be read";
    }
    default:
      return "the rules can't fully confirm it";
  }
}
