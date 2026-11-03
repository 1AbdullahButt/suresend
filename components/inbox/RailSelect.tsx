"use client";
import { useId } from "react";
import { ChevronDown } from "lucide-react";
import type { Rail } from "@/lib/engine/types";
import s from "./inbox.module.css";

const LABEL: Record<Rail, string> = { instant: "Instant transfer", standard: "Standard transfer", unknown: "Transfer type unknown" };

/** The ticket's transfer type as a pill. Changing it marks the current result stale; it never rechecks by itself (D-021). */
export function RailSelect({ value, onChange }: { value: Rail; onChange: (r: Rail) => void }) {
  const id = useId();
  return (
    <span className={s.railWrap}>
      <label htmlFor={id} className="sr-only">
        Transfer type
      </label>
      <select id={id} className={s.rail} value={value} onChange={(e) => onChange(e.target.value as Rail)}>
        {(Object.keys(LABEL) as Rail[]).map((r) => (
          <option key={r} value={r}>
            {LABEL[r]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}
