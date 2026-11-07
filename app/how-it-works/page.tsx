// "How it works" (Demo menu link). The GitHub repo is private, so the README is rendered here at build time instead of
// linking to it. A deliberately small Markdown subset: headings, paragraphs, lists, quotes, code blocks, tables, inline
// code/bold/italic and external links. Links into the repo render as plain text.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import s from "./page.module.css";

export const metadata: Metadata = { title: "How it works · SureSend" };
export const dynamic = "force-static";

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(_[^_]+_)|(!?\[[^\]]*\]\([^)]+\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else if (m[3]) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (m[4]) {
      const lm = /^(!?)\[([^\]]*)\]\(([^)]+)\)$/.exec(tok);
      const isImg = lm?.[1] === "!";
      const label = lm?.[2] ?? "";
      const href = lm?.[3] ?? "";
      if (isImg) {
        // README images live in docs/ for GitHub; the same files are served from public/ here.
        const src = href.startsWith("docs/") ? `/${href.slice("docs/".length)}` : href;
        // eslint-disable-next-line @next/next/no-img-element -- static README asset, no optimisation needed
        out.push(<img key={key} src={src} alt={label} style={{ maxWidth: "100%", height: "auto", borderRadius: 16 }} />);
      }
      else if (/^https?:/.test(href)) out.push(<a key={key} href={href}>{inline(label, key)}</a>);
      else out.push(<span key={key}>{inline(label, key)}</span>);
    } else if (m[5]) out.push(<a key={key} href={tok}>{tok}</a>);
    last = at + tok.length;
  }
  out.push(text.slice(last));
  return out;
}

function render(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const key = `b${k++}`;
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) body.push(lines[i++] ?? "");
      i++;
      // tabIndex: a long line scrolls sideways, and a keyboard user needs to reach that scroll (axe scrollable-region-focusable).
      blocks.push(
        <pre key={key} className={s.pre} tabIndex={0}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      const text = h[2] ?? "";
      const id = slug(text);
      blocks.push(
        level === 1 ? (
          <h1 key={key} id={id}>
            {inline(text, key)}
          </h1>
        ) : level === 2 ? (
          <h2 key={key} id={id}>
            {inline(text, key)}
          </h2>
        ) : (
          <h3 key={key} id={id}>
            {inline(text, key)}
          </h3>
        ),
      );
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        const cells = (lines[i] ?? "").replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className={s.tableWrap}>
          <table>
            {head ? (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j}>{inline(c, `${key}h${j}`)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? "")) {
        let item = (lines[i] ?? "").replace(/^\s*([-*]|\d+\.)\s+/, "");
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? "") && !/^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? "")) item += " " + (lines[i++] ?? "").trim();
        items.push(item);
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${key}l${j}`)}</li>);
      blocks.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (line.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) q.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key}>{inline(q.join(" "), key)}</blockquote>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(#{1,4}\s|```|\||>|\s*([-*]|\d+\.)\s)/.test(lines[i] ?? "")) para.push(lines[i++] ?? "");
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return blocks;
}

export default function HowItWorks() {
  const md = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" className={s.back}>
          ← Back to the demo
        </Link>
      </header>
      <main className={s.doc}>{render(md)}</main>
      <footer className={s.footer}>Independent concept for Slite Agent · synthetic data · not affiliated with Slite</footer>
    </div>
  );
}
