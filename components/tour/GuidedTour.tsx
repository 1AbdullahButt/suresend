"use client";
// Guided demo tour (SPEC §15 P1, §16 demo script), design v2: Send is the check. A non-modal coach mark
// (role="dialog" without aria-modal) anchored to the element it talks about, with a highlight ring. Steps may select a
// ticket, fill the canonical draft, switch views and re-check, but nothing is sent or edited without a button press.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, X } from "lucide-react";
import type { SureSend } from "@/lib/client/useSureSend";
import { findFixSource } from "@/lib/fix/source";
import { cx } from "@/components/ui/atoms";
import s from "./tour.module.css";

export const CANONICAL_DRAFT = "Failed transfers are reversed within 4 business days.";
export const TOUR_STEPS = 6;
/** 0-based index of "Fix the doc that caused this" (D-037) and of the live doc edit after it. */
const FIX_STEP = 4;
const EDIT_STEP = 5;

export interface TourState {
  mode: "offer" | "tour";
  step: number; // 0-based
}

interface Ctx {
  ag: SureSend;
  showAgent: () => void;
  hideAgent: () => void;
}

interface Step {
  title: string;
  body: ReactNode;
  target: (ag: SureSend) => string[];
  enter?: (c: Ctx) => void;
}

const held = (ag: SureSend, id: string) => ag.ticket?.id === id && ag.sendState.kind === "blocked";

const STEPS: Step[] = [
  {
    title: "Send runs the check",
    body: (
      <>
        Ayesha&apos;s transfer went over the <b>instant rail</b>, and the reply promises <b>4 business days</b>. Press <b>Send</b>: Slite
        Agent checks the reply against your docs first, and holds it if it&apos;s wrong.
      </>
    ),
    target: (ag) => (held(ag, "TCK-9001") ? ['[data-tour="decision"]'] : ['[data-tour="send"]', '[data-tour="composer"]']),
    enter: ({ ag, hideAgent }) => {
      ag.actions.prepareTicket("TCK-9001", CANONICAL_DRAFT);
      ag.actions.setTab("check");
      hideAgent();
    },
  },
  {
    title: "Why it's on hold",
    body: (
      <>
        The AI only read the docs and quoted them. <b>Fixed rules</b> made the call: the instant-rail exception says it replaces the SOP for
        instant transfers, so its 1 business day applies. The SOP is verified too, but verified or newer never breaks a tie.
      </>
    ),
    target: () => ['[data-tour="why-docs"]', '[data-tour="decision"]'],
    enter: ({ ag, showAgent }) => {
      ag.actions.setTab("check");
      if (ag.ticket?.id === "TCK-9001" && ag.results["TCK-9001"]) ag.actions.setView("why");
      showAgent();
    },
  },
  {
    title: "Use the suggested reply",
    body: (
      <>
        The suggested reply was already checked against your docs. Use it and press Send: this time the check passes and the reply goes out.
        The held one never reached Ayesha.
      </>
    ),
    target: (ag) => (ag.sendState.kind === "sent" ? ['[data-tour="payoff"]'] : ['[data-tour="suggested"]', '[data-tour="decision"]']),
    enter: ({ ag, showAgent }) => {
      ag.actions.setTab("check");
      ag.actions.setView("main");
      showAgent();
    },
  },
  {
    title: "Ask first: no guessing",
    body: (
      <>
        Usman&apos;s rail is <b>unknown</b>, and instant and standard transfers have different timelines. Slite Agent asks you to confirm
        instead of guessing, and its holding reply contains no timeline at all.
      </>
    ),
    target: (ag) => (held(ag, "TCK-9002") ? ['[data-tour="suggested"]', '[data-tour="decision"]'] : ['[data-tour="send"]', '[data-tour="composer"]']),
    enter: ({ ag, hideAgent }) => {
      ag.actions.prepareTicket("TCK-9002", CANONICAL_DRAFT);
      ag.actions.setTab("check");
      hideAgent();
    },
  },
  {
    title: "Fix the doc that caused this",
    body: (
      <>
        Usman&apos;s reply copied <b>4 business days</b> from the SOP. It covers all rails but never mentions the instant-rail exception.
        SureSend drafts a one-line fix to that doc and rechecks it. As with fixes reviewed in Slite&apos;s Triage, nothing changes until a
        person approves it.
      </>
    ),
    target: (ag) => (ag.fixReview ? ['[data-tour="fix-review"]'] : ['[data-tour="fix-link"]', '[data-tour="decision"]']),
    enter: ({ ag, showAgent }) => {
      // Stay on the held reply from step 4; if a review from earlier is open, keep it.
      if (!ag.fixReview) {
        ag.actions.setTab("check");
        ag.actions.setView("main");
      }
      showAgent();
    },
  },
  {
    title: "Change the policy, watch the answer change",
    body: (
      <>
        <p>SureSend reads your docs live. Nothing is hard-coded.</p>
        <ol className={s.steps}>
          <li>
            In the doc, change <b>1 business day</b> to <b>2 business days</b>.
          </li>
          <li>
            Click <b>Save and verify</b>.
          </li>
          <li>
            Press <b>Send</b> on the 4-day reply.
          </li>
        </ol>
        <p>It&apos;s still held, and the suggested reply now says 2 days.</p>
      </>
    ),
    target: (ag) =>
      ag.overrides["DOC-103"] && held(ag, "TCK-9001") ? ['[data-tour="decision"]'] : ['[data-tour="doc-DOC-103"]', '[data-tour="agent"]'],
    enter: ({ ag, showAgent }) => {
      // Start from the canonical Hold (a re-check, not a send). If DOC-103 is already edited here, leave it alone: the step
      // offers an explicit restore instead of changing it silently (D-024).
      ag.actions.prepareTicket("TCK-9001", CANONICAL_DRAFT);
      if (!ag.overrides["DOC-103"]) void ag.actions.runCheck();
      ag.actions.openDoc("DOC-103");
      showAgent();
    },
  },
];

