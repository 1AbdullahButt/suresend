// Records the ~30-second README demo GIF (brief §4 Phase 4 step 5): Playwright video of the SPEC §16 flow against a
// saved-mode production server, converted to docs/demo.gif with ffmpeg (two-pass palette for a small, crisp GIF).
//   pnpm build && pnpm tsx scripts/record-demo.ts
import { chromium, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const PORT = 3400;
const base = `http://127.0.0.1:${PORT}`;
const outDir = path.join(process.cwd(), "docs");
const videoDir = path.join(outDir, ".video");
const DRAFT = "Failed transfers are reversed within 4 business days.";

async function startServer(): Promise<ChildProcess> {
  const child = spawn("pnpm", ["start", "-p", String(PORT)], {
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
  throw new Error(`server did not start on ${base}`);
}

function stopServer(child: ChildProcess) {
  if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function demo(page: Page) {
  await page.goto(base);
  await page.getByRole("contentinfo").waitFor();
  // Dismiss the first-visit tour offer if it appears; the GIF shows the flow itself.
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 1500 }).catch(() => false)) await notNow.click();
  await pause(page, 600);

  // 1. Catch: TCK-9001, 4-day draft → Send runs the check → held
  await page.getByRole("navigation", { name: "Conversations" }).getByRole("button", { name: /Léa K\./ }).click();
  const composer = page.getByRole("textbox", { name: "Your reply" });
  await composer.fill(DRAFT);
  await pause(page, 700);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("region", { name: "Decision" }).getByText("Hold").first().waitFor();
  await pause(page, 2400);

  // 2. Why: plain explanation
  await page.getByRole("button", { name: "Why?", exact: true }).click();
  await pause(page, 2800);
  await page.getByRole("button", { name: "Back to the decision" }).click();
  await pause(page, 500);

  // 3. Recover: use the checked reply → sent
  await page.getByRole("button", { name: "Use this reply", exact: true }).click();
  await pause(page, 900);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Sent · checked by SureSend" }).waitFor();
  await pause(page, 2200);

  // 4. Ambiguity: TCK-9002 (transfer type unknown) → Ask first
  await page.getByRole("navigation", { name: "Conversations" }).getByRole("button", { name: /Lukas R\./ }).click();
  await composer.fill(DRAFT);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("region", { name: "Decision" }).getByText("Ask first").first().waitFor();
  await pause(page, 2400);

  // 5. Demo menu: impact
  await page.getByRole("button", { name: "Demo menu", exact: true }).click();
  await pause(page, 2000);
}

/** The link preview (D-047): the Hold, at the size link previews use. A GIF's first frame is all most of them show. */
async function preview(page: Page) {
  await page.goto(base);
  await page.getByRole("contentinfo").waitFor();
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 1500 }).catch(() => false)) await notNow.click();
  await page.getByRole("navigation", { name: "Conversations" }).getByRole("button", { name: /Léa K\./ }).click();
  await page.getByRole("textbox", { name: "Your reply" }).fill(DRAFT);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("region", { name: "Decision" }).getByText("Hold").first().waitFor();
  await pause(page, 600);
  await page.screenshot({ path: path.join(process.cwd(), "public", "og.png") });
}

async function main() {
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 760 } } });
    const page = await context.newPage();
    await demo(page);
    await context.close(); // flushes the video
    const still = await browser.newContext({ viewport: { width: 1200, height: 630 } });
    await preview(await still.newPage());
    await still.close();
  } finally {
    await browser.close();
    stopServer(server);
  }
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no video recorded");
  const src = path.join(videoDir, webm);
  renameSync(src, path.join(outDir, "demo.webm"));
  const palette = path.join(videoDir, "palette.png");
  const filters = "fps=10,scale=960:-1:flags=lanczos";
  const ff = (args: string[]) => {
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
  };
  ff(["-i", path.join(outDir, "demo.webm"), "-vf", `${filters},palettegen=stats_mode=diff`, palette]);
  ff(["-i", path.join(outDir, "demo.webm"), "-i", palette, "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, path.join(outDir, "demo.gif")]);
  rmSync(videoDir, { recursive: true, force: true });
  copyFileSync(path.join(outDir, "demo.gif"), path.join(process.cwd(), "public", "demo.gif")); // the how-it-works page renders the README's image from here
  console.log("wrote docs/demo.gif, docs/demo.webm, public/demo.gif and public/og.png");
}

void main();
