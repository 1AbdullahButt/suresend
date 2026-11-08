// UI round, 2026-11-09 (D-065), checked in a real browser against a running app in saved mode:
//   1. Demo menu → Reset leaves the page exactly as a fresh load would, with no reload.
//   2. The "Replaces …" tag in Why wraps instead of being cut off, at 1440, 1280, 1100, 1024 and 390 px.
//   3. "Matches today, changing soon" names the Slack note it comes from.
//   4. "Wrong replies stopped today" opens and closes the flagged replies, by mouse and by keyboard.
//   5. Each flagged reply shows its verdict, its reason and "Open conversation", which opens that customer's thread.
//   pnpm tsx scripts/ui-round-check.ts [baseUrl]     default http://127.0.0.1:3100
//   pnpm tsx scripts/ui-round-check.ts --serve       start `pnpm start -p 3100` (AI_MODE=saved) first, stop it afterwards
import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3100";
let failures = 0;

async function startServer(): Promise<ChildProcess> {
  const child = spawn("pnpm", ["start", "-p", "3100"], { shell: true, stdio: "ignore", env: { ...process.env, AI_MODE: "saved", AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "gemini" } });
  for (let i = 0; i < 120; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start on ${base}`);
}

function stopServer(child: ChildProcess) {
  if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function check(ok: boolean, line: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${line}`);
}

const panel = (p: Page) => p.locator('aside[aria-label="SureSend"]');
const nav = (p: Page) => p.getByRole("navigation", { name: "Conversations" });
const composer = (p: Page) => p.getByRole("textbox", { name: "Your reply" });
const send = (p: Page) => p.getByRole("button", { name: "Send", exact: true });
const decision = (p: Page) => p.getByRole("region", { name: "Decision" });

async function fresh(browser: Browser, width: number, height: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.goto(base, { waitUntil: "networkidle" });
  await send(p).waitFor();
  return p;
}

async function openPanel(p: Page, width: number) {
  if (width >= 1100) return;
  if (await p.getByRole("tab", { name: "Check", exact: true }).isVisible().catch(() => false)) return;
  await p.getByRole("button", { name: /SureSend$/ }).first().click();
  await p.waitForTimeout(400);
}

async function closePanel(p: Page) {
  const close = p.getByRole("button", { name: "Close SureSend" });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await p.waitForTimeout(400);
  }
}

async function sendAndWait(p: Page) {
  await send(p).click();
  await decision(p).waitFor();
  await p.waitForTimeout(500);
}

async function pick(p: Page, name: RegExp) {
  await nav(p).getByRole("button", { name }).click();
  await p.waitForTimeout(300);
}

/** The conversation shown now, by the list's own mark (aria-current). */
const current = (p: Page) => nav(p).locator('[aria-current="true"]').innerText();

async function openMenu(p: Page) {
  await p.locator("[data-demo-menu-trigger]").click();
  const menu = p.getByRole("dialog", { name: "Demo menu" });
  await menu.waitFor();
  return menu;
}

/** What a visitor sees, region by region: the list, the thread, the composer, the panel (Check and Docs) and the Demo menu. */
async function snapshot(p: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  out.conversations = await nav(p).innerText();
  out.thread = await p.getByRole("main", { name: "Conversation" }).innerText();
  out.composer = await composer(p).inputValue();
  out.check = await panel(p).innerText();
  await p.getByRole("tab", { name: "Docs", exact: true }).click();
  await p.waitForTimeout(200);
  out.docs = await panel(p).innerText();
  await p.getByRole("tab", { name: "Check", exact: true }).click();
  const menu = await openMenu(p);
  out.menu = await menu.innerText();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  return out;
}

