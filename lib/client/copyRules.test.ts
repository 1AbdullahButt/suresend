// Phase 11 (D-045, D-046): copy the independent review ruled out. Scans what a visitor reads, so a new screen can't bring it back.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const FILES = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

/** Strings a visitor can read, without comments: a comment may name the rule it follows. */
function visible(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/\s+/g, " "); // a line break inside JSX is a space on screen
}

describe("copy rules", () => {
  // "The AI only read the docs" implies the same reply always gets the same verdict; the AI reads the reply too (D-051).
  it.each(["got the right answer", "never reached", "your reply is right", "only read the docs", "reads your docs live"])("nothing says %s", (phrase) => {
    expect(FILES.filter((f) => visible(f).toLowerCase().includes(phrase)).map(rel)).toEqual([]);
  });

  it('"Slite Agent" appears only in the "independent concept" tag and the page title, never as the actor', () => {
    const allowed = /(Independent concept for Slite Agent · synthetic data · not affiliated with Slite|independent concept for Slite Agent)/gi;
    const found = FILES.filter((f) => visible(f).replace(allowed, "").includes("Slite Agent")).map(rel);
    expect(found).toEqual([]);
  });

  // D-053: a visitor reads "instant transfer" and "transfer type". The code field stays `rail`, and the prompts still explain it to the AI.
  it('nothing a visitor reads says "rail"', () => {
    const RAIL_WORDS = /\b(?:instant|standard|unknown|payment|one|this|the|by|which|another|other|any|all|every)[- ]rails?\b|\brails? (?:is|unknown|isn't)\b|\brail-specific\b|\}[- ]rails?\b|>\s*Rail\s*<|"Rail"|\bRail unknown\b|\bInstant rail\b/i;
    const read = (f: string) => visible(f).replace(/\b(?:by_rail|rail: )/g, "");
    const found = FILES.filter((f) => !/lib\/ai\/(?:prompts|schemas)\.ts$/.test(rel(f))).filter((f) => RAIL_WORDS.test(read(f))).map((f) => `${rel(f)}: ${RAIL_WORDS.exec(read(f))![0]}`);
    expect(found).toEqual([]);
  });

  it("nothing a visitor reads has the old names or currency", () => {
    expect(FILES.filter((f) => /Ayesha|Usman|\bHina\b|PKR/.test(visible(f))).map(rel)).toEqual([]);
  });

  // SPEC: every screen carries the disclaimer. Next's default 404 doesn't.
  it("the 404 page has the disclaimer", () => {
    expect(visible(path.join(ROOT, "app", "not-found.tsx"))).toContain("Independent concept for Slite Agent · synthetic data · not affiliated with Slite");
  });

  it("the app states the concept tag exactly once per page", () => {
    const hits = FILES.filter((f) => /components\/(shell|inbox|agent|tour)\//.test(rel(f))).flatMap((f) => visible(f).match(/concept for Slite Agent/gi) ?? []);
    expect(hits).toHaveLength(1);
  });
});
