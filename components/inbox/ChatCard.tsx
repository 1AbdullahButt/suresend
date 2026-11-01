"use client";
import { useEffect, useRef } from "react";
import { ArrowUp, Check, Lock } from "lucide-react";
import type { Rail, Ticket } from "@/lib/engine/types";
import type { SendState, SentMessage } from "@/lib/client/useSureSend";
import type { StoredResult } from "@/lib/client/types";
import { OUTCOME } from "@/lib/client/outcome";
import { cx, OutcomeTag, ui } from "@/components/ui/atoms";
import { PresetMenu } from "./PresetMenu";
import { RailSelect } from "./RailSelect";
import { ticketMeta } from "./ticketMeta";
import s from "./inbox.module.css";

const MAX_DRAFT = 1000;

/**
 * The chat card (design v2): title, bubbles and a pill composer whose round Send button runs the check
 * (POST /api/send). A held send greys the button out ("Send (held)") until the reply changes.
 */
export function ChatCard({
  ticket,
  rail,
  onRail,
  draft,
  onDraft,
  onSend,
  sendState,
  checking,
  sent,
  stored,
  docsEdited,
  overlay,
  agentOpen,
  onToggleAgent,
}: {
  ticket: Ticket;
  rail: Rail;
  onRail: (r: Rail) => void;
  draft: string;
  onDraft: (t: string) => void;
  onSend: () => void;
  sendState: SendState;
  checking: boolean;
  sent: SentMessage[];
  stored: StoredResult | null;
  /** Any doc edited in this demo: the hint's "the docs say 1" may no longer be true, so it's hidden. */
  docsEdited: boolean;
  overlay: boolean;
  agentOpen: boolean;
  onToggleAgent: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const meta = ticketMeta(ticket.id);
  const held = sendState.kind === "blocked";
  const busy = sendState.kind === "sending" || checking;
  const empty = !draft.trim();
  const hint =
    meta.draftHint && rail === meta.draftHint.rail && draft === ticket.draft && !docsEdited && !stored && !held && sent.length === 0
      ? meta.draftHint.text
      : null;

  // Grow the pill composer with its text (up to the CSS max-height).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [draft]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [sent.length]);

  const railLabel = rail === "unknown" ? "rail unknown" : `${rail} rail`;

  return (
    <main className={cx(s.card, s.chat)} aria-label="Conversation">
      <div className={s.chatHead}>
        <div className={s.chatTitle}>
          <span className={s.chatWho}>
            {ticket.customer} ·
            <RailSelect value={rail} onChange={onRail} />
          </span>
          <h1>Failed transfer</h1>
          <span className={s.chatSub}>Messenger · today {meta.time}</span>
        </div>
        {overlay ? (
          <button
            type="button"
            className={cx(ui.btn, ui.outline, ui.sm, s.agentToggle)}
            aria-expanded={agentOpen}
            onClick={onToggleAgent}
          >
            {stored ? (
              <span className={s.toggleTag}>
                <OutcomeTag decision={stored.result.decision} label={OUTCOME[stored.result.decision].name} />
              </span>
            ) : null}
            <span>Slite Agent</span>
          </button>
        ) : null}
      </div>

      <div ref={threadRef} className={s.thread}>
        <div className={s.bubbleIn}>{ticket.message}</div>
        {sent.map((m, i) => (
          <div key={i} className={s.outWrap}>
            <div className={s.bubbleOut}>{m.text}</div>
            {/* Only the latest sent bubble is a live status, so the confirmation is announced once. */}
            {i === sent.length - 1 ? (
              <p className={s.sentNote} role="status">
                <Check aria-hidden="true" strokeWidth={2.4} />
                Sent · checked by Slite Agent
              </p>
            ) : (
              <p className={s.sentNote}>
                <Check aria-hidden="true" strokeWidth={2.4} />
                Checked by Slite Agent
              </p>
            )}
          </div>
        ))}
        {held && draft ? (
          <div className={s.heldPreview} aria-hidden="true">
            {draft}
          </div>
        ) : null}
      </div>

      <div className={s.composer} data-tour="composer">
        {held ? (
          <p className={s.heldTag} role="status">
            <Lock aria-hidden="true" strokeWidth={2.2} />
            Held by Slite Agent: see the panel
          </p>
        ) : null}
        <div className={s.composeRow}>
          <label htmlFor="reply" className="sr-only">
            Your reply
          </label>
          <textarea
            id="reply"
            ref={inputRef}
            rows={1}
            className={s.input}
            value={draft}
            maxLength={MAX_DRAFT}
            placeholder="Type a reply…"
            spellCheck={false}
            aria-describedby={hint ? "reply-hint" : undefined}
            onChange={(e) => onDraft(e.target.value)}
          />
          <button
            type="button"
            className={s.send}
            aria-label={held ? "Send (held)" : "Send"}
            disabled={held || empty || busy}
            aria-busy={busy}
            onClick={onSend}
            data-tour="send"
          >
            {busy ? <span className={s.spin} aria-hidden="true" /> : <ArrowUp aria-hidden="true" strokeWidth={2.2} />}
          </button>
        </div>
        <div className={s.composeFoot}>
          {hint ? (
            <p id="reply-hint" className={s.draftHint}>
              {hint}
            </p>
          ) : (
            <span />
          )}
          <PresetMenu
            ticketId={ticket.id}
            current={draft}
            onPick={(text) => {
              onDraft(text);
              inputRef.current?.focus();
            }}
          />
        </div>
      </div>
    </main>
  );
}
