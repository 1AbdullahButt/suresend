import { expect, test } from "@playwright/test";

// SPEC §14 (the one e2e test) and SPEC §16 demo steps 2–3, for the design v2 UI flow.
// This replaces the v1 test per DECISIONS D-026 (one-time unlock, approved by Abdullah): Send now runs the check, so
// the separate "Check answer" step is gone. It covers the same guarantees as v1:
//   - the server-side recheck (SPEC §6.8, POST /api/send) blocks the wrong "4 business days" draft (HOLD, 409);
//   - the blocked send is NOT sent (composer keeps the wrong draft, no sent confirmation);
//   - exactly one intercept is counted (SPEC §11 metric 2), shown in the Demo menu;
//   - the safe reply (contains "1 business day") replaces the draft and sends;
//   - the disclaimer footer is present.
// Selectors follow design/v2/UI-CONTRACT.md: role + accessible name only.

const WRONG_DRAFT = "Failed transfers are reversed within 4 business days.";

test("wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped", async ({ page }) => {
  await page.goto("/");

  // Step 1 — SPEC §16 step 2 (Catch): open TCK-9001 (Ayesha K., instant rail) and type the wrong draft.
  await page
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", { name: /Ayesha K\./ })
    .click();
  const composer = page.getByRole("textbox", { name: "Your reply" });
  await composer.fill(WRONG_DRAFT);

  // Step 2 — REDESIGN item 1 (Send runs the check) + SPEC §6.8 (server reruns the check, HOLD → 409, intercept)
  // + SPEC §14 T1 (HOLD) + SPEC §16 step 3 (Try Send → blocked).
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("region", { name: "Decision" })).toContainText("Hold");
  await expect(page.getByRole("status").filter({ hasText: "Held by SureSend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send (held)", exact: true })).toBeDisabled();
  // Not sent: the composer still holds the wrong draft and there is no sent confirmation.
  await expect(composer).toHaveValue(WRONG_DRAFT);
  await expect(page.getByRole("status").filter({ hasText: "Sent · checked by SureSend" })).toHaveCount(0);

  // Step 3 — SPEC §16 step 3 (Recover): use the safe reply (already rechecked) → it says "1 business day";
  // UI-CONTRACT: changing the composer text clears the held state and re-enables Send.
  await page.getByRole("button", { name: "Use this reply", exact: true }).click();
  await expect(composer).toHaveValue(/1 business day/);
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeEnabled();

  // Step 4 — SPEC §16 step 3 + §6.8 (ALLOW → sent) + REDESIGN item 5 (sent payoff).
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "Sent · checked by SureSend" })).toBeVisible();

  // Step 5 — SPEC §14 ("Impact shows 1 intercept") + §11 metric 2 + REDESIGN item 6 (Impact lives in the Demo menu).
  await page.getByRole("button", { name: "Demo menu", exact: true }).click();
  const demoMenu = page.getByRole("dialog", { name: "Demo menu" });
  // Exactly one intercept: a "1" not adjacent to other digits (so "10" or "11" would fail).
  await expect(demoMenu.getByRole("group", { name: "Wrong ones stopped" })).toContainText(/(^|\D)1(\D|$)/);

  // Step 6 — REDESIGN item 9: disclaimer footer is always present.
  await expect(page.getByRole("contentinfo")).toContainText("Independent concept for Slite Agent");
});
