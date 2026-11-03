// "Try another reply" (Phase 10, D-041): preset drafts per ticket for the composer, so a visitor can try the second topic
// without typing. Each replays saved responses (`pnpm record` records them; lib/workspace/presets.test.ts proves it) and
// names the verdict it should get. No new tickets.
import type { Decision } from "@/lib/engine/types";

export interface Preset {
  id: string;
  /** Menu label: what the reply gets right or wrong, not the verdict. */
  label: string;
  draft: string;
  /** The verdict this preset gets on the seed docs (both personas). */
  expect: Decision;
}

const FOUR_DAYS = "Failed transfers are reversed within 4 business days.";

export const PRESETS: Record<string, Preset[]> = {
  "TCK-9001": [
    { id: "lea-4-days", label: "The 4-day reply", draft: FOUR_DAYS, expect: "HOLD" },
    {
      id: "lea-fee-wrong",
      label: "Right timeline, wrong fee",
      draft: "Your money will be back within 1 business day, but the transfer fee isn't refundable.",
      expect: "HOLD",
    },
    {
      id: "lea-both-right",
      label: "Timeline and fee both right",
      draft: "Your money will be back within 1 business day, and the transfer fee is refunded with it.",
      expect: "ALLOW",
    },
  ],
  "TCK-9002": [
    { id: "lukas-4-days", label: "The 4-day reply", draft: FOUR_DAYS, expect: "ESCALATE" },
    { id: "lukas-fee-only", label: "Only the fee (any transfer type)", draft: "Your transfer fee will be refunded with the money.", expect: "CAUTION" },
    {
      id: "lukas-both",
      label: "Timeline and fee",
      draft: "Your money will be back within 4 business days, and the transfer fee is refunded with it.",
      expect: "ESCALATE",
    },
  ],
  "TCK-9003": [
    { id: "sofia-4-days", label: "The 4-day reply", draft: FOUR_DAYS, expect: "ALLOW" },
    {
      id: "sofia-fee-wrong",
      label: "Right timeline, wrong fee",
      draft: "Your money will be back within 4 business days, but the transfer fee isn't refundable.",
      expect: "HOLD",
    },
    { id: "sofia-fee-amount", label: "A fee amount (not checked)", draft: "There's a €2 fee on every transfer.", expect: "CAUTION" },
  ],
};

export const presetsFor = (ticketId: string): Preset[] => PRESETS[ticketId] ?? [];
