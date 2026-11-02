"use client";
import { Check, CircleCheck, RefreshCw } from "lucide-react";
import type { Rail, Suggestion } from "@/lib/engine/types";
import type { AgentView, StaleReason, StoredResult } from "@/lib/client/types";
import type { CheckingState, SendState } from "@/lib/client/useSureSend";
import { claimLines, sentCopy, summarize } from "@/lib/client/outcome";
import { findFixSource } from "@/lib/fix/source";
import { cx, OutcomeTag, Tag, ui } from "@/components/ui/atoms";
import { TraceView } from "./TraceView";
import { WhyView } from "./WhyView";
import s from "./agent.module.css";

const OUT_CLS = { good: s.oGood, check: s.oCheck, hold: s.oHold, ask: s.oAsk, off: s.oOff };
const DOT = { good: s.dGood, check: s.dCheck, hold: s.dHold, ask: s.dAsk, off: s.dOff };

const STALE_TEXT: Record<Exclude<StaleReason, null>, string> = {
  draft: "You changed the reply. Press Send to check it.",
  rail: "Rail changed. Press Send to check again.",
  persona: "Viewing as someone else now. Press Send to check again.",
  workspace: "A doc changed. Press Send to check again.",
};

/** The server's plain reason for a Double-check recheck (D-034); results saved before it existed have none. */
function recheckNoteOf(sug: Suggestion): string | null {
  return "recheckNote" in sug && typeof sug.recheckNote === "string" ? sug.recheckNote : null;
}

/** Emphasise one value inside the generated sentence (e.g. "1 business day"). */
function Sentence({ text, strong }: { text: string; strong: string | null }) {
  if (!strong) return <p className={s.sentence}>{text}</p>;
  const i = text.indexOf(strong);
  if (i < 0) return <p className={s.sentence}>{text}</p>;
  return (
    <p className={s.sentence}>
      {text.slice(0, i)}
      <strong>{strong}</strong>
      {text.slice(i + strong.length)}
    </p>
  );
}

export function CheckingSteps({ checking }: { checking: CheckingState }) {
  const steps = ["Reading your reply", `Reading ${checking.sourceCount} doc${checking.sourceCount === 1 ? "" : "s"}`, "Applying the rules"];
  return (
    <div className={s.stack} aria-live="polite">
      <h3 className={s.checkingTitle}>Checking your reply…</h3>
      <ol className={s.steps} aria-label="Check progress">
        {steps.map((label, i) =>
          i < checking.step ? (
            <li key={label}>
              <span className={s.stepDone} aria-hidden="true">
                <Check strokeWidth={2.6} />
              </span>
              <span>{label}</span>
              <span className="sr-only"> (done)</span>
            </li>
          ) : i === checking.step ? (
            <li key={label}>
              <span className={s.stepNow} aria-hidden="true" />
              <span className={s.nowText}>{label}</span>
              <span className="sr-only"> (in progress)</span>
            </li>
          ) : (
            <li key={label}>
              <span className={s.stepTodo} aria-hidden="true" />
              <span className={s.todoText}>{label}</span>
            </li>
          ),
        )}
      </ol>
      <p className={s.note}>Send is paused until the check finishes, usually about 2 seconds.</p>
    </div>
  );
}

