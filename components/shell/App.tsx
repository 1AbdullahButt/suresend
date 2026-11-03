"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { useSureSend } from "@/lib/client/useSureSend";
import { canPersist, readJson, writeJson } from "@/lib/client/storage";
import { mostSevereClaim } from "@/lib/client/format";
import { cx, ui } from "@/components/ui/atoms";
import { LeftColumn } from "@/components/inbox/LeftColumn";
import { ChatCard } from "@/components/inbox/ChatCard";
import { AgentCard } from "@/components/agent/AgentCard";
import { CheckView } from "@/components/agent/CheckView";
import { DocsView } from "@/components/agent/DocsView";
import { GuidedTour, type TourState } from "@/components/tour/GuidedTour";
import { Header } from "./Header";
import { DemoMenu } from "./DemoMenu";
import s from "./shell.module.css";

export const DISCLAIMER = "Independent concept for Slite Agent · synthetic data · not affiliated with Slite";
const TOUR_SEEN_KEY = "suresend.tour.seen.v1";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function ResetDialog({ edited, onCancel, onConfirm }: { edited: number; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      className={s.dialogScrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-desc"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Tab") {
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button"));
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2 id="reset-title">Reset the demo?</h2>
        <p id="reset-desc">
          Restores every seed doc ({edited} edited) and clears this browser&apos;s numbers. This can&apos;t be undone.
        </p>
        <div className={s.dialogActions}>
          <button ref={cancelRef} type="button" className={cx(ui.btn, ui.outline, ui.sm)} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={cx(ui.btn, ui.primary, ui.sm)} onClick={onConfirm}>
            Reset and clear
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const ag = useSureSend();
  const { actions } = ag;
  const overlay = useMediaQuery("(max-width: 1099px)");
  const sheet = useMediaQuery("(max-width: 699px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tour, setTour] = useState<TourState | null>(null);
  const tourBtnRef = useRef<HTMLButtonElement>(null);
  const tourReturnRef = useRef<HTMLElement | null>(null);
  const agentReturnRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(actions.dismissToast);
  dismissRef.current = actions.dismissToast;

  const openAgent = useCallback(() => {
    if (!overlay) return;
    if (!ag.panelOpen) agentReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    actions.setPanelOpen(true);
  }, [overlay, ag.panelOpen, actions]);

  const closeAgent = useCallback(() => {
    actions.setPanelOpen(false);
    // After the render that lifts `inert` from the chat: an inert element can't take focus.
    requestAnimationFrame(() => agentReturnRef.current?.focus());
  }, [actions]);

  // Under 1100 px the agent card is a slide-over / bottom sheet: open it whenever Send starts a check or one finishes.
  // Changing the conversation closes it, since what it shows belongs to the other ticket; a tour step opens it itself.
  const sendKind = ag.sendState.kind;
  const checkingNow = ag.checking !== null;
  const ticketId = ag.ticket?.id;
  const touring = tour?.mode === "tour";
  const panelTicket = useRef(ticketId);
  useEffect(() => {
    const changed = panelTicket.current !== ticketId;
    panelTicket.current = ticketId;
    if (!overlay) return;
    if (changed) {
      if (!touring) actions.setPanelOpen(false);
      return;
    }
    if (checkingNow || sendKind === "blocked" || sendKind === "ack_required" || sendKind === "unavailable" || sendKind === "sent") {
      actions.setPanelOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to these changes only; touring is read, not watched
  }, [overlay, checkingNow, sendKind, ticketId]);

  useEffect(() => {
    if (!ag.toast) return;
    const t = window.setTimeout(dismissRef.current, 4000);
    return () => window.clearTimeout(t);
  }, [ag.toast]);

  // Guided tour: offered once on first visit, never to automated browsers (navigator.webdriver). Only when the answer can be
  // remembered: with storage blocked, "Not now" wouldn't survive a reload. The tour button and Demo menu still start it.
  const seedReady = Boolean(ag.seed);
  useEffect(() => {
    if (!seedReady) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    if (readJson<boolean>(TOUR_SEEN_KEY, false) || !canPersist()) return;
    writeJson(TOUR_SEEN_KEY, true);
    tourReturnRef.current = tourBtnRef.current;
    setTour({ mode: "offer", step: 0 });
  }, [seedReady]);

  const startTour = useCallback(() => {
    writeJson(TOUR_SEEN_KEY, true);
    setMenuOpen(false);
    setTour({ mode: "tour", step: 0 });
  }, []);

  const toggleTour = useCallback(() => {
    if (tour) {
      setTour(null);
      return;
    }
    tourReturnRef.current = tourBtnRef.current;
    startTour();
  }, [tour, startTour]);

  const closeTour = useCallback(() => {
    setTour(null);
    // Return focus to the trigger; on phones the header tour pill is hidden, so fall back to the Demo menu button.
    const visible = (el: HTMLElement | null | undefined) => !!el && document.contains(el) && el.offsetParent !== null;
    const candidates = [tourReturnRef.current, tourBtnRef.current, document.querySelector<HTMLElement>("[data-demo-menu-trigger]")];
    candidates.find(visible)?.focus();
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    document.querySelector<HTMLElement>("[data-demo-menu-trigger]")?.focus();
  }, []);

  const ticket = ag.ticket;
  const governingId = ag.stored ? (mostSevereClaim(ag.stored.result)?.governing?.sourceId ?? null) : null;

  const useReply = () => {
    actions.applySafeReply();
    // On phones/tablets the sheet hides the composer; close it so the new reply and Send are in view.
    if (overlay) actions.setPanelOpen(false);
  };

  return (
    <div className={s.app}>
      <Header ref={tourBtnRef} menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} onTour={toggleTour} tourOpen={tour !== null}>
        {menuOpen ? (
          <DemoMenu
            role={ag.role}
            onRole={(r) => void actions.switchRole(r)}
            metrics={ag.metrics}
            onReview={actions.review}
            onReviewFix={(docId) => {
              const last = ag.metrics.heldByDoc[docId]?.last;
              closeMenu();
              if (!last) return;
              actions.openFixReview(last);
              openAgent();
            }}
            ai={ag.lastAi}
            onTour={() => {
              tourReturnRef.current = tourBtnRef.current;
              startTour();
            }}
            onReset={() => setConfirmReset(true)}
            onClose={closeMenu}
            aboveTourBar={tour?.mode === "tour"}
          />
        ) : null}
      </Header>

      <div className={s.body}>
        {ag.seedError && !ag.seed ? (
          <div className={s.seedError} role="alert">
            <p>Couldn&apos;t load the demo: {ag.seedError}</p>
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void actions.loadSeed()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <LeftColumn
              tickets={ag.tickets}
              ticket={ticket}
              rail={ag.rail}
              onRail={actions.setRail}
              railOf={ag.railOf}
              results={ag.results}
              sendStateOf={ag.sendStateOf}
              isStale={ag.isStale}
              onSelect={actions.selectTicket}
            />
            {ticket ? (
              <ChatCard
                ticket={ticket}
                rail={ag.rail}
                onRail={actions.setRail}
                draft={ag.draft}
                onDraft={actions.setDraft}
                onSend={() => void actions.send()}
                sendState={ag.sendState}
                checking={ag.checking !== null}
                sent={ag.sent}
                stored={ag.stored}
                docsEdited={Object.keys(ag.overrides).length > 0}
                overlay={overlay}
                agentOpen={ag.panelOpen}
                onToggleAgent={() => (ag.panelOpen ? closeAgent() : openAgent())}
              />
            ) : (
              <main className={s.body} aria-label="Conversation" aria-busy="true" />
            )}
            {overlay && ag.panelOpen ? <div className={s.scrim} onClick={closeAgent} aria-hidden="true" /> : null}
            <AgentCard tab={ag.tab} onTab={actions.setTab} overlay={overlay} sheet={sheet} open={ag.panelOpen} onClose={closeAgent}>
              {ag.tab === "check" ? (
                <CheckView
                  stored={ag.stored}
                  staleReason={ag.staleReason}
                  rail={ag.rail}
                  checking={ag.checking}
                  sendState={ag.sendState}
                  ack={ag.ack}
                  onAck={actions.setAck}
                  onSendAnyway={() => void actions.send({ acknowledged: true })}
                  onTryAgain={() => void (ag.sendState.kind === "unavailable" ? actions.send() : actions.runCheck())}
                  onUseReply={useReply}
                  view={ag.view}
                  onView={actions.setView}
                  onOpenDoc={actions.openDoc}
                  onFixDoc={() => actions.openFixReview()}
                  intercepts={ag.metrics.intercepts}
                  pausedVisible={!ag.pausedDismissed}
                />
              ) : (
                <DocsView
                  sources={ag.effectiveSources}
                  deleted={ag.deletedSources}
                  edited={(id) => ag.overrides[id] !== undefined}
                  focusId={ag.docFocus?.sourceId ?? null}
                  preferredId={governingId}
                  onSave={actions.saveSource}
                  onRemove={actions.deleteSource}
                  onRestore={actions.restoreSource}
                  fixReview={ag.fixReview}
                  holdsFor={(id) => ag.metrics.heldByDoc[id]?.count ?? 0}
                  onApproveFix={actions.approveFix}
                  onDismissFix={actions.dismissFix}
                />
              )}
            </AgentCard>
          </>
        )}
      </div>

      <footer className={s.footer}>{DISCLAIMER}</footer>

      {ag.toast ? (
        <div className={s.toast} role="alert" key={ag.toast.id}>
          <span>{ag.toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={actions.dismissToast}>
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {tour ? (
        <GuidedTour
          state={tour}
          ag={ag}
          overlay={overlay}
          paused={menuOpen}
          onStep={(step) => setTour({ mode: "tour", step })}
          onStart={startTour}
          onClose={closeTour}
          onResume={() => setMenuOpen(false)}
        />
      ) : null}
      {confirmReset ? (
        <ResetDialog
          edited={ag.editedCount}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            setMenuOpen(false);
            actions.resetWorkspace();
          }}
        />
      ) : null}
    </div>
  );
}
