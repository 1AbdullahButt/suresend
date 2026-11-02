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
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("copy rules", () => {
  it.each(["got the right answer", "never reached"])("nothing says %s", (phrase) => {
    expect(FILES.filter((f) => visible(f).toLowerCase().includes(phrase)).map(rel)).toEqual([]);
  });

  it('"Slite Agent" appears only in the "independent concept" tag and the page title, never as the actor', () => {
    const allowed = /(Independent concept for Slite Agent · synthetic data · not affiliated with Slite|independent concept for Slite Agent)/gi;
    const found = FILES.filter((f) => visible(f).replace(allowed, "").includes("Slite Agent")).map(rel);
    expect(found).toEqual([]);
  });

  it("the app states the concept tag exactly once per page", () => {
    const hits = FILES.filter((f) => /components\/(shell|inbox|agent|tour)\//.test(rel(f))).flatMap((f) => visible(f).match(/concept for Slite Agent/gi) ?? []);
    expect(hits).toHaveLength(1);
  });
});
