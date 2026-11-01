"use client";
import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import type { CheckResult } from "@/lib/engine/types";
import { findRange } from "@/lib/client/format";
import { claimCards, OUTCOME, whyModel, type OutcomeTone, type WhyModel } from "@/lib/client/outcome";
import { cx, Tag, ui } from "@/components/ui/atoms";
import s from "./agent.module.css";

const PILL = { good: s.pGood, check: s.pCheck, hold: s.pHold, ask: s.pAsk, off: s.pOff };

function QuoteMark({ quote, highlight }: { quote: string; highlight: string }) {
  const r = findRange(quote, highlight);
  if (!r) return <>“{quote}”</>;
  return (
    <>
      “{quote.slice(0, r.start)}
      <mark>{quote.slice(r.start, r.end)}</mark>
      {quote.slice(r.end)}”
    </>
  );
}

/**
 * "Your reply says / Your docs say / So" for one claim. `anchor` keeps the tour's target on the first claim only; inside a
 * claim card (whose title is the h4) the section labels are h5.
 */
function WhyBody({ m, tone, anchor, nested = false }: { m: WhyModel; tone: OutcomeTone; anchor: boolean; nested?: boolean }) {
  const H = nested ? "h5" : "h4";
  return (
    <>
      <div className={s.section}>
        <H className={ui.sectionLabel}>1 · Your reply says</H>
        <span className={cx(s.replyPill, PILL[tone])}>{m.replySays}</span>
      </div>

      <div className={s.section} style={{ gap: 10 }} data-tour={anchor ? "why-docs" : undefined}>
        <H className={ui.sectionLabel}>2 · Your docs say</H>
        {m.governing ? (
          <div className={s.govDoc}>
            <div className={s.docRow}>
              <span className={s.docTitle}>{m.governing.title}</span>
              <Tag tone="ink">Applies</Tag>
            </div>
            <p className={s.quote}>
              <QuoteMark quote={m.governing.quote} highlight={m.governing.highlight} />
            </p>
            {m.governing.tags.length ? (
              <div className={s.tags}>
                {m.governing.tags.map((t) => (
                  <Tag key={t.text} tone={t.tone}>
                    {t.text}
                  </Tag>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {m.others.map((o) => (
          <div key={o.id} className={s.otherDoc}>
            <span className={s.otherText}>
              <span>{o.title}</span>
              <span>{o.line}</span>
            </span>
            <span className={s.otherLabel}>{o.label}</span>
          </div>
        ))}
        {!m.governing && m.others.length === 0 ? <p className={s.note}>No doc makes a claim about this.</p> : null}
        {m.didntCount.length ? (
          <details className={s.details}>
            <summary>
              {m.didntCount.length} source{m.didntCount.length === 1 ? "" : "s"} didn&apos;t count
            </summary>
            <ul>
              {m.didntCount.map((d) => (
                <li key={d.id}>{d.text}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className={s.section}>
        <H className={ui.sectionLabel}>3 · So</H>
        <p className={s.so}>{m.so}</p>
      </div>
    </>
  );
}

/**
 * "Why?" (design v2): plain explanation built from the real result. Engine names stay in the trace. A reply with several
 * claims gets one card per claim, each with its own verdict (D-041).
 */
export function WhyView({ result, onBack, onTrace }: { result: CheckResult; onBack: () => void; onTrace: () => void }) {
  const m = whyModel(result);
  const cards = claimCards(result);
  const tone = OUTCOME[result.decision].tone;
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);

  return (
    <div className={s.stack} style={{ flex: 1, gap: 18 }}>
      <div className={s.viewHead}>
        <button ref={backRef} type="button" className={ui.round} aria-label="Back to the decision" onClick={onBack}>
          <ChevronLeft aria-hidden="true" strokeWidth={2.2} />
        </button>
        <h3 className={s.viewTitle}>{m.title}</h3>
      </div>

      {cards.length ? (
        cards.map((c, i) => (
          <section key={c.key} className={s.claimCard} aria-labelledby={`why-claim-${i}`}>
            <div className={s.claimCardHead}>
              <h4 id={`why-claim-${i}`} className={s.claimCardTitle}>
                {c.label}: “{c.says}”
              </h4>
              <span className={cx(s.replyPill, PILL[c.tone])}>{c.name}</span>
            </div>
            <WhyBody m={c.model} tone={c.tone} anchor={i === 0} nested />
          </section>
        ))
      ) : (
        <WhyBody m={m} tone={tone} anchor />
      )}

      <div className={s.whyFoot}>
        <p className={s.note}>AI read the docs. Fixed rules made the call.</p>
        <button type="button" className={s.linkBtn} onClick={onTrace}>
          See the full rule trace
        </button>
      </div>
    </div>
  );
}
