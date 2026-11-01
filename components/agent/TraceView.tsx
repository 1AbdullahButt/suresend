"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { CheckResult } from "@/lib/engine/types";
import { mostSevereClaim } from "@/lib/client/format";
import { extractedCount, modelLine, OUTCOME, traceRows, type TraceRow } from "@/lib/client/outcome";
import { cx, Tag, ui } from "@/components/ui/atoms";
import s from "./agent.module.css";

const TAG_CLS = { good: s.pGood, check: s.pCheck, hold: s.pHold, ask: s.pAsk, off: s.pOff };

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g;

function tint(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of json.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(json.slice(last, at));
    if (m[1] !== undefined) {
      out.push(
        <span key={i++} className={m[2] ? s.jk : s.js}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else {
      out.push(
        <span key={i++} className={s.jn}>
          {m[0]}
        </span>,
      );
    }
    last = at + m[0].length;
  }
  out.push(json.slice(last));
  return out;
}

/** One trace row: plain summary, with the engine's verbatim detail (quotes, D5's conditions) behind "Details". */
function TraceItem({ row }: { row: TraceRow & { id: string } }) {
  const [open, setOpen] = useState(false);
  const detailId = `trace-detail-${row.id}`;
  const hasMore = row.detail.trim() !== row.summary.trim();
  return (
    <li className={cx(row.rule === "Claim" ? s.claimHead : row.outcome === "fired" && s.fired, row.outcome === "fail" && s.failed)}>
      <span className={s.rid} title={row.rule === row.label ? undefined : `Engine rule: ${row.rule}`}>
        {row.label}
      </span>
      <span className={s.rdetail}>
        <span>
          {row.rule === "Claim" ? null : row.outcome === "fired" ? <strong>Fired. </strong> : row.outcome === "fail" ? <strong>Failed. </strong> : null}
          {row.summary}
        </span>
        {hasMore ? (
          <button type="button" className={s.detailsBtn} aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide details" : "Details"}
          </button>
        ) : null}
        {hasMore && open ? (
          <span id={detailId} className={s.rfull}>
            {row.detail}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * The rule trace (design v2, for engineers), from the real CheckResult in engine order. By default only the rules that
 * mattered (fired, failed, or ruled a path out); the rest sit under "Show all N steps". Skipped rules, which only repeat
 * another rule's result, are never listed; the complete engine trace is in Raw JSON. Engine names and reason codes are
 * allowed here and in Raw JSON only.
 */
export function TraceView({ result, onBack, onOpenDoc }: { result: CheckResult; onBack: () => void; onOpenDoc: (id: string) => void }) {
  const [raw, setRaw] = useState(false);
  const [all, setAll] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  const rows = traceRows(result).map((r, i) => ({ ...r, id: `${r.rule}-${i}` }));
  const shown = all ? rows : rows.filter((r) => r.key);
  const hidden = rows.length - rows.filter((r) => r.key).length;
  const tone = OUTCOME[result.decision].tone;
  const gov = mostSevereClaim(result)?.governing?.sourceId;
  const firstDoc = gov ?? result.claims[0]?.evidence[0]?.source.id;

  return (
    <div className={s.stack} style={{ flex: 1, gap: 14 }}>
      <div className={s.viewHead}>
        <button ref={backRef} type="button" className={ui.round} aria-label="Back to Why" onClick={onBack}>
          <ChevronLeft aria-hidden="true" strokeWidth={2.2} />
        </button>
        <h3 className={s.viewTitle}>Rule trace</h3>
        <span className={cx(s.traceTag, TAG_CLS[tone])}>{result.decision}</span>
      </div>

      <div className={s.tags}>
        <Tag tone="ask">AI extracted: {extractedCount(result)} claims</Tag>
        <Tag tone="ink">Rules decided</Tag>
        <Tag tone="neutral">{modelLine(result.ai)}</Tag>
        <Tag tone="neutral">{result.reasonCode}</Tag>
      </div>

      <ol className={s.traceList} aria-label={all ? "All rule steps in the order they ran" : "Rules that mattered, in the order they ran"}>
        {shown.map((r) => (
          <TraceItem key={r.id} row={r} />
        ))}
      </ol>
      {hidden > 0 || all ? (
        <button type="button" className={s.showAll} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show only the rules that mattered" : `Show all ${rows.length} steps`}
        </button>
      ) : null}

      {raw ? (
        <pre className={s.json} tabIndex={0} aria-label="Raw CheckResult JSON">
          {tint(JSON.stringify(result, null, 2))}
        </pre>
      ) : null}

      <div className={s.twoBtns}>
        <button type="button" className={cx(ui.btn, ui.outline, ui.sm)} aria-pressed={raw} onClick={() => setRaw((v) => !v)}>
          Raw JSON
        </button>
        <button type="button" className={cx(ui.btn, ui.outline, ui.sm)} onClick={() => firstDoc && onOpenDoc(firstDoc)} disabled={!firstDoc}>
          Open the docs
        </button>
      </div>
    </div>
  );
}
