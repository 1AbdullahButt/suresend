// P1-3 and the pill strip (Phase 12, D-054): between 700 and 1099 px, with the SureSend slide-over open, the conversation pills and the
// Demo menu stay on top and work, by mouse and by keyboard, and the pill strip shows no scrollbar. Against a running app; no AI needed
// for the panel, and "Send" on each ticket uses saved responses when AI_MODE=saved.
//   pnpm tsx scripts/slide-over-check.ts [baseUrl]     default http://127.0.0.1:3100
import { chromium, type Page } from "@playwright/test";

const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3100";
const WIDTHS = [1099, 1024, 900, 700];
let failures = 0;

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
    const reply = page.getByRole("textbox", { name: "Your reply" });
    for (let i = 0; i < count; i++) {
      await pills(page).nth(i).click({ timeout: 2000 }).catch(() => undefined);
      await reply.waitFor();
      await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    const strip = await page.getByRole("navigation", { name: "Conversations" }).evaluate((el) => {
      const style = getComputedStyle(el);
      return { bar: el.offsetHeight - el.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth), hidden: style.scrollbarWidth === "none", overflow: el.scrollWidth > el.clientWidth };
    });
    // Hidden whether it overflows or not: tags change the strip's width, so one state passing proves little.
    check(strip.bar === 0 && strip.hidden, `${width}: no scrollbar on the pill strip (bar ${strip.bar}px, overflow ${strip.overflow}, hidden ${strip.hidden})`);
    if (width === 1024) await page.screenshot({ path: process.env.SLIDE_OVER_SHOT ?? "design/audit/slide-over-1024.png" });
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `${failures} failed` : "all passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
