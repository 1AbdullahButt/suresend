"use client";
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { AiRunInfo, Role } from "@/lib/engine/types";
import { falseAlarmStats, type Metrics, type Review } from "@/lib/client/metrics";
import { aiModeLabel } from "@/lib/client/format";
import { OUTCOME } from "@/lib/client/outcome";
import { cx, ui } from "@/components/ui/atoms";
import s from "./shell.module.css";

export const PERSONA_NOTE = "Simulated personas. Anyone can switch. DOC-105 is synthetic. Never use this design with real restricted data.";

const ROLES: Array<{ role: Role; label: string }> = [
  { role: "support_agent", label: "Support agent" },
  { role: "ops_lead", label: "Ops lead" },
];

/** A metric tile: the group holds only its value (no other digits), named by the visible label. */
function Tile({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className={s.tile}>
      <span id={id} className={s.tileK}>
        {label}
      </span>
      <div role="group" aria-labelledby={id} className={s.tileV}>
        {value}
      </div>
    </div>
  );
}

/** The public source repo (README: problem, architecture, AI vs rules, tests, eval). */
const REPO_URL = "https://github.com/1AbdullahButt/suresend";
/** The remote MCP endpoint (D-036), in the pieces it may wrap between: after "https://" and before "/api/mcp" (D-040). */
const MCP_URL_PARTS = ["https://", "suresend-demo.vercel.app", "/api/mcp"] as const;
export const MCP_URL = MCP_URL_PARTS.join("");
/** The README section that explains how to add it. */
const MCP_HELP_URL = `${REPO_URL}#use-it-from-claude`;

/** "Use it from Claude (MCP)": the connector URL with a Copy button and a short spoken and visible confirmation. */
function McpSection() {
  const urlRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const t = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(t);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setStatus("copied");
      return;
    } catch {
      // No clipboard API access (permissions, an embedded or insecure context): fall back to selecting the URL.
    }
    const el = urlRef.current;
    const sel = window.getSelection();
    if (el && sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setStatus(el && sel && document.execCommand("copy") ? "copied" : "failed");
  };

  return (
    <div className={s.menuSection}>
      <h3 className={ui.sectionLabel} id="mcp-label">
        Use it from Claude (MCP)
      </h3>
      <p className={s.small}>Any AI agent can call SureSend before it replies.</p>
      <div className={s.mcpRow} role="group" aria-labelledby="mcp-label">
        <code ref={urlRef} className={s.mcpUrl}>
          {MCP_URL_PARTS.map((part, i) => (
            <Fragment key={part}>
              {i > 0 ? <wbr /> : null}
              <span className={s.urlPart}>{part}</span>
            </Fragment>
          ))}
        </code>
        <button type="button" className={cx(s.copyBtn, status === "copied" && s.copied)} onClick={() => void copy()}>
          {status === "copied" ? "Copied" : "Copy"}
          <span className="sr-only"> connector URL</span>
        </button>
      </div>
      <span className="sr-only" role="status">
        {status === "copied" ? "Connector URL copied" : ""}
      </span>
      {status === "failed" ? (
        <p className={s.small} role="alert">
          Couldn&apos;t copy. The URL is selected, so you can copy it yourself.
        </p>
      ) : null}
      <a className={s.mcpHelp} href={MCP_HELP_URL} target="_blank" rel="noopener noreferrer">
        How to connect
        <span className="sr-only"> (opens the README on GitHub in a new tab)</span>
      </a>
    </div>
  );
}

/**
 * Demo menu (design v2 DemoMenu artboard): personas, the three Impact numbers, the AI mode line, the past flags to
 * review, docs causing held replies, the MCP connector (D-039), the guided tour, Reset demo and "How it works · GitHub".
 * A non-modal popover dialog; Esc and outside clicks close it.
 */
