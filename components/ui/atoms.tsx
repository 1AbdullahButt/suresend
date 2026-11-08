import { CircleArrowUp, CircleCheck, CloudOff, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { OverallDecision } from "@/lib/engine/types";
import { OUTCOME, type OutcomeTone } from "@/lib/client/outcome";
import s from "./ui.module.css";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const ui = s;

export const TONE_ICON: Record<OutcomeTone, LucideIcon> = {
  good: CircleCheck,
  check: TriangleAlert,
  hold: OctagonAlert,
  ask: CircleArrowUp,
  off: CloudOff,
};

export const TONE_TEXT: Record<OutcomeTone, string | undefined> = {
  good: s.toneGood,
  check: s.toneCheck,
  hold: s.toneHold,
  ask: s.toneAsk,
  off: s.toneOff,
};

/** The outcome word in a white pill (colour never carries the meaning alone). */
export function OutcomeTag({ decision, label }: { decision: OverallDecision; label?: string }) {
  const meta = OUTCOME[decision];
  const Icon = TONE_ICON[meta.tone];
  return (
    <span className={cx(s.outcomeTag, TONE_TEXT[meta.tone])}>
      <Icon aria-hidden="true" strokeWidth={2.4} />
      {label ?? meta.name}
    </span>
  );
}

/** The SureSend mark: the only place the accent appears. Own shield glyph, not Slite's. */
export function Mark({ small, check = true }: { small?: boolean; check?: boolean }) {
  const size = small ? 15 : 18;
  return (
    <span className={cx(s.mark, small && s.markSm)} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        {check ? <path d="M9 12l2 2 4-4" /> : null}
      </svg>
    </span>
  );
}

export type TagTone = "good" | "ask" | "amber" | "neutral" | "ink";

/** `wrap`: a long tag runs onto a second line instead of being cut off ("Replaces Outgoing Transfers: Reversal SOP for instant"). */
export function Tag({ tone, children, title, wrap = false }: { tone: TagTone; children: React.ReactNode; title?: string; wrap?: boolean }) {
  const cls = { good: s.tagGood, ask: s.tagAsk, amber: s.tagAmber, neutral: s.tagNeutral, ink: s.tagInk }[tone];
  return (
    <span className={cx(s.tag, cls, wrap && s.tagWrap)} title={title}>
      {children}
    </span>
  );
}
