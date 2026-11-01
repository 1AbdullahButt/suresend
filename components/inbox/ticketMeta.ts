// Synthetic display details for the simulated inbox (no real data). Decisions never depend on these.
import type { Rail } from "@/lib/engine/types";

export interface TicketMeta {
  time: string;
  created: string;
  transfer: string;
  avatarTone: "a" | "b" | "c";
  /** One line under the pre-filled reply, shown only while it's untouched on this rail (D-034). */
  draftHint?: { rail: Rail; text: string };
}

const META: Record<string, TicketMeta> = {
  "TCK-9001": {
    time: "9:41",
    created: "Oct 30, 9:41",
    transfer: "TX-48213 · PKR 25,000",
    avatarTone: "a",
    draftHint: { rail: "instant", text: "This reply promises 4 days. The docs say 1. Press Send." },
  },
  "TCK-9002": { time: "9:28", created: "Oct 30, 9:28", transfer: "TX-48197 · PKR 12,500", avatarTone: "b" },
  "TCK-9003": { time: "8:55", created: "Oct 30, 8:55", transfer: "TX-48150 · PKR 40,000", avatarTone: "c" },
};

export function ticketMeta(id: string): TicketMeta {
  return META[id] ?? { time: "", created: "Oct 30", transfer: "TX-00000", avatarTone: "a" };
}

export function initials(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const RAIL_LABEL: Record<Rail, string> = { instant: "Instant", standard: "Standard", unknown: "Unknown" };
export const RAIL_TAG: Record<Rail, string> = { instant: "Instant rail", standard: "Standard rail", unknown: "Rail unknown" };
