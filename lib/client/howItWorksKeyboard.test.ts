// The 2026-11-08 audit: the README's code blocks on /how-it-works scroll sideways, but a keyboard user couldn't reach
// them (axe scrollable-region-focusable, serious). Vitest doesn't compile the app's JSX (tsconfig keeps it for Next), so
// this reads the page with the TypeScript parser: every <pre> it renders must be in the tab order.
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const FILE = path.join(process.cwd(), "app/how-it-works/page.tsx");
const source = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function preTags(node: ts.Node, out: ts.JsxOpeningLikeElement[] = []): ts.JsxOpeningLikeElement[] {
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "pre") out.push(node);
  ts.forEachChild(node, (child) => {
    preTags(child, out); // no return value: forEachChild stops at the first truthy one
  });
  return out;
}

function tabIndexOf(tag: ts.JsxOpeningLikeElement): string | undefined {
  const attr = tag.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === "tabIndex");
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer) return undefined;
  const init = attr.initializer;
  return ts.isJsxExpression(init) && init.expression ? init.expression.getText(source) : init.getText(source);
}

describe("/how-it-works code blocks", () => {
  const pres = preTags(source);

  it("renders the README's code blocks", () => {
    expect(pres.length).toBeGreaterThan(0);
  });

  it("puts every code block in the tab order, so its sideways scroll works from the keyboard", () => {
    for (const tag of pres) expect(tabIndexOf(tag)).toBe("0");
  });
});