export function DemoMenu({
  role,
  onRole,
  metrics,
  onReview,
  onReviewFix,
  ai,
  onTour,
  onReset,
  onClose,
  aboveTourBar = false,
}: {
  role: Role;
  onRole: (r: Role) => void;
  metrics: Metrics;
  onReview: (checkHash: string, r: Review | null) => void;
  /** "Review fix" for a doc in "Docs causing held replies" (D-037). */
  onReviewFix: (docId: string) => void;
  ai: AiRunInfo | null;
  onTour: () => void;
  onReset: () => void;
  onClose: () => void;
  /** A tour is running: it waits as a bar at the bottom while the menu is open, so the menu stops above it (D-040). */
  aboveTourBar?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const roleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fa = falseAlarmStats(metrics);
  const mode = aiModeLabel(ai);
  const modeDetail = ai && ai.model ? ` · ${[ai.provider, ai.model.replace(/^[^/]+\//, "")].filter(Boolean).join(" · ")}` : "";
  const dot = { live: s.dotLive, saved: "", off: s.dotOff, paused: s.dotPaused, none: s.dotNone }[mode.dot];

  useEffect(() => {
    titleRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-demo-menu-trigger], [role="dialog"]')) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      onClose();
    }
  };

  const onRoleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ROLES.findIndex((r) => r.role === role);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ROLES.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + ROLES.length) % ROLES.length;
    if (next < 0) return;
    e.preventDefault();
    const r = ROLES[next];
    if (r) {
      onRole(r.role);
      roleRefs.current[next]?.focus();
    }
  };

  const flags = metrics.flags;
  const heldDocs = Object.entries(metrics.heldByDoc).sort((a, b) => b[1].count - a[1].count);

  return (
    <div ref={ref} className={cx(s.menu, aboveTourBar && s.menuAboveBar)} role="dialog" aria-label="Demo menu" onKeyDown={onKey}>
      <h2 ref={titleRef} className={s.menuTitle} tabIndex={-1}>
        Demo
      </h2>

      <div className={s.menuSection}>
        <h3 className={ui.sectionLabel} id="viewing-as">
          Viewing as
        </h3>
        <div className={s.seg} role="radiogroup" aria-labelledby="viewing-as" aria-describedby="persona-note" onKeyDown={onRoleKey}>
          {ROLES.map((r, i) => (
            <button
              key={r.role}
              ref={(el) => {
                roleRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={role === r.role}
              tabIndex={role === r.role ? 0 : -1}
              onClick={() => onRole(r.role)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className={s.small} id="persona-note" title={PERSONA_NOTE}>
          Simulated roles. Ops lead also sees one restricted doc. Anyone can switch; never use this design with real restricted data.
        </p>
      </div>

      <div className={s.menuSection}>
        <h3 className={ui.sectionLabel}>Impact · this session</h3>
        <div className={s.tiles}>
          <Tile label="Replies checked" value={String(metrics.checked.length)} />
          <Tile label="Wrong ones stopped" value={String(metrics.intercepts)} />
          <Tile label={fa.rate === null ? "False alarms (need 3 reviews)" : `False alarms (of ${fa.reviewed} reviewed)`} value={fa.rate === null ? "–" : `${Math.round(fa.rate * 100)}%`} />
        </div>
        <p className={s.small}>Simulated in your browser, not real Slite data.</p>
        <p className={s.mode} role="status" aria-label={`AI mode: ${mode.text}${modeDetail}`}>
          <span className={cx(s.dot, dot)} aria-hidden="true" />
          <span>
            AI mode: {mode.text}
            {modeDetail}
          </span>
        </p>
        {flags.length ? (
          <details className={s.flags}>
            <summary>Review flagged replies ({flags.length})</summary>
            <ul className={s.flagList}>
              {flags.map((f) => (
                <li key={f.checkHash} className={s.flag}>
                  <p className={s.flagHead}>
                    <b>{OUTCOME[f.decision].name}</b> · {f.customer}: “{f.draft}”
                  </p>
                  <div className={s.reviewSeg} role="group" aria-label={`Review the ${OUTCOME[f.decision].name} on ${f.customer}`}>
                    {(
                      [
                        ["correct", "Correct catch"],
                        ["false_alarm", "False alarm"],
                      ] as const
                    ).map(([key, label]) => (
                      <button key={key} type="button" aria-pressed={f.review === key} onClick={() => onReview(f.checkHash, f.review === key ? null : key)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {heldDocs.length ? (
        <div className={s.menuSection}>
          <h3 className={ui.sectionLabel} id="held-docs">
            Docs causing held replies
          </h3>
          <ul className={s.heldDocs} aria-labelledby="held-docs">
            {heldDocs.map(([id, d]) => (
              <li key={id} className={s.heldDoc}>
                <span className={s.heldDocName}>
                  <b>{d.title}</b>
                  <span>
                    {d.count} held · copied {d.valueText}
                  </span>
                </span>
                {d.fixedText ? (
                  <span className={s.fixedTag}>Fix approved</span>
                ) : (
                  <button type="button" className={s.reviewFix} onClick={() => onReviewFix(id)} aria-label={`Review fix for ${d.title}`}>
                    Review fix
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className={s.small}>Simulated in your browser: replies held this session, by the doc they copied.</p>
        </div>
      ) : null}

      <McpSection />

      <div className={s.menuActions}>
        <button type="button" className={cx(ui.btn, ui.primary)} onClick={onTour}>
          Start guided tour
        </button>
        <button type="button" className={cx(ui.btn, ui.outline)} onClick={onReset}>
          Reset demo
        </button>
        <a className={s.howLink} href={REPO_URL} target="_blank" rel="noopener noreferrer">
          How it works · GitHub
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
