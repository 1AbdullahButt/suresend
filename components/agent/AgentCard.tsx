"use client";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Tab } from "@/lib/client/types";
import { cx, Mark, ui } from "@/components/ui/atoms";
import s from "./agent.module.css";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "check", label: "Check" },
  { id: "docs", label: "Docs" },
];

/**
 * The SureSend card (design v2): two tabs, Check and Docs. A normal card at ≥1100 px, a slide-over below that and a
 * bottom sheet under 700 px. In overlay modes focus moves in when it opens and Esc closes it. Only a panel that covers the
 * conversation pills traps Tab (`modal`): the slide-over sits below them, and they stay in reach (D-054).
 */
export function AgentCard({
  tab,
  onTab,
  overlay,
  modal,
  open,
  onClose,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  overlay: boolean;
  modal: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const base = useId();
  const ref = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!overlay || !open) return;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [overlay, open]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!overlay || !open) return;
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
      return;
    }
    if (!modal || e.key !== "Tab" || !ref.current) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = (i + 1) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const t = TABS[next];
    if (t) {
      onTab(t.id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <aside ref={ref} className={cx(s.agent, open && s.agentOpen)} aria-label="SureSend" onKeyDown={onKey} data-tour="agent">
      <div className={s.head}>
        <span className={s.grab} aria-hidden="true" />
        <h2 className={s.who}>
          <Mark small check={false} />
          SureSend
        </h2>
        <div className={s.headActions}>
          <div className={s.tabs} role="tablist" aria-label="SureSend views">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${base}-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={s.tab}
                onClick={() => onTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className={cx(ui.round, s.close)} aria-label="Close SureSend" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          className={s.body}
          hidden={tab !== t.id}
          tabIndex={0}
        >
          {tab === t.id ? children : null}
        </div>
      ))}
    </aside>
  );
}
