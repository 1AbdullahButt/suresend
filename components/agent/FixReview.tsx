"use client";
// "Fix the doc" review (D-037), in the Docs tab: a Triage-style card for one proposed doc edit. Only the changed lines
// are shown, before and after, with the added text marked. Nothing is applied until "Approve fix (simulated)".
import { useEffect, useRef } from "react";
import type { FixReview as FixReviewState } from "@/lib/client/useSureSend";
import type { ChangedLine } from "@/lib/fix/validate";
import { cx, Tag, ui } from "@/components/ui/atoms";
import s from "./agent.module.css";

/** Splits the after line around what was added, so the new text can be marked. */
function addedPart({ before, after }: ChangedLine): { head: string; added: string; tail: string } {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  return { head: after.slice(0, p), added: after.slice(p, after.length - q), tail: after.slice(after.length - q) };
}

function railWord(rail: string): string {
  return rail === "unknown" ? "unknown rail" : `${rail} rail`;
}

export function FixReview({
  review,
  holds,
  onApprove,
  onDismiss,
}: {
  review: FixReviewState;
  /** Held replies this session that copied from the proposed doc (simulated, this browser). */
  holds: number;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review.status !== "loading") titleRef.current?.focus({ preventScroll: true });
  }, [review.status]);

  if (review.status === "loading") {
    return (
      <section className={s.fixCard} aria-label="Suggested doc fix" aria-busy="true" data-tour="fix-review">
        <p className={s.fixLoading} role="status">
          <span className={s.spin} aria-hidden="true" />
          Drafting a fix and rechecking the demo&apos;s replies…
        </p>
      </section>
    );
  }

  if (review.status !== "ready" || !review.proposal) {
    return (
      <section className={s.fixCard} aria-labelledby="fix-title" data-tour="fix-review">
        <h3 id="fix-title" ref={titleRef} tabIndex={-1} className={s.docName}>
          {review.status === "none" ? "No doc fix to suggest" : "Couldn't draft a fix"}
        </h3>
        <p className={s.note}>{review.why ?? "Try again in a moment."}</p>
        <button type="button" className={cx(ui.btn, ui.outline, ui.lg)} onClick={onDismiss}>
          Close
        </button>
      </section>
    );
  }

  const p = review.proposal;
  const copied = holds >= 2 ? `${holds} replies this session copied ${p.draftValue} from this doc.` : `A reply this session copied ${p.draftValue} from this doc.`;
  const drafted = p.origin === "ai" ? "Drafted by AI, checked by the rules" : `Template fix${p.aiSetAside ? ` (${p.aiSetAside})` : ""}, checked by the rules`;

  return (
    <section className={s.fixCard} aria-labelledby="fix-title" data-tour="fix-review">
      <div className={s.tags}>
        <Tag tone="ask">Suggested fix · needs approval</Tag>
      </div>
      <h3 id="fix-title" ref={titleRef} tabIndex={-1} className={s.docName}>
        {p.doc.title}
      </h3>
      <p className={s.fixWhy}>
        <b>{copied}</b> It covers all rails, but {p.exception.title} gives {p.exception.rail}-rail transfers {p.exception.valueText}, and
        this doc doesn&apos;t say so.
      </p>

      <div className={s.fixDiff} role="group" aria-label="Changed lines">
        {p.changed.map((line, i) => {
          const { head, added, tail } = addedPart(line);
          return (
            <div key={i} className={s.fixPair}>
              <p className={s.fixLabel}>Before</p>
              <p className={s.fixBefore}>{line.before}</p>
              <p className={s.fixLabel}>After</p>
              <p className={s.fixAfter}>
                {head}
                <ins className={s.fixIns}>{added}</ins>
                {tail}
              </p>
            </div>
          );
        })}
      </div>

      <p className={s.small} title={p.recheck.map((r) => `${r.ticketId} ${railWord(r.rail)}: ${r.decision}`).join("\n")}>
        {drafted}: it adds one passage after the claim sentence and changes nothing else, states the exact value, and the demo&apos;s{" "}
        {p.recheck.length} canonical replies keep their decisions.
      </p>

      <div className={s.actions} data-tour="fix-approve">
        <button type="button" className={cx(ui.btn, ui.primary, ui.lg)} onClick={onApprove}>
          Approve fix (simulated)
        </button>
        <button type="button" className={cx(ui.btn, ui.outline, ui.lg)} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <p className={s.small}>Nothing changes until you approve. Approving saves the edit and marks the doc verified (simulated).</p>
    </section>
  );
}
