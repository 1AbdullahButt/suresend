"use client";
import { useRef, type KeyboardEvent } from "react";
import type { Rail, Ticket } from "@/lib/engine/types";
import type { StoredResult } from "@/lib/client/types";
import type { SendState } from "@/lib/client/useSureSend";
import { OUTCOME } from "@/lib/client/outcome";
import { cx } from "@/components/ui/atoms";
import { RailSelect } from "./RailSelect";
import { initials, ticketMeta } from "./ticketMeta";
import s from "./inbox.module.css";

const SUB: Record<Rail, string> = { instant: "Instant transfer", standard: "Standard transfer", unknown: "Transfer type unknown" };
const TAG_CLS = { good: s.ctGood, check: s.ctCheck, hold: s.ctHold, ask: s.ctAsk, off: s.ctOff };

/** Customer card + Conversations (design v2). Under 1100 px the CSS turns this column into a conversation switcher. */
export function LeftColumn({
  tickets,
  ticket,
  rail,
  onRail,
  railOf,
  results,
  sendStateOf,
  isStale,
  onSelect,
}: {
  tickets: Ticket[];
  ticket: Ticket | null;
  rail: Rail;
  onRail: (r: Rail) => void;
  railOf: (id: string) => Rail;
  results: Record<string, StoredResult>;
  sendStateOf: (id: string) => SendState;
  isStale: (id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(tickets.length - 1, i + 1);
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(0, i - 1);
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
  };
  const meta = ticket ? ticketMeta(ticket.id) : null;
  const amount = meta?.transfer.split("·")[1]?.trim() ?? "";

  return (
    <div className={s.left}>
      {ticket ? (
        <section className={cx(s.card, s.customer)} aria-label="Customer">
          <div className={s.custTop}>
            <span className={s.avatar} aria-hidden="true">
              {initials(ticket.customer)}
            </span>
            <span className={s.custMeta}>
              <span>Customer</span>
              <span>{ticket.id}</span>
            </span>
          </div>
          <h2 className={s.custName}>{ticket.customer}</h2>
          <div className={s.pills}>
            <RailSelect value={rail} onChange={onRail} />
            {amount ? <span className={s.amount}>{amount}</span> : null}
          </div>
        </section>
      ) : null}
      <nav className={cx(s.card, s.convs)} aria-label="Conversations">
        <h2 className={s.convsTitle}>Conversations</h2>
        <ul className={s.convList}>
          {tickets.map((t, i) => {
            const on = t.id === ticket?.id;
            const res = results[t.id];
            const sent = sendStateOf(t.id).kind === "sent";
            const tone = res ? OUTCOME[res.result.decision].tone : null;
            const stale = res && isStale(t.id) && !sent;
            return (
              <li key={t.id}>
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  className={cx(s.conv, on && s.convOn)}
                  aria-current={on ? "true" : undefined}
                  onClick={() => onSelect(t.id)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span className={s.convText}>
                    <span className={s.convName}>{t.customer}</span>
                    <span className={s.convSub}>{SUB[railOf(t.id)]}</span>
                  </span>
                  {sent ? (
                    <span className={cx(s.convTag, s.ctSent)}>Sent</span>
                  ) : res && tone ? (
                    <span className={cx(s.convTag, TAG_CLS[tone], stale && s.stale)} title={stale ? "From an earlier version of this reply" : undefined}>
                      {res.result.decision === "AI_UNAVAILABLE" ? "Not checked" : OUTCOME[res.result.decision].name}
                      {stale ? <span className="sr-only"> (earlier version)</span> : null}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
