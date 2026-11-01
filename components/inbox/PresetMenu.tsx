"use client";
// "Try another reply" (Phase 10, D-041): preset drafts for this ticket, including the second topic (the transfer fee).
// A disclosure, not an ARIA menu: a button that shows a list of buttons. Picking one fills the reply; nothing is sent.
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { presetsFor } from "@/lib/workspace/presets";
import { cx } from "@/components/ui/atoms";
import s from "./inbox.module.css";

export function PresetMenu({ ticketId, current, onPick }: { ticketId: string; current: string; onPick: (draft: string) => void }) {
  const presets = presetsFor(ticketId);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // A new ticket starts closed.
  useEffect(() => setOpen(false), [ticketId]);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLButtonElement>("li button")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (presets.length === 0) return null;
  return (
    <div ref={wrapRef} className={s.presets}>
      <button
        ref={btnRef}
        type="button"
        className={s.presetBtn}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        Try another reply
        <ChevronDown aria-hidden="true" className={cx(s.presetChevron, open && s.presetChevronOpen)} />
      </button>
      {open ? (
        <ul id={listId} className={s.presetList} aria-label="Replies to try">
          {presets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={s.presetItem}
                aria-current={p.draft === current ? "true" : undefined}
                onClick={() => {
                  setOpen(false);
                  onPick(p.draft);
                }}
              >
                <span className={s.presetLabel}>{p.label}</span>
                <span className={s.presetDraft}>“{p.draft}”</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