async function item1(browser: Browser) {
  const p = await fresh(browser, 1440, 900);
  const before = await snapshot(p);
  // Change everything Reset should undo: a held send, a doc removed, the persona, another ticket's draft and transfer type.
  await sendAndWait(p);
  await pick(p, /Sofia S\./);
  await composer(p).fill("Standard transfers come back within 9 business days.");
  await p.getByRole("tab", { name: "Docs", exact: true }).click();
  await panel(p).getByText("Doc settings", { exact: true }).click();
  await p.getByRole("button", { name: "Remove from this demo" }).click();
  await p.waitForTimeout(1200);
  const menu = await openMenu(p);
  await menu.getByRole("radio", { name: "Ops lead" }).click();
  await p.waitForTimeout(1200);
  await p.keyboard.press("Escape");
  const changed = await snapshot(p);
  check(JSON.stringify(changed) !== JSON.stringify(before), "1: the page changed before Reset");

  await p.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  const menu2 = await openMenu(p);
  await menu2.getByRole("button", { name: "Reset demo" }).click();
  await p.getByRole("dialog", { name: "Reset the demo?" }).getByRole("button", { name: "Reset and clear" }).click();
  await send(p).waitFor();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
  check(await p.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true), "1: no reload (the same document)");
  check(await p.getByRole("alert").filter({ hasText: "Demo reset" }).isVisible(), "1: the reset toast shows");
  check(await p.evaluate(() => document.activeElement?.hasAttribute("data-demo-menu-trigger") ?? false), "1: focus is on the Demo menu button");
  const after = await snapshot(p);
  for (const k of Object.keys(before)) {
    const same = after[k] === before[k];
    check(same, `1: after Reset, ${k} is as on a fresh load`);
    if (!same) console.log(`   fresh: ${JSON.stringify(before[k]?.slice(0, 200))}\n   reset: ${JSON.stringify(after[k]?.slice(0, 200))}`);
  }
  await p.context().close();
}

async function item2(browser: Browser) {
  for (const [w, h] of [[1440, 900], [1280, 800], [1100, 800], [1024, 800], [390, 844]] as const) {
    const p = await fresh(browser, w, h);
    await sendAndWait(p);
    await p.getByRole("button", { name: "Why?", exact: true }).click();
    await p.waitForTimeout(400);
    const tag = panel(p).getByText(/^Replaces /).first();
    await tag.scrollIntoViewIfNeeded();
    const m = await tag.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      const r = el.getBoundingClientRect();
      const card = el.closest("div")!.getBoundingClientRect();
      return { text: el.textContent ?? "", clipped: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow, lines: Math.round((r.height - 6) / lh), inside: r.right <= card.right + 0.5 };
    });
    check(m.text === "Replaces Outgoing Transfers: Reversal SOP for instant" && !m.clipped && m.ellipsis !== "ellipsis" && m.lines <= 2 && m.inside, `2 @${w}: "${m.text}" whole, ${m.lines} line(s), inside the card`);
    await p.context().close();
  }
}

async function item3(browser: Browser) {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const p = await fresh(browser, w, h);
    await openPanel(p, w);
    await p.getByRole("tab", { name: "Docs", exact: true }).click();
    await panel(p).getByText("Doc settings", { exact: true }).click();
    await p.getByRole("button", { name: "Remove from this demo" }).click();
    await decision(p).waitFor();
    await p.waitForTimeout(500);
    const text = (await decision(p).innerText()).replace(/\s+/g, " ");
    check(
      text.includes("Matches today, changing soon") && text.includes("A Slack note in #ops-announcements (Oct 24) proposes 1 day, pending sign-off."),
      `3 @${w}: ${text.slice(0, 140)}`,
    );
    await p.context().close();
  }
}

