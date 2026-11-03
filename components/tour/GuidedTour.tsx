"use client";
// Guided demo tour (SPEC §15 P1, §16 demo script), design v2: Send is the check. A non-modal coach mark
// (role="dialog" without aria-modal) anchored to the element it talks about, with a highlight ring. Steps may select a
// ticket, fill the canonical draft, switch views and re-check, but nothing is sent or edited without a button press.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, X } from "lucide-react";
import type { SureSend } from "@/lib/client/useSureSend";
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
  /** An element the card must never cover (scrolled into view; on phones the card takes the other half of the screen). */
  keepClear?: (ag: SureSend) => string | null;
  enter?: (c: Ctx) => void;
}

const held = (ag: SureSend, id: string) => ag.ticket?.id === id && ag.sendState.kind === "blocked";

const STEPS: Step[] = [
  {
    title: "Send runs the check",
    body: (
      <>
        Léa&apos;s transfer was an <b>instant transfer</b>, and the reply promises <b>4 business days</b>. Press <b>Send</b>: SureSend
        checks the reply against your docs first, and holds it if it&apos;s wrong.
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
        The AI read the reply and the docs, and quoted them. <b>Fixed rules</b> made the call: the instant-transfer exception says it replaces the SOP for
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
        The held one was not sent.
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
        Lukas&apos;s transfer type is <b>unknown</b>, and instant and standard transfers have different timelines. SureSend asks you to confirm
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
        Léa&apos;s agent got <b>4 days</b> from the old SOP. SureSend suggests one added line to fix that doc, so the next agent gets it
        right. Nothing changes until you approve it.
      </>
    ),
    target: (ag) => (ag.fixReview ? ['[data-tour="fix-review"]'] : ['[data-tour="fix-link"]', '[data-tour="decision"]']),
    keepClear: (ag) => (ag.fixReview?.status === "ready" ? '[data-tour="fix-approve"]' : null),
    // Léa's Hold tells the story best (D-039). The step's own button holds the reply if needed, then opens the review.
    enter: ({ ag, showAgent }) => {
      if (!ag.fixReview) {
        ag.actions.prepareTicket("TCK-9001");
        ag.actions.setTab("check");
      }
      showAgent();
    },
  },
  {
    title: "Change the policy, watch the answer change",
    body: (
      <>
        <p>The answer comes from the doc. Nothing is hard-coded.</p>
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

/**
 * The ring for `el` (D-040): only around the part that's on screen, clipped by every scrolling or clipping ancestor and
 * the viewport. Unclipped sides get the usual 4px gap; clipped sides sit 8px inside, so neither the line nor its halo
 * spills over a panel's edge. Null when nothing is visible, or when something other than the target or the tour card
 * covers the visible part's centre (the phone sheet or its scrim over a chat target, the Demo menu, a dialog).
 */
function ringFor(el: HTMLElement, card: HTMLElement | null): Box | null {
  const r = el.getBoundingClientRect();
  let top = r.top;
  let left = r.left;
  let right = r.right;
  let bottom = r.bottom;
  const clip = (c: { top: number; left: number; right: number; bottom: number }) => {
    top = Math.max(top, c.top);
    left = Math.max(left, c.left);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") clip(p.getBoundingClientRect());
  }
  clip({ top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight });
  if (right - left < 1 || bottom - top < 1) return null;

  const cx0 = (left + right) / 2;
  const cy0 = (top + bottom) / 2;
  const front = document.elementsFromPoint(cx0, cy0).find((n) => !card?.contains(n));
  if (front && !el.contains(front) && !front.contains(el)) return null;

  const gap = (cut: boolean) => (cut ? -8 : 4);
  const t = top - gap(top > r.top + 0.5);
  const l = left - gap(left > r.left + 0.5);
  const b = bottom + gap(bottom < r.bottom - 0.5);
  const rt = right + gap(right < r.right - 0.5);
  return rt - l > 0 && b - t > 0 ? { top: t, left: l, width: rt - l, height: b - t } : null;
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
  paused,
  onStep,
  onStart,
  onClose,
  onResume,
}: {
  state: TourState;
  ag: SureSend;
  overlay: boolean;
  /** The Demo menu is open: no ring, and the card waits as a one-line bar (D-040). */
  paused: boolean;
  onStep: (step: number) => void;
  onStart: () => void;
  onClose: () => void;
  /** "Resume tour" on the paused bar: closes the Demo menu. */
  onResume: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 80, left: 16 });
  // Step 6 only: DOC-103 was already edited when the step opened, so it offers a restore before the numbered steps.
  const [startEdited, setStartEdited] = useState(false);
  const [phoneTop, setPhoneTop] = useState(false);
  // Phones: the card covers half the screen, so it can shrink to a one-line bar ("Show steps" brings it back).
  const [narrow, setNarrow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const showBtnRef = useRef<HTMLButtonElement>(null);
  // Set only by the Hide/Show buttons, so an automatic collapse never pulls focus out of the doc being edited.
  const focusAfterToggle = useRef<"show" | "title" | null>(null);
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "show") showBtnRef.current?.focus();
    if (target === "title") titleRef.current?.focus();
  }, [collapsed]);
  const scrolledFor = useRef<string>("");
  const scrolledClear = useRef<string>("");
  const agRef = useRef(ag);
  agRef.current = ag;
  // Paused under the Demo menu: the layout loop stops (no scrolling, no moving), and nothing about the step changes, so
  // closing the menu brings back the same step, card and ring. "Resume tour" also moves focus back to the step title.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const focusAfterResume = useRef(false);
  useEffect(() => {
    if (paused || !focusAfterResume.current) return;
    focusAfterResume.current = false;
    titleRef.current?.focus();
  }, [paused]);

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
    setCollapsed(false);
    if (state.step === EDIT_STEP) setStartEdited(Boolean(agRef.current.overrides["DOC-103"]));
    step.enter?.(ctx());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per step: ctx() and the step are read for that step, not watched
  }, [isTour, state.step, ready]);

  // Step 6 on a phone: tapping into the doc to edit it shrinks the card, so the text and the save buttons stay reachable.
  useEffect(() => {
    if (!isTour || state.step !== EDIT_STEP || !narrow) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement && !cardRef.current?.contains(t)) setCollapsed(true);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [isTour, state.step, narrow]);

  // Step 5 on a phone: while the fix review is open it gets the screen (the card is a bar); when it closes, the card is back.
  const reviewReady = ag.fixReview?.status === "ready";
  const wasReviewReady = useRef(false);
  useEffect(() => {
    const closed = wasReviewReady.current && !reviewReady;
    wasReviewReady.current = reviewReady;
    if (!isTour || state.step !== FIX_STEP || !narrow) return;
    if (closed) focusAfterToggle.current = "title";
    setCollapsed(reviewReady);
  }, [isTour, state.step, narrow, reviewReady]);

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
      if (pausedRef.current) return;
      const sel = isTour && step ? step.target(agRef.current) : selectors;
      const key = sel.join(",");
      const el = findTarget(sel) ?? (isTour ? document.querySelector<HTMLElement>(sel[0] ?? "") : null);
      if (el && isTour && scrolledFor.current !== key) {
        scrolledFor.current = key;
        el.scrollIntoView({ block: "nearest" });
      }
      const clearSel = isTour && step?.keepClear ? step.keepClear(agRef.current) : null;
      const clearEl = clearSel ? document.querySelector<HTMLElement>(clearSel) : null;
      if (!clearEl) scrolledClear.current = "";
      else if (scrolledClear.current !== clearSel) {
        scrolledClear.current = clearSel ?? "";
        clearEl.scrollIntoView({ block: "nearest" });
      }
      const r = el?.getBoundingClientRect();
      // `next` (the whole target) places the card; the ring shows only what's visible and uncovered.
      const next = r && r.width > 0 ? { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 } : null;
      const ring = el && next ? ringFor(el, cardRef.current) : null;
      setBox((b) =>
        b && ring && Math.abs(b.top - ring.top) < 1 && Math.abs(b.left - ring.left) < 1 && Math.abs(b.width - ring.width) < 1 && Math.abs(b.height - ring.height) < 1
          ? b
          : ring,
      );
      // Phones: the card docks at the bottom, or at the top when the anchor (or the element to keep clear) is in the lower half.
      const a = clearEl?.getBoundingClientRect() ?? r;
      setPhoneTop(Boolean(a && a.top + a.height / 2 > window.innerHeight / 2 && window.innerWidth < 700));
      setNarrow(window.innerWidth < 700);
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
    // The first-visit offer steps aside while the Demo menu is open, and comes back when it closes.
    if (paused) return null;
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
            Catch a wrong reply at Send, see why the rules held it, send a checked one, handle an unknown transfer type, fix the doc behind it and
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

  // Step 5: review the fix for Léa's held 4-day reply. If it wasn't held this session, hold it first (saved responses).
  const showFix = async () => {
    if (overlay) ag.actions.setPanelOpen(true);
    const prior = ag.heldReplies["TCK-9001"];
    if (prior?.fixable) {
      ag.actions.openFixReview({ ticketId: "TCK-9001", rail: prior.rail, draft: prior.draft });
      return;
    }
    ag.actions.prepareTicket("TCK-9001", CANONICAL_DRAFT);
    await ag.actions.send();
    agRef.current.actions.openFixReview({ ticketId: "TCK-9001", rail: "instant", draft: CANONICAL_DRAFT });
  };

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

  if (paused) {
    return (
      <div ref={cardRef} className={cx(s.card, s.cardMini, s.cardPaused)} role="dialog" aria-labelledby={titleId}>
        <div className={s.top}>
          <span className={s.counter}>
            {n}/{TOUR_STEPS}
          </span>
          <h2 ref={titleRef} id={titleId} className={s.miniTitle} tabIndex={-1}>
            {step.title}
          </h2>
          <button
            type="button"
            className={s.toggle}
            onClick={() => {
              focusAfterResume.current = true;
              onResume();
            }}
          >
            Resume tour
          </button>
          <button type="button" className={s.close} aria-label="Close tour" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (narrow && collapsed) {
    return (
      <>
        {box ? <div className={s.ring} style={box} aria-hidden="true" /> : null}
        <div ref={cardRef} className={cx(s.card, s.cardMini, phoneTop && s.cardTop)} style={pos} role="dialog" aria-labelledby={titleId}>
          <div className={s.top}>
            <span className={s.counter}>
              {n}/{TOUR_STEPS}
            </span>
            <h2 ref={titleRef} id={titleId} className={s.miniTitle} tabIndex={-1}>
              {step.title}
            </h2>
            <button
              ref={showBtnRef}
              type="button"
              className={s.toggle}
              aria-expanded={false}
              onClick={() => {
                focusAfterToggle.current = "title";
                setCollapsed(false);
              }}
            >
              Show steps
            </button>
            <button type="button" className={s.close} aria-label="Close tour" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
        </div>
      </>
    );
  }

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
          {narrow ? (
            <button
              type="button"
              className={s.toggle}
              aria-expanded={true}
              aria-controls={bodyId}
              onClick={() => {
                focusAfterToggle.current = "show";
                setCollapsed(true);
              }}
            >
              Hide steps
            </button>
          ) : null}
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
                Held. Nothing reached Léa, and one wrong reply is counted as stopped.
              </span>
            ) : (
              sendFor("TCK-9001", "Press Send for me")
            )}
          </div>
        ) : null}

        {state.step === 1 && !hasHold ? (
          <div className={s.actions}>
            <span className={s.note}>There&apos;s no held reply for Léa yet.</span>
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
                Sent · checked by SureSend. The Demo menu now shows one wrong reply stopped.
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
              <span className={s.note}>Go back to step 1 to hold Léa&apos;s wrong reply first.</span>
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
            ) : (
              <button type="button" className={s.tbtn} disabled={busy} onClick={() => void showFix()}>
                Show me
              </button>
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
              <>
                {/* Hidden on phones, where the card must leave the doc's text reachable (D-039). */}
                <p className={cx(s.note, s.wideOnly)}>
                  Tip: Save and re-check (without verifying) gives Double-check, because SureSend trusts unapproved edits less.
                </p>
                {/* The tour's last line points to the MCP connector (D-039). */}
                <p className={s.closing}>
                  AI agents can call the same check: <b>Demo menu → Use it from Claude</b>.
                </p>
              </>
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
