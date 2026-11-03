// UI gate helper (design v2): screenshots of the key states at 1440 / 1024 / 390 px plus an axe-core accessibility scan,
// against an already-running app (default http://127.0.0.1:3100, AI_MODE=saved). Uses only design/v2/UI-CONTRACT.md names.
//   pnpm tsx scripts/ui-audit.ts [baseUrl]
//   pnpm tsx scripts/ui-audit.ts --serve      start `pnpm start -p 3100` (AI_MODE=saved) first, stop it afterwards
// Writes design/audit/<state>-<width>.png and design/audit/axe.json; exits 1 on any serious/critical axe violation or
// horizontal page scroll.
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const serve = process.argv.includes("--serve");
const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3100";

async function startServer(): Promise<ChildProcess> {
  const child = spawn("pnpm", ["start", "-p", "3100"], {
    shell: true,
    stdio: "ignore",
    env: { ...process.env, AI_MODE: "saved", AI_PROVIDER: "groq", AI_FALLBACK_PROVIDER: "gemini" },
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start on " + base);
}

function stopServer(child: ChildProcess) {
  // On Windows the shell wrapper's PID owns the tree. Synchronous, so the tree is gone before this script exits.
  if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

const outDir = path.join(process.cwd(), "design", "audit");
const widths = [1440, 1024, 390];
const DRAFT = "Failed transfers are reversed within 4 business days.";

interface AxeSummary {
  state: string;
  width: number;
  violations: Array<{ id: string; impact: string | null | undefined; help: string; nodes: number }>;
}

async function openConversation(page: Page, name: RegExp) {
  await page.getByRole("navigation", { name: "Conversations" }).getByRole("button", { name }).click();
}

/** Under 1100 px the SureSend card is a slide-over / bottom sheet; open it if it's closed. */
async function openAgent(page: Page) {
  const tab = page.getByRole("tab", { name: "Check", exact: true });
  const toggle = page.getByRole("button", { name: /SureSend$/ }).first();
  // Wait for whichever renders first (the card itself on desktop, or the slide-over/sheet toggle); on a deployed site
  // hydration can take longer than locally.
  await Promise.race([tab.waitFor({ timeout: 15_000 }), toggle.waitFor({ timeout: 15_000 })]).catch(() => undefined);
  if (await tab.isVisible().catch(() => false)) return;
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
  await tab.waitFor({ timeout: 15_000 });
}

/** Send runs the check (POST /api/send). */
async function sendDraft(page: Page, name: RegExp, draft = DRAFT) {
  await openConversation(page, name);
  await page.getByRole("textbox", { name: "Your reply" }).fill(draft);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

async function held(page: Page) {
  await sendDraft(page, /Léa K\./);
  await page.getByRole("region", { name: "Decision" }).getByText("Hold").first().waitFor({ timeout: 20_000 });
}

const isLocal = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(base);

const states: Array<{ name: string; localOnly?: boolean; run: (page: Page) => Promise<void> }> = [
  { name: "empty", run: async () => {} },
  { name: "held", run: held },
  {
    name: "why",
    run: async (page) => {
      await held(page);
      await page.getByRole("button", { name: "Why?", exact: true }).click();
      await page.getByRole("button", { name: "See the full rule trace" }).waitFor();
    },
  },
  {
    name: "trace",
    run: async (page) => {
      await held(page);
      await page.getByRole("button", { name: "Why?", exact: true }).click();
      await page.getByRole("button", { name: "See the full rule trace" }).click();
      await page.getByRole("button", { name: "Raw JSON" }).click();
    },
  },
  {
    name: "docs",
    run: async (page) => {
      await openAgent(page);
      await page.getByRole("tab", { name: "Docs", exact: true }).click();
      const text = page.getByRole("textbox", { name: "Document text" });
      await text.fill((await text.inputValue()).replace("1 business day", "2 business days"));
    },
  },
  {
    // Variant B7 through the UI: DOC-103 → 2 business days with "Save and re-check" → Double-check.
    name: "double-check",
    run: async (page) => {
      await held(page);
      await openAgent(page);
      await page.getByRole("tab", { name: "Docs", exact: true }).click();
      const text = page.getByRole("textbox", { name: "Document text" });
      await text.fill((await text.inputValue()).replace("1 business day", "2 business days"));
      await page.getByRole("button", { name: "Save and re-check", exact: true }).click();
      await page.getByRole("checkbox", { name: "I've checked and want to send it" }).waitFor({ timeout: 20_000 });
    },
  },
  {
    name: "ask-first",
    run: async (page) => {
      await sendDraft(page, /Lukas R\./);
      await page.getByRole("region", { name: "Decision" }).getByText("Ask first").first().waitFor({ timeout: 20_000 });
    },
  },
  {
    // A draft with no saved AI response in AI_MODE=saved → 503 → "Not sent" + "Try again".
    name: "not-sent",
    // Needs a draft with no saved response and no live AI (AI_MODE=saved). On a deployed site with live AI configured the
    // draft is simply checked, so this state is only audited locally.
    localOnly: true,
    run: async (page) => {
      await sendDraft(page, /Sofia S\./, "Your refund should arrive in 3 working days.");
      await page.getByRole("button", { name: "Try again", exact: true }).waitFor({ timeout: 20_000 });
    },
  },
  {
    name: "sent",
    run: async (page) => {
      await held(page);
      await page.getByRole("button", { name: "Use this reply", exact: true }).click();
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Sent · checked by SureSend" }).waitFor({ timeout: 20_000 });
    },
  },
  {
    name: "demo-menu",
    run: async (page) => {
      await held(page);
      const close = page.getByRole("button", { name: "Close SureSend" });
      if (await close.isVisible().catch(() => false)) await close.click();
      await page.getByRole("button", { name: "Demo menu", exact: true }).click();
      await page.getByRole("dialog", { name: "Demo menu" }).waitFor();
    },
  },
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = serve ? await startServer() : null;
  const browser = await chromium.launch();
  const summaries: AxeSummary[] = [];
  let serious = 0;
  const overflow: string[] = [];
  const failed: string[] = [];
  for (const width of widths) {
    for (const state of states) {
      if (state.localOnly && !isLocal) continue;
      const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 } });
      const page = await context.newPage();
      await page.goto(base);
      await page.getByRole("contentinfo").waitFor();
      try {
        await state.run(page);
      } catch (e) {
        failed.push(`${state.name}@${width}`);
        console.log(`! ${state.name}@${width}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(outDir, `${state.name}-${width}.png`), fullPage: false });
      const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (hScroll) overflow.push(`${state.name}@${width}`);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const violations = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
      serious += violations.filter((v) => v.impact === "serious" || v.impact === "critical").length;
      summaries.push({ state: state.name, width, violations });
      console.log(
        `${state.name.padEnd(13)} ${String(width).padStart(4)}px  axe: ${violations.length ? violations.map((v) => `${v.id}(${v.impact}×${v.nodes})`).join(", ") : "none"}${hScroll ? "  ⚠ horizontal scroll" : ""}`,
      );
      await context.close();
    }
  }
  await browser.close();
  if (server) stopServer(server);
  writeFileSync(path.join(outDir, "axe.json"), JSON.stringify(summaries, null, 2));
  console.log(
    `\nSerious/critical axe violations: ${serious}. Horizontal page scroll: ${overflow.length ? overflow.join(", ") : "none"}. States that failed to reach: ${failed.length ? failed.join(", ") : "none"}.`,
  );
  process.exit(serious === 0 && overflow.length === 0 && failed.length === 0 ? 0 : 1);
}

void main();