async function items4and5(browser: Browser) {
  for (const [w, h] of [[1440, 900], [1024, 800], [390, 844]] as const) {
    const p = await fresh(browser, w, h);
    // Two flags from two customers: Lukas's Ask first, then Léa's Hold, then Léa's corrected reply is sent.
    await pick(p, /Lukas R\./);
    await closePanel(p);
    await sendAndWait(p);
    await closePanel(p);
    await pick(p, /Léa K\./);
    await closePanel(p);
    await sendAndWait(p);
    await p.getByRole("button", { name: "Use this reply", exact: true }).click();
    await p.waitForTimeout(400);
    await send(p).click();
    const counter = panel(p).getByRole("button", { name: /Wrong replies stopped today/ });
    await counter.waitFor();
    await p.waitForTimeout(400);

    // Item 4: mouse.
    check((await counter.getAttribute("aria-expanded")) === "false", `4 @${w}: the counter is a button, collapsed`);
    await counter.click();
    const list = panel(p).locator(`[id="${await counter.getAttribute("aria-controls")}"]`);
    check((await counter.getAttribute("aria-expanded")) === "true" && (await list.isVisible()), `4 @${w}: a click opens the list`);
    const panelText = (await list.innerText()).replace(/\s+/g, " ");
    await counter.click();
    check((await counter.getAttribute("aria-expanded")) === "false" && (await list.count()) === 0, `4 @${w}: a second click closes it`);
    // Item 4: keyboard.
    await counter.focus();
    await p.keyboard.press("Enter");
    check((await counter.getAttribute("aria-expanded")) === "true", `4 @${w}: Enter opens it`);
    await p.keyboard.press("Space");
    check((await counter.getAttribute("aria-expanded")) === "false", `4 @${w}: Space closes it`);

    // Item 5: the same list in the Demo menu, with verdict, reason and Open conversation.
    await closePanel(p);
    const menu = await openMenu(p);
    await menu.getByText(/Review flagged replies/).click();
    const rows = menu.locator("details").getByRole("listitem");
    const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
    check(texts.length === 2, `5 @${w}: two flagged replies (${texts.length})`);
    const lea = texts.find((t) => t.includes("Léa K.")) ?? "";
    const lukas = texts.find((t) => t.includes("Lukas R.")) ?? "";
    check(/Hold/.test(lea) && lea.includes("Instant transfer: docs say 1 business day, reply said 4") && lea.includes("Open conversation"), `5 @${w}: Léa: ${lea}`);
    check(/Ask first/.test(lukas) && lukas.includes("Depends on the transfer") && lukas.includes("Open conversation"), `5 @${w}: Lukas: ${lukas}`);
    check(lea.includes("Correct catch") && lea.includes("False alarm"), `5 @${w}: the review buttons stay`);
    check(panelText.includes(lea.slice(0, 40)) && panelText.includes("Depends on the transfer"), `4 @${w}: the counter's list is the Demo menu's list`);
    await menu.getByRole("button", { name: "Open conversation with Lukas R." }).click();
    await p.waitForTimeout(500);
    const title = await p.evaluate(() => document.activeElement?.hasAttribute("data-thread-title") ?? false);
    const thread = await current(p);
    const menuGone = (await p.getByRole("dialog", { name: "Demo menu" }).count()) === 0;
    check(thread.includes("Lukas R.") && title && menuGone, `5 @${w}: Open conversation shows Lukas's thread, focus on it, menu closed`);
    // And from the sent card's list (Léa is still the sent ticket): back to Léa.
    await pick(p, /Léa K\./);
    await openPanel(p, w);
    await panel(p).getByRole("button", { name: /Wrong replies stopped today/ }).click();
    await panel(p).getByRole("button", { name: "Open conversation with Lukas R." }).click();
    await p.waitForTimeout(500);
    const t2 = await current(p);
    const covered = w < 1100 ? (await p.getByRole("button", { name: "Close SureSend" }).count()) === 0 || !(await p.getByRole("button", { name: "Close SureSend" }).isVisible()) : true;
    check(t2.includes("Lukas R.") && covered, `5 @${w}: from the sent card too${w < 1100 ? ", and the panel closes" : ""}`);
    await p.context().close();
  }
}

async function main() {
  const serve = process.argv.includes("--serve");
  const server = serve ? await startServer() : null;
  const browser = await chromium.launch();
  try {
    await item1(browser);
    await item2(browser);
    await item3(browser);
    await items4and5(browser);
  } finally {
    await browser.close();
    if (server) stopServer(server);
  }
  console.log(failures ? `${failures} failed` : "all passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