function findTarget(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
    }
  }
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_W = 340;

/** Prefer the left of the target (the agent card is on the right), then right, below, above. */
function placeCard(t: Box | null, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minTop = 72;
  const maxTop = Math.max(minTop, vh - cardH - 52);
  if (!t) return { top: minTop + 8, left: Math.max(8, vw - CARD_W - 24) };
  const clampTop = (y: number) => Math.min(Math.max(y, minTop), maxTop);
  if (t.left - CARD_W - 20 >= 8) return { top: clampTop(t.top), left: t.left - CARD_W - 20 };
  if (t.left + t.width + 20 + CARD_W <= vw - 8) return { top: clampTop(t.top), left: t.left + t.width + 20 };
  const left = Math.min(Math.max(8, t.left), vw - CARD_W - 8);
  if (t.top + t.height + 12 + cardH <= vh - 48) return { top: t.top + t.height + 12, left };
  return { top: clampTop(t.top - cardH - 12), left };
}

export function GuidedTour({
  state,
  ag,
  overlay,
  onStep,
  onStart,
  onClose,
}: {
  state: TourState;
  ag: SureSend;
  overlay: boolean;
  onStep: (step: number) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 80, left: 16 });
  // Step 6 only: DOC-103 was already edited when the step opened, so it offers a restore before the numbered steps.
  const [startEdited, setStartEdited] = useState(false);
  const [phoneTop, setPhoneTop] = useState(false);
  const scrolledFor = useRef<string>("");
  const agRef = useRef(ag);
  agRef.current = ag;

  const ctx = useCallback(
    (): Ctx => ({
      ag: agRef.current,
      showAgent: () => {
        if (overlay) agRef.current.actions.setPanelOpen(true);
      },
      hideAgent: () => {
        if (overlay) agRef.current.actions.setPanelOpen(false);
      },
    }),
    [overlay],
  );

  const isTour = state.mode === "tour";
  const step = STEPS[state.step];
  const ready = Boolean(ag.seed);

  useEffect(() => {
    if (!isTour || !ready || !step) return;
    if (state.step === EDIT_STEP) setStartEdited(Boolean(agRef.current.overrides["DOC-103"]));
    step.enter?.(ctx());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTour, state.step, ready]);

  // Restored (by the tour button or Reset demo): show the numbered steps, and keep them when the visitor edits the doc.
  const doc103Edited = Boolean(ag.overrides["DOC-103"]);
  useEffect(() => {
    if (!doc103Edited) setStartEdited(false);
  }, [doc103Edited]);

  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(t);
  }, [state.mode, state.step]);

  // Esc closes the tour unless another dialog/tooltip handled it or has focus (D-024).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const active = document.activeElement;
      const inOtherDialog = !!active && !cardRef.current?.contains(active) && !!active.closest('[role="dialog"], [role="alertdialog"], [role="tooltip"]');
      if (!inOtherDialog) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const selectors = isTour && step ? step.target(agRef.current) : ['[data-tour="tour-button"]', '[data-tour="demo-menu"]'];
    const update = () => {
      const sel = isTour && step ? step.target(agRef.current) : selectors;
      const key = sel.join(",");
      const el = findTarget(sel) ?? (isTour ? document.querySelector<HTMLElement>(sel[0] ?? "") : null);
      if (el && isTour && scrolledFor.current !== key) {
        scrolledFor.current = key;
        el.scrollIntoView({ block: "nearest" });
      }
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 } : null;
      setBox((b) =>
        b && next && Math.abs(b.top - next.top) < 1 && Math.abs(b.left - next.left) < 1 && Math.abs(b.width - next.width) < 1 && Math.abs(b.height - next.height) < 1
          ? b
          : next,
      );
      setPhoneTop(Boolean(r && r.top + r.height / 2 > window.innerHeight / 2 && window.innerWidth < 700));
      const h = cardRef.current?.offsetHeight ?? 240;
      const p = placeCard(next, h);
      setPos((o) => (Math.abs(o.top - p.top) < 1 && Math.abs(o.left - p.left) < 1 ? o : p));
    };
    update();
    const id = window.setInterval(update, 200);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, [isTour, step]);

  const busy = ag.anyChecking || ag.sendState.kind === "sending";
  const titleId = "tour-title";
  const bodyId = "tour-body";

  if (!isTour) {
    return (
      <>
        {box ? <div className={s.ring} style={box} aria-hidden="true" /> : null}
        <div ref={cardRef} className={cx(s.card, phoneTop && s.cardTop)} style={pos} role="dialog" aria-labelledby={titleId} aria-describedby={bodyId}>
          <div className={s.top}>
            <span className={s.counter}>Guided tour · {TOUR_STEPS} steps</span>
            <span className={s.spacer} />
            <button type="button" className={s.close} aria-label="Close tour offer" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
          <h2 ref={titleRef} id={titleId} className={s.title} tabIndex={-1}>
            New here? Take the 2-minute tour
          </h2>
          <p id={bodyId} className={s.body}>
            Catch a wrong reply at Send, see why the rules held it, send the right one, handle an unknown rail, fix the doc behind it and
            edit a doc live. Skip at any step.
          </p>
          <div className={s.nav}>
            <button type="button" className={cx(s.tbtn, s.tghost)} onClick={onClose}>
              Not now
            </button>
            <span className={s.spacer} />
            <button type="button" className={s.tbtn} onClick={onStart}>
              Start tour
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!step) return null;
  const n = state.step + 1;
  const last = n === TOUR_STEPS;
  const t1 = ag.ticket?.id === "TCK-9001";
  const t2 = ag.ticket?.id === "TCK-9002";
  const sent = t1 && ag.sendState.kind === "sent";
  const hasHold = t1 && ag.stored?.result.decision === "HOLD";
  const restoreFirst = state.step === EDIT_STEP && startEdited;
  // The current reply's result points to a doc that can be fixed (D-037).
  const fixable = !!ag.stored && findFixSource(ag.stored.result) !== null;

  const sendFor = (id: string, label: string) => (
    <button
      type="button"
      className={s.tbtn}
      disabled={busy}
      onClick={() => {
        if (ag.ticket?.id !== id || !ag.draft.trim()) ag.actions.prepareTicket(id, CANONICAL_DRAFT);
        void ag.actions.send();
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      {box ? <div className={s.ring} style={box} aria-hidden="true" /> : null}
      <div ref={cardRef} className={cx(s.card, phoneTop && s.cardTop)} style={pos} role="dialog" aria-labelledby={titleId} aria-describedby={bodyId}>
        <div className={s.top}>
          <span className={s.counter}>
            Step {n} of {TOUR_STEPS}
          </span>
          <span className={s.dots} aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={cx(s.dot, i <= state.step && s.dotOn)} />
            ))}
          </span>
          <button type="button" className={s.close} aria-label="Close tour" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <h2 ref={titleRef} id={titleId} className={s.title} tabIndex={-1}>
          {step.title}
        </h2>
        <div id={bodyId} className={s.body}>
          {restoreFirst ? <p>This doc was already changed. Restore it to start fresh.</p> : step.body}
        </div>

        {state.step === 0 ? (
          <div className={s.actions}>
            {held(ag, "TCK-9001") ? (
              <span className={s.done}>
                <CircleCheck aria-hidden="true" />
                Held. Nothing reached Ayesha, and one wrong reply is counted as stopped.
              </span>
            ) : (
              sendFor("TCK-9001", "Press Send for me")
            )}
          </div>
        ) : null}

        {state.step === 1 && !hasHold ? (
          <div className={s.actions}>
            <span className={s.note}>There&apos;s no held reply for Ayesha yet.</span>
            <button
              type="button"
              className={s.tbtn}
              disabled={busy}
              onClick={() => {
                if (!t1 || !ag.draft.trim()) ag.actions.prepareTicket("TCK-9001", CANONICAL_DRAFT);
                void ag.actions.send().then(() => agRef.current.actions.setView("why"));
                if (overlay) ag.actions.setPanelOpen(true);
              }}
            >
              Press Send for me, then explain
            </button>
          </div>
        ) : null}

        {state.step === 2 ? (
          <div className={s.actions}>
            {sent ? (
              <span className={s.done}>
                <CircleCheck aria-hidden="true" />
                Sent · checked by Slite Agent. The Demo menu now shows one wrong reply stopped.
              </span>
            ) : hasHold && ag.stored?.result.suggestion ? (
              <button
                type="button"
                className={s.tbtn}
                disabled={busy}
                onClick={() => {
                  ag.actions.applySafeReply();
                  void ag.actions.send();
                }}
              >
                Use this reply and send it
              </button>
            ) : (
              <span className={s.note}>Go back to step 1 to hold Ayesha&apos;s wrong reply first.</span>
            )}
          </div>
        ) : null}

        {state.step === 3 ? (
          <div className={s.actions}>
            {t2 && ag.sendState.kind === "blocked" ? (
              <span className={s.done}>
                <CircleCheck aria-hidden="true" />
                Ask first: the holding reply has no timeline.
              </span>
            ) : (
              sendFor("TCK-9002", "Press Send for me")
            )}
          </div>
        ) : null}

        {state.step === FIX_STEP ? (
          <div className={s.actions}>
            {ag.fixReview?.status === "ready" ? (
              <span className={s.done}>
                <CircleCheck aria-hidden="true" />
                The suggested fix, with only the changed line. Approve or dismiss it; either works for the tour.
              </span>
            ) : ag.fixReview?.status === "loading" ? null : ag.fixApproved ? (
              <span className={s.done}>
                <CircleCheck aria-hidden="true" />
                Fix approved: {ag.fixApproved.title} now names the exception, so agents stop copying 4 days for instant transfers.
              </span>
            ) : fixable ? (
              <button
                type="button"
                className={s.tbtn}
                disabled={busy}
                onClick={() => {
                  ag.actions.openFixReview();
                  if (overlay) ag.actions.setPanelOpen(true);
                }}
              >
                Show me the fix
              </button>
            ) : (
              <p className={s.note}>Go back to step 4 to hold Usman&apos;s reply first.</p>
            )}
          </div>
        ) : null}

        {state.step === EDIT_STEP ? (
          <div className={s.actions}>
            {restoreFirst ? (
              <button
                type="button"
                className={s.tbtn}
                disabled={busy}
                onClick={() => {
                  setStartEdited(false);
                  ag.actions.restoreSource("DOC-103");
                  ag.actions.openDoc("DOC-103");
                }}
              >
                Restore the doc
              </button>
            ) : (
              <p className={s.note}>
                Tip: Save and re-check (without verifying) gives Double-check, because SureSend trusts unapproved edits less.
              </p>
            )}
          </div>
        ) : null}

        {busy ? (
          <span className={s.busy} aria-live="polite">
            <span className={s.spin} aria-hidden="true" />
            Checking…
          </span>
        ) : null}

        <div className={s.nav}>
          <button type="button" className={cx(s.tbtn, s.tghost)} onClick={onClose}>
            Skip tour
          </button>
          <span className={s.spacer} />
          {n > 1 ? (
            <button type="button" className={cx(s.tbtn, s.tout)} onClick={() => onStep(state.step - 1)}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          ) : null}
          <button type="button" className={s.tbtn} onClick={() => (last ? onClose() : onStep(state.step + 1))}>
            {last ? "Finish" : "Next"}
            {last ? null : <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  );
}
