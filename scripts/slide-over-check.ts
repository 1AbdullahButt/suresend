// P1-3 and the pill strip (Phase 12, D-054): between 700 and 1099 px, with the SureSend slide-over open, the conversation pills and the
// Demo menu stay on top and work, by mouse and by keyboard, and the pill strip shows no scrollbar. Against a running app; no AI needed
// for the panel, and "Send" on each ticket uses saved responses when AI_MODE=saved.
//   pnpm tsx scripts/slide-over-check.ts [baseUrl]     default http://127.0.0.1:3100
//   pnpm tsx scripts/slide-over-check.ts --serve       start `pnpm start -p 3100` (AI_MODE=saved) first, stop it afterwards
import { chromium, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3100";
const WIDTHS = [1099, 1024, 900, 700];
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
  // On Windows the shell wrapper's PID owns the tree.
  if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function check(ok: boolean, line: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${line}`);
}

const pills = (page: Page) => page.getByRole("navigation", { name: "Conversations" }).getByRole("button");
const demoMenu = (page: Page) => page.locator("[data-demo-menu-trigger]");
const toggle = (page: Page) => page.getByRole("button", { name: /SureSend$/ }).first();
const tab = (page: Page) => page.getByRole("tab", { name: "Check", exact: true });

/** Is this element what a click at its centre would hit? */
const onTop = (el: Element) => {
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
};

async function openPanel(page: Page) {
  await toggle(page).click();
  await tab(page).waitFor();
  await page.waitForTimeout(300); // the slide-in, and the focus move inside the panel
}

async function main() {
  const server = process.argv.includes("--serve") ? await startServer() : null;
  // Headless Chromium hides scrollbars by default, which would hide the bug this looks for.
  const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await pills(page).first().waitFor();
    await openPanel(page);

    const count = await pills(page).count();
    const covered: string[] = [];
    for (let i = 0; i < count; i++) if (!(await pills(page).nth(i).evaluate(onTop))) covered.push(`pill ${i + 1}`);
    if (!(await demoMenu(page).evaluate(onTop))) covered.push("Demo menu");
    check(covered.length === 0, `${width}: with the panel open, on top: ${count} pills and the Demo menu${covered.length ? `; covered: ${covered.join(", ")}` : ""}`);

    // By keyboard: focus is in the panel; Shift+Tab reaches a pill without closing it.
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Shift+Tab");
      reached = await page.evaluate(() => !!document.activeElement?.closest('nav[aria-label="Conversations"]'));
    }
    check(reached && (await tab(page).isVisible()), `${width}: Shift+Tab from the panel reaches the pills, with the panel still open`);

    // Focus is on a pill now, outside the panel: Esc still closes it, and focus lands on something, not the page.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    check(!(await tab(page).isVisible()), `${width}: Esc closes the panel with focus outside it`);
    check(await page.evaluate(() => document.activeElement !== document.body), `${width}: closing leaves focus on a control, not the page`);
    await openPanel(page);
    const jump = await page.locator("footer").evaluate((f) => {
      const app = f.parentElement as HTMLElement;
      return { left: app.scrollLeft, overflow: getComputedStyle(app).overflowX };
    });
    check(jump.left === 0 && jump.overflow === "clip", `${width}: the page can't jump sideways when the panel opens (scrollLeft ${jump.left}, overflow ${jump.overflow})`);

    const menuClick = await demoMenu(page).click({ timeout: 2000, trial: true }).then(() => true, () => false);
    check(menuClick, `${width}: the Demo menu can be clicked with the panel open`);
    if (menuClick) {
      await demoMenu(page).click();
      check(await page.getByRole("dialog").first().isVisible().catch(() => false), `${width}: the Demo menu opens`);
      await page.keyboard.press("Escape");
    }

    if (!(await tab(page).isVisible())) await openPanel(page);
    const second = pills(page).nth(1);
    const pillClick = await second.click({ timeout: 2000 }).then(() => true, () => false);
    await page.waitForTimeout(300);
    check(pillClick && (await second.getAttribute("aria-current")) === "true", `${width}: a pill can be clicked with the panel open, and switches the conversation`);
    check(pillClick && !(await tab(page).isVisible()), `${width}: changing the conversation closes the panel (D-049)`);

    // The strip at its widest: every ticket with a result tag.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // A narrow strip scrolls: an arrow key brings the next pill fully into view.
    await pills(page).first().focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const lastInView = await page.getByRole("navigation", { name: "Conversations" }).evaluate((nav: HTMLElement) => {
      const last = nav.querySelectorAll("button")[2]!.getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      return last.right <= box.right + 1 && last.left >= box.left - 1;
    });
    check(lastInView, `${width}: arrow keys bring the last pill into view`);
    const reply = page.getByRole("textbox", { name: "Your reply" });
    for (let i = 0; i < count; i++) {
      await pills(page).nth(i).click({ timeout: 2000 }).catch(() => undefined);
      await reply.waitFor();
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    const strip = await page.getByRole("navigation", { name: "Conversations" }).evaluate((el: HTMLElement) => {
      const style = getComputedStyle(el);
      return { bar: el.offsetHeight - el.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth), hidden: style.scrollbarWidth === "none", overflow: el.scrollWidth > el.clientWidth };
    });
    // Hidden whether it overflows or not: tags change the strip's width, so one state passing proves little.
    check(strip.bar === 0 && strip.hidden, `${width}: no scrollbar on the pill strip (bar ${strip.bar}px, overflow ${strip.overflow}, hidden ${strip.hidden})`);
    if (width === 1024) await page.screenshot({ path: process.env.SLIDE_OVER_SHOT ?? "design/audit/slide-over-1024.png" });
    await ctx.close();

    // The guided tour's step 3 closes the panel: its card must leave Send uncovered (QA's second look, D-054).
    const tourCtx = await browser.newContext({ viewport: { width, height: 800 } });
    const tourPage = await tourCtx.newPage();
    await tourPage.goto(base, { waitUntil: "networkidle" });
    await tourPage.getByRole("button", { name: "Guided tour" }).click();
    const card = tourPage.getByRole("dialog").first();
    await card.waitFor();
    await tourPage.getByRole("button", { name: "Send", exact: true }).click();
    await tourPage.getByRole("region", { name: "Decision" }).waitFor();
    await card.getByRole("button", { name: /^Next/ }).click();
    await tourPage.waitForTimeout(400);
    await card.getByRole("button", { name: /^Next/ }).click();
    await tourPage.waitForTimeout(400);
    await tourPage.getByRole("button", { name: "Use this reply", exact: true }).click();
    await tourPage.waitForTimeout(600);
    const free = await tourPage.getByRole("button", { name: "Send", exact: true }).click({ timeout: 3000, trial: true }).then(() => true, () => false);
    check(free, `${width}: in the tour, Send is uncovered once the suggested reply is in the composer`);
    await tourCtx.close();
  }
  // A short screen has no room for a panel under the strip: it's the old overlay, modal, at full height.
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await pills(page).first().waitFor();
  await openPanel(page);
  const height = await page.getByRole("complementary", { name: "SureSend" }).evaluate((el) => el.getBoundingClientRect().height);
  check(height >= 320, `844×390: the panel keeps its height (${Math.round(height)} px)`);
  let left = false;
  for (let i = 0; i < 30 && !left; i++) {
    await page.keyboard.press("Tab");
    left = await page.evaluate(() => !document.activeElement?.closest('[aria-label="SureSend"]'));
  }
  check(!left, "844×390: Tab stays inside the panel, since it covers the pills");
  await ctx.close();
  await browser.close();
  if (server) stopServer(server);
  console.log(failures ? `${failures} failed` : "all passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