export function CheckView({
  stored,
  staleReason,
  rail,
  checking,
  sendState,
  ack,
  onAck,
  onSendAnyway,
  onTryAgain,
  onUseReply,
  view,
  onView,
  onOpenDoc,
  onFixDoc,
  intercepts,
  pausedVisible,
}: {
  stored: StoredResult | null;
  staleReason: StaleReason;
  rail: Rail;
  checking: CheckingState | null;
  sendState: SendState;
  ack: boolean;
  onAck: (v: boolean) => void;
  onSendAnyway: () => void;
  onTryAgain: () => void;
  onUseReply: () => void;
  view: AgentView;
  onView: (v: AgentView) => void;
  onOpenDoc: (id: string) => void;
  /** "Fix the doc that caused this" (D-037): opens the fix review in the Docs tab. */
  onFixDoc: () => void;
  intercepts: number;
  pausedVisible: boolean;
}) {
  if (checking) return <CheckingSteps checking={checking} />;

  if (sendState.kind === "sent") {
    const copy = sentCopy({ decision: sendState.decision, payoff: sendState.payoff });
    return (
      <div className={s.stack}>
        <section className={cx(s.outcome, s.oGood)} aria-label="Sent" data-tour="payoff">
          <OutcomeTag decision="ALLOW" label="Sent" />
          <h3 className={s.headline}>{copy.headline}</h3>
          <p className={s.sentence}>{copy.sentence}</p>
        </section>
        <div className={s.stopped}>
          <span>Wrong replies stopped today</span>
          <span className={s.stoppedN}>{intercepts}</span>
        </div>
        <p className={s.note}>Simulated count for this demo session</p>
      </div>
    );
  }

  if (!stored) {
    return (
      <div className={s.empty}>
        <h3 className={s.emptyTitle}>SureSend checks your reply when you press Send</h3>
        <ol className={s.emptySteps}>
          <li>
            <span className={s.num} aria-hidden="true">
              1
            </span>
            <span>It reads the promise in your reply.</span>
          </li>
          <li>
            <span className={s.num} aria-hidden="true">
              2
            </span>
            <span>It reads your team&apos;s docs and Slack.</span>
          </li>
          <li>
            <span className={s.num} aria-hidden="true">
              3
            </span>
            <span>Fixed rules decide: good to send, double-check, hold or ask first.</span>
          </li>
        </ol>
      </div>
    );
  }

  const { result } = stored;
  if (view === "why") return <WhyView result={result} onBack={() => onView("main")} onTrace={() => onView("trace")} />;
  if (view === "trace") return <TraceView result={result} onBack={() => onView("why")} onOpenDoc={onOpenDoc} />;

  const sum = summarize(result, rail);
  // A reply with several claims lists each with its own verdict, so a Hold names the claim it's for (D-041).
  const lines = claimLines(result);
  const stale = staleReason !== null;
  const off = result.decision === "AI_UNAVAILABLE";
  const needsAck = !stale && (result.decision === "CAUTION" || sendState.kind === "ack_required");
  const sug = result.suggestion;
  const note = sug ? recheckNoteOf(sug) : null;
  // A Hold or Ask first whose wrong value came from a general doc that misses the exception (D-037).
  const fixable = !off && findFixSource(result) !== null;
  const holding = result.decision === "ESCALATE";

  return (
    <div className={s.stack} style={{ flex: 1 }}>
      {pausedVisible && result.ai.paused ? <p className={s.paused}>Live AI paused: showing saved responses. Edited docs may not be checkable.</p> : null}
      {stale && staleReason ? (
        <p className={s.staleNote}>
          <RefreshCw aria-hidden="true" width={16} height={16} />
          {STALE_TEXT[staleReason]}
        </p>
      ) : null}
      <section className={cx(s.outcome, OUT_CLS[sum.tone], stale && s.staleOutcome)} aria-label="Decision" aria-live="polite" data-tour="decision">
        <OutcomeTag decision={result.decision} />
        <h3 className={s.headline}>{sum.headline}</h3>
        <Sentence text={sum.sentence} strong={sum.strong} />
        {lines.length ? (
          <ul className={s.claimList} aria-label="Claims in this reply">
            {lines.map((l) => (
              <li key={l.key}>
                <span className={s.claimSays}>{l.quoted ? `“${l.says}”` : l.says}</span>
                <span className={s.claimTag}>
                  <span className={cx(s.claimDot, DOT[l.tone])} aria-hidden="true" />
                  {l.name}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {off ? (
        <button type="button" className={cx(ui.btn, ui.primary, ui.block)} onClick={onTryAgain}>
          Try again
        </button>
      ) : null}

      {sug && !off ? (
        <section className={s.suggest} aria-label="Suggested reply" data-tour="suggested">
          <h4 className={s.suggestLabel}>{holding ? "Holding reply" : "Suggested reply"}</h4>
          <p className={s.suggestText}>{sug.text}</p>
          {sug.recheckDecision === "ALLOW" ? (
            <Tag tone="good">
              <CircleCheck aria-hidden="true" />
              Checked against your docs
            </Tag>
          ) : (
            <Tag tone="amber">{note ? `Double-check: ${note}` : "Checked: double-check before sending"}</Tag>
          )}
        </section>
      ) : null}

      {fixable && !stale ? (
        <button type="button" className={s.fixLink} onClick={onFixDoc} data-tour="fix-link">
          Fix the doc that caused this
        </button>
      ) : null}

      {needsAck ? (
        <div className={s.stack}>
          <label className={s.ack}>
            <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} />
            <span>I&apos;ve checked and want to send it</span>
          </label>
          <button type="button" className={cx(ui.btn, ui.outline, ui.block)} disabled={!ack} onClick={onSendAnyway}>
            Send anyway
          </button>
        </div>
      ) : null}

      {!off ? (
        <div className={s.actions}>
          {sug ? (
            <button type="button" className={cx(ui.btn, ui.primary, ui.lg)} onClick={onUseReply}>
              {holding ? "Use holding reply" : "Use this reply"}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={cx(ui.btn, ui.outline, ui.lg)} onClick={() => onView("why")}>
            Why?
          </button>
        </div>
      ) : null}
    </div>
  );
}
