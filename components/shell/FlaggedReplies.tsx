"use client";
// The replies SureSend flagged this session, in the Demo menu ("Review flagged replies") and under "Wrong replies stopped
// today" on the sent card: the verdict, why in one line, a way back to the thread, and the review buttons.
import type { PastFlag, Review } from "@/lib/client/metrics";
import { OUTCOME } from "@/lib/client/outcome";
import { OutcomeTag } from "@/components/ui/atoms";
import s from "./shell.module.css";

const REVIEWS = [
  ["correct", "Correct catch"],
  ["false_alarm", "False alarm"],
] as const;

export function FlaggedReplies({
  flags,
  onReview,
  onOpen,
  id,
}: {
  flags: PastFlag[];
  onReview: (checkHash: string, r: Review | null) => void;
  /** "Open conversation": shows that customer's thread. */
  onOpen: (ticketId: string) => void;
  id?: string;
}) {
  if (!flags.length) {
    return (
      <p id={id} className={s.small}>
        No replies flagged this session.
      </p>
    );
  }
  return (
    <ul id={id} className={s.flagList}>
      {flags.map((f) => {
        const verdict = OUTCOME[f.decision].name;
        return (
          <li key={f.checkHash} className={s.flag}>
            <p className={s.flagHead}>
              <OutcomeTag decision={f.decision} />
              <b>{f.customer}</b>
            </p>
            {/* Flags saved before the reason line existed show the reply itself. */}
            <p className={s.flagReason}>{f.reason ?? `“${f.draft}”`}</p>
            <div className={s.flagActions}>
              <button type="button" className={s.openConv} onClick={() => onOpen(f.ticketId)}>
                Open conversation
                <span className="sr-only"> with {f.customer}</span>
              </button>
              <div className={s.reviewSeg} role="group" aria-label={`Review the ${verdict} on ${f.customer}`}>
                {REVIEWS.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={f.review === key} onClick={() => onReview(f.checkHash, f.review === key ? null : key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
