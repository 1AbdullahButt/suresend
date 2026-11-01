"use client";
// Client state for the demo shell: seed, tickets, drafts, rails, workspace overrides, checks, sends, metrics.
// The server is the source of truth for decisions; this hook only orchestrates requests and remembers results.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckResult, Rail, Role, Source, Ticket } from "@/lib/engine/types";
import { mergeOverrides } from "@/lib/workspace/merge";
import { doc103Variant } from "@/lib/workspace/variantBodies";
import { findFixSource } from "@/lib/fix/source";
import type { FixProposal } from "@/lib/fix/propose";
import { fixStillApplies } from "@/lib/fix/validate";
import { ApiError, fetchSeed, postCheck, postFix, postSend, type CheckRequest } from "./api";
import {
  clearMetrics,
  emptyMetrics,
  loadMetrics,
  recordCheck,
  markDocFixed,
  recordDocHold,
  recordIntercept,
  saveMetrics,
  setReview,
  type Metrics,
  type Review,
} from "./metrics";
import type { AgentView, CheckKey, OverrideRecord, SeedResponse, StaleReason, StoredResult, Tab } from "./types";
import { mostSevereClaim } from "./format";
import { valueAdjective } from "./outcome";
import {
  clearOverrides,
  loadOverrides,
  saveOverrides,
  toRequestOverrides,
  workspaceKey,
  type OverrideMap,
} from "./workspace";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "blocked"; result: CheckResult }
  | { kind: "ack_required"; result: CheckResult }
  | { kind: "unavailable"; result: CheckResult }
  | { kind: "sent"; customer: string; payoff: Payoff | null };

/** Design v2 "Sent" payoff: shown when a successful send followed a held draft (real values only). */
export interface Payoff {
  customer: string;
  /** e.g. "4-business-day"; null when the held draft had no value. */
  heldValue: string | null;
}

export interface SentMessage {
  text: string;
  at: string;
}

export interface CheckingState {
  ticketId: string;
  step: 0 | 1 | 2;
  sourceCount: number;
}

export interface Toast {
  id: number;
  message: string;
}

export type SaveMode = "draft" | "verify";

function nowIso(): string {
  return new Date().toISOString();
}

export function useSureSend() {
  const [role, setRole] = useState<Role>("support_agent");
  const [seed, setSeed] = useState<SeedResponse | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rails, setRails] = useState<Record<string, Rail>>({});
  const [sent, setSent] = useState<Record<string, SentMessage[]>>({});
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [results, setResults] = useState<Record<string, StoredResult>>({});
  const [checking, setChecking] = useState<CheckingState | null>(null);
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>("check");
  const [view, setView] = useState<AgentView>("main");
  const [held, setHeld] = useState<Record<string, string | null>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [docFocus, setDocFocus] = useState<{ sourceId: string; nonce: number } | null>(null);
  const [fixReview, setFixReview] = useState<FixReview | null>(null);
  /** Title of the doc whose fix was last approved this session (the tour acknowledges it). */
  const [fixApproved, setFixApproved] = useState<{ docId: string; title: string; text: string } | null>(null);
  const fixRequestId = useRef(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pausedDismissed, setPausedDismissed] = useState(false);
  const [lastAi, setLastAi] = useState<CheckResult["ai"] | null>(null);

  // Latest values for async callbacks.
  const ref = useRef({ role, seed, selectedId, drafts, rails, overrides, metrics, results, held });
  ref.current = { role, seed, selectedId, drafts, rails, overrides, metrics, results, held };
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<number[]>([]);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  // ---- load browser state (after mount, so SSR and the first client render match) -----------------
  useEffect(() => {
    setOverrides(loadOverrides());
    setMetrics(loadMetrics());
  }, []);

  const updateMetrics = useCallback((fn: (m: Metrics) => Metrics) => {
    setMetrics((m) => {
      const next = fn(m);
      saveMetrics(next);
      return next;
    });
  }, []);

  /**
   * A doc whose approved fix is gone (the doc restored or removed, or saved without the added text) no longer counts as
   * fixed. `newBody` is the doc's text after a save; null docId means every doc (restore seed versions).
   */
  const forgetFix = useCallback(
    (docId: string | null, newBody?: string) => {
      const stillThere = (text: string | undefined) => newBody !== undefined && !!text && newBody.includes(text);
      setFixApproved((a) => (a && (docId === null || a.docId === docId) && !stillThere(a.text) ? null : a));
      updateMetrics((m) => {
        const ids = docId === null ? Object.keys(m.heldByDoc) : [docId];
        return ids.reduce((acc, id) => (stillThere(acc.heldByDoc[id]?.fixedText) ? acc : markDocFixed(acc, id, null)), m);
      });
    },
    [updateMetrics],
  );

  // ---- seed ---------------------------------------------------------------------------------------
  const loadSeed = useCallback(
    async (forRole: Role) => {
      setSeedError(null);
      try {
        const data = await fetchSeed(forRole);
        setSeed(data);
        setDrafts((d) => {
          const next = { ...d };
          for (const t of data.tickets) if (next[t.id] === undefined) next[t.id] = t.draft;
          return next;
        });
        setRails((r) => {
          const next = { ...r };
          for (const t of data.tickets) if (next[t.id] === undefined) next[t.id] = t.rail;
          return next;
        });
        setSelectedId((id) => id || data.tickets[0]?.id || "");
        return data;
      } catch (e) {
        setSeedError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    void loadSeed("support_agent");
  }, [loadSeed]);

  // ---- derived ------------------------------------------------------------------------------------
  const tickets: Ticket[] = seed?.tickets ?? [];
  const ticket = tickets.find((t) => t.id === selectedId) ?? null;
  const draft = ticket ? (drafts[ticket.id] ?? "") : "";
  const rail: Rail = ticket ? (rails[ticket.id] ?? ticket.rail) : "unknown";
  const wsKey = useMemo(() => workspaceKey(overrides), [overrides]);

  /** Seed sources visible to the persona, with this browser's edits merged (deleted ones kept separately). */
  const effectiveSources: Source[] = useMemo(
    () => mergeOverrides(seed?.sources ?? [], toRequestOverrides(overrides)),
    [seed, overrides],
  );
  const deletedSources: Source[] = useMemo(
    () => (seed?.sources ?? []).filter((s) => overrides[s.id]?.deleted),
    [seed, overrides],
  );
  const editedCount = Object.keys(overrides).length;

  const stored = ticket ? (results[ticket.id] ?? null) : null;
  const staleReason: StaleReason = useMemo(() => {
    if (!stored || !ticket) return null;
    const k = stored.key;
    if (k.draft !== draft) return "draft";
    if (k.rail !== rail) return "rail";
    if (k.role !== role) return "persona";
    if (k.workspace !== wsKey) return "workspace";
    return null;
  }, [stored, ticket, draft, rail, role, wsKey]);

  const railOf = (id: string): Rail => rails[id] ?? tickets.find((t) => t.id === id)?.rail ?? "unknown";
  /** Whether a ticket's last result no longer matches its current draft, rail, persona or workspace. */
  const isStale = (id: string): boolean => {
    const r = results[id];
    if (!r) return false;
    const k = r.key;
    return k.draft !== (drafts[id] ?? "") || k.rail !== railOf(id) || k.role !== role || k.workspace !== wsKey;
  };

  const sendState: SendState = ticket ? (sendStates[ticket.id] ?? { kind: "idle" }) : { kind: "idle" };
  const ack = ticket ? (acks[ticket.id] ?? false) : false;

  // ---- check --------------------------------------------------------------------------------------
  const clearTimers = () => {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  };

  /** An honest client-side sequence: the server reads the draft, then the docs, then applies the rules, in one request. */
  const startProgress = useCallback((ticketId: string, sourceCount: number) => {
    clearTimers();
    setChecking({ ticketId, step: 0, sourceCount });
    timersRef.current.push(
      window.setTimeout(() => setChecking((c) => (c && c.ticketId === ticketId ? { ...c, step: 1 } : c)), 350),
      window.setTimeout(() => setChecking((c) => (c && c.ticketId === ticketId ? { ...c, step: 2 } : c)), 900),
    );
  }, []);

  const stopProgress = useCallback(() => {
    clearTimers();
    setChecking(null);
  }, []);

  const buildRequest = useCallback(
    (over?: { overrides?: OverrideMap; role?: Role; ticketId?: string }): { req: CheckRequest; key: CheckKey } | null => {
      const st = ref.current;
      const ticketId = over?.ticketId ?? st.selectedId;
      const t = st.seed?.tickets.find((x) => x.id === ticketId);
      if (!t) return null;
      const ov = over?.overrides ?? st.overrides;
      const r = over?.role ?? st.role;
      const req: CheckRequest = {
        ticketId,
        rail: st.rails[ticketId] ?? t.rail,
        draft: st.drafts[ticketId] ?? "",
        role: r,
        overrides: toRequestOverrides(ov),
      };
      return { req, key: { ticketId, rail: req.rail, draft: req.draft, role: r, workspace: workspaceKey(ov) } };
    },
    [],
  );

  const storeResult = useCallback(
    (key: CheckKey, result: CheckResult, because: string | null) => {
      setResults((prev) => {
        const old = prev[key.ticketId];
        const changedFrom =
          because && old && old.result.decision !== result.decision ? { decision: old.result.decision, because } : null;
        return { ...prev, [key.ticketId]: { key, result, changedFrom } };
      });
      setLastAi(result.ai);
      if (result.ai.paused) setPausedDismissed(false);
      const t = ref.current.seed?.tickets.find((x) => x.id === key.ticketId);
      updateMetrics((m) => recordCheck(m, key.ticketId, t?.customer ?? key.ticketId, key.draft, result, nowIso()));
    },
    [updateMetrics],
  );

  const runCheck = useCallback(
    async (opts?: { overrides?: OverrideMap; role?: Role; because?: string }) => {
      const built = buildRequest(opts);
      if (!built) return;
      const { req, key } = built;
      if (!req.draft.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      startProgress(key.ticketId, mergeOverrides(ref.current.seed?.sources ?? [], req.overrides).length);
      setView("main");
      setSendStates((s) => ({ ...s, [key.ticketId]: s[key.ticketId]?.kind === "sent" ? { kind: "idle" } : (s[key.ticketId] ?? { kind: "idle" }) }));
      try {
        const result = await postCheck(req, controller.signal);
        if (controller.signal.aborted) return;
        storeResult(key, result, opts?.because ?? null);
        // A fresh check supersedes any earlier send outcome for this ticket (blocked, ack, unavailable).
        setSendStates((st) => (st[key.ticketId] && st[key.ticketId]?.kind !== "sending" ? { ...st, [key.ticketId]: { kind: "idle" } } : st));
      } catch (e) {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        const msg =
          e instanceof ApiError && e.status === 429
            ? "Too many checks right now. Wait a moment and try again."
            : `Check failed: ${e instanceof Error ? e.message : String(e)}`;
        showToast(msg);
      } finally {
        if (abortRef.current === controller) {
          stopProgress();
          abortRef.current = null;
        }
      }
    },
    [buildRequest, storeResult, showToast, startProgress, stopProgress],
  );

  useEffect(() => () => clearTimers(), []);

  // ---- send ---------------------------------------------------------------------------------------
  /** Design v2: Send runs the check (POST /api/send reruns it on the server, SPEC §6.8). */
  const send = useCallback(async (opts?: { acknowledged?: boolean }) => {
    const built = buildRequest();
    if (!built) return;
    const { req, key } = built;
    if (!req.draft.trim()) return;
    const ticketId = key.ticketId;
    const acknowledged = opts?.acknowledged ?? acks[ticketId] ?? false;
    setSendStates((s) => ({ ...s, [ticketId]: { kind: "sending" } }));
    setView("main");
    startProgress(ticketId, mergeOverrides(ref.current.seed?.sources ?? [], req.overrides).length);
    try {
      const out = await postSend({ ...req, acknowledged });
      storeResult(key, out.result, null);
      if (out.kind === "sent") {
        const customer = ref.current.seed?.tickets.find((t) => t.id === ticketId)?.customer ?? "the customer";
        const heldBefore = ref.current.held[ticketId];
        const payoff: Payoff | null = heldBefore !== undefined ? { customer, heldValue: heldBefore } : null;
        setHeld((h) => Object.fromEntries(Object.entries(h).filter(([k]) => k !== ticketId)));
        setSent((s) => ({ ...s, [ticketId]: [...(s[ticketId] ?? []), { text: req.draft, at: nowIso() }] }));
        setDrafts((d) => ({ ...d, [ticketId]: "" }));
        ref.current.drafts = { ...ref.current.drafts, [ticketId]: "" };
        setAcks((a) => ({ ...a, [ticketId]: false }));
        setSendStates((s) => ({ ...s, [ticketId]: { kind: "sent", customer, payoff } }));
      } else if (out.kind === "blocked") {
        updateMetrics(recordIntercept);
        // D-037: attribute the held reply to the doc it copied, for "Docs causing held replies".
        const copied = findFixSource(out.result);
        if (copied) {
          updateMetrics((m) =>
            recordDocHold(m, copied.source.id, copied.source.title, copied.draftValueText, { ticketId, rail: req.rail, draft: req.draft }),
          );
        }
        setHeld((h) => ({ ...h, [ticketId]: valueAdjective(mostSevereClaim(out.result)?.draftClaim.value ?? null) }));
        setSendStates((s) => ({ ...s, [ticketId]: { kind: "blocked", result: out.result } }));
      } else if (out.kind === "ack_required") {
        setSendStates((s) => ({ ...s, [ticketId]: { kind: "ack_required", result: out.result } }));
      } else {
        setSendStates((s) => ({ ...s, [ticketId]: { kind: "unavailable", result: out.result } }));
      }
    } catch (e) {
      setSendStates((s) => ({ ...s, [ticketId]: { kind: "idle" } }));
      showToast(`Send failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      stopProgress();
    }
  }, [acks, buildRequest, storeResult, updateMetrics, showToast, startProgress, stopProgress]);

  // ---- editing ------------------------------------------------------------------------------------
  const setDraft = useCallback((text: string) => {
    const id = ref.current.selectedId;
    if (!id) return;
    // Keep the ref in step so an immediate follow-up (guided tour: use safe reply, then send) sees the new text.
    ref.current.drafts = { ...ref.current.drafts, [id]: text };
    setDrafts((d) => ({ ...d, [id]: text }));
    setSendStates((s) => (s[id] && s[id]?.kind !== "idle" && s[id]?.kind !== "sending" ? { ...s, [id]: { kind: "idle" } } : s));
    setAcks((a) => (a[id] ? { ...a, [id]: false } : a));
  }, []);

  const setRail = useCallback((r: Rail) => {
    const id = ref.current.selectedId;
    if (!id) return;
    // D-021: a rail change marks the result stale; it does not rerun automatically.
    setRails((x) => ({ ...x, [id]: r }));
  }, []);

  const setAck = useCallback((v: boolean) => {
    const id = ref.current.selectedId;
    if (id) setAcks((a) => ({ ...a, [id]: v }));
  }, []);

  const selectTicket = useCallback((id: string) => {
    setSelectedId(id);
    setMobileView("thread");
    setView("main");
  }, []);

  /**
   * Guided tour: open a ticket with its seed rail and (optionally) a given draft, synchronously enough that a
   * check or send issued right after uses them.
   */
  const prepareTicket = useCallback((id: string, draft?: string) => {
    const t = ref.current.seed?.tickets.find((x) => x.id === id);
    if (!t) return;
    ref.current.selectedId = id;
    ref.current.rails = { ...ref.current.rails, [id]: t.rail };
    setSelectedId(id);
    setMobileView("thread");
    setView("main");
    setRails((r) => ({ ...r, [id]: t.rail }));
    if (draft !== undefined) {
      ref.current.drafts = { ...ref.current.drafts, [id]: draft };
      setDrafts((d) => ({ ...d, [id]: draft }));
      setSendStates((st) => (st[id] && st[id]?.kind !== "sending" ? { ...st, [id]: { kind: "idle" } } : st));
      setAcks((a) => (a[id] ? { ...a, [id]: false } : a));
    }
  }, []);

  const applySafeReply = useCallback(() => {
    const id = ref.current.selectedId;
    const r = ref.current.results[id]?.result;
    if (r?.suggestion) setDraft(r.suggestion.text);
  }, [setDraft]);

  const switchRole = useCallback(
    async (r: Role) => {
      if (r === ref.current.role) return;
      setRole(r);
      const data = await loadSeed(r);
      if (!data) return;
      // Switching persona reruns the check (DESIGN.md RoleSwitch) when this ticket already has a result.
      const id = ref.current.selectedId;
      if (ref.current.results[id] && (ref.current.drafts[id] ?? "").trim()) {
        ref.current.seed = data;
        void runCheck({ role: r, because: `persona switched to ${r === "ops_lead" ? "Ops lead" : "Support agent"}` });
      }
    },
    [loadSeed, runCheck],
  );

  const commitOverrides = useCallback((next: OverrideMap) => {
    saveOverrides(next);
    setOverrides(next);
    ref.current.overrides = next;
  }, []);

  /** Sources editor save (SPEC §9). Save draft: text only. Save and verify (simulated): text + verified now. */
  const saveSource = useCallback(
    (source: Source, edit: { body: string; verification: Source["verification"]; flaggedOutdated: boolean; ownerActive: boolean }, mode: SaveMode) => {
      forgetFix(source.id, edit.body);
      const now = nowIso();
      const prev = ref.current.overrides[source.id];
      const bodyChanged = edit.body !== source.body;
      const version = bodyChanged || mode === "verify" ? source.version + 1 : source.version;
      let verification = edit.verification;
      let verifiedAt = source.verifiedAt;
      if (mode === "verify") {
        verification = "verified";
        verifiedAt = now;
      } else if (edit.verification !== source.verification && edit.verification === "verified") {
        verifiedAt = now; // the status select is a simulated governance toggle, like Save and verify
      }
      const rec: OverrideRecord = {
        id: source.id,
        body: edit.body,
        version,
        updatedAt: bodyChanged ? now : (prev?.updatedAt ?? source.updatedAt),
        verification,
        verifiedAt,
        flaggedOutdated: edit.flaggedOutdated,
        ownerActive: edit.ownerActive,
        deleted: false,
      };
      // Verifying "now" must not leave updatedAt later than verifiedAt.
      if (mode === "verify") rec.updatedAt = now;
      const next = { ...ref.current.overrides, [source.id]: rec };
      commitOverrides(next);
      setTab("check");
      const because = `${source.id} v${version} ${mode === "verify" ? "saved and verified (simulated)" : "saved as a draft"}`;
      void runCheck({ overrides: next, because });
    },
    [commitOverrides, runCheck],
  );

  /**
   * Guided tour, SPEC §16 step 5: Appendix B variant B7 = DOC-103 "1 business day" → "2 business days" saved with
   * Save draft. The body is the exact seed replacement (lib/workspace/variantBodies.ts), so saved responses replay.
   */
  const applyB7 = useCallback(() => {
    // Always from the seed version (v1, verified Oct 26), exactly like variantOverrides("B7"): v2, updatedAt now.
    const seedDoc = ref.current.seed?.sources.find((x) => x.id === "DOC-103");
    if (!seedDoc) return false;
    saveSource(
      seedDoc,
      {
        body: doc103Variant.B1(seedDoc.body),
        verification: seedDoc.verification,
        flaggedOutdated: seedDoc.flaggedOutdated,
        ownerActive: seedDoc.owner?.active ?? true,
      },
      "draft",
    );
    return true;
  }, [saveSource]);

  const deleteSource = useCallback(
    (source: Source) => {
      forgetFix(source.id);
      const base = ref.current.overrides[source.id];
      const rec: OverrideRecord = base
        ? { ...base, deleted: true }
        : {
            id: source.id,
            body: source.body,
            version: source.version,
            updatedAt: source.updatedAt,
            verification: source.verification,
            verifiedAt: source.verifiedAt,
            flaggedOutdated: source.flaggedOutdated,
            ownerActive: source.owner?.active ?? true,
            deleted: true,
          };
      const next = { ...ref.current.overrides, [source.id]: rec };
      commitOverrides(next);
      setTab("check");
      void runCheck({ overrides: next, because: `${source.id} removed from the workspace` });
    },
    [commitOverrides, runCheck],
  );

  const restoreSource = useCallback(
    (id: string) => {
      forgetFix(id);
      const next = { ...ref.current.overrides };
      delete next[id];
      commitOverrides(next);
      void runCheck({ overrides: next, because: `${id} restored to its seed version` });
    },
    [commitOverrides, runCheck],
  );

  /** AI unavailable → "Restore seed versions": clears overrides so saved responses can replay. */
  const restoreSeedVersions = useCallback(() => {
    forgetFix(null);
    clearOverrides();
    setOverrides({});
    ref.current.overrides = {};
    void runCheck({ overrides: {}, because: "seed versions restored" });
  }, [runCheck]);

  /** Reset workspace: clears overrides AND metrics (SPEC §9). */
  const resetWorkspace = useCallback(() => {
    clearOverrides();
    clearMetrics();
    setOverrides({});
    ref.current.overrides = {};
    setMetrics(emptyMetrics());
    setDocFocus(null);
    setFixReview(null);
    setFixApproved(null);
    setHeld({});
    showToast("Demo reset: seed docs restored and this browser's numbers cleared.");
  }, [showToast]);

  const review = useCallback(
    (checkHash: string, r: Review | null) => updateMetrics((m) => setReview(m, checkHash, r)),
    [updateMetrics],
  );

  /** Trace → "Open the docs": the Docs tab with the given doc selected. */
  const openDoc = useCallback((sourceId: string) => {
    setFixReview(null);
    setDocFocus({ sourceId, nonce: Date.now() });
    setTab("docs");
  }, []);

  /**
   * "Fix the doc that caused this" (D-037): asks the server for a proposal for the current reply (or a held reply from the
   * Demo menu) and shows it in the Docs tab. Nothing is applied until approveFix.
   */
  const openFixReview = useCallback(
    (from?: { ticketId: string; rail: Rail; draft: string }) => {
      const st = ref.current;
      const req: CheckRequest | null = from
        ? { ...from, role: st.role, overrides: toRequestOverrides(st.overrides) }
        : (buildRequest()?.req ?? null);
      if (!req || !req.draft.trim()) return;
      const id = ++fixRequestId.current;
      setTab("docs");
      setFixReview({ status: "loading", proposal: null, why: null });
      postFix(req)
        .then((r) => {
          if (id !== fixRequestId.current) return;
          setFixReview(r.proposal ? { status: "ready", proposal: r.proposal, why: null } : { status: "none", proposal: null, why: r.why });
        })
        .catch((e: unknown) => {
          if (id !== fixRequestId.current) return;
          setFixReview({ status: "error", proposal: null, why: e instanceof Error ? e.message : String(e) });
        });
    },
    [buildRequest],
  );

  /** Approve fix (simulated): the proposal becomes an ordinary doc edit, saved and verified, and the reply is rechecked. */
  const approveFix = useCallback(() => {
    const p = fixReview?.proposal;
    const doc = p ? effectiveSources.find((x) => x.id === p.doc.id) : undefined;
    if (!p || !doc) return;
    if (!fixStillApplies(doc.body, p)) {
      setFixReview({ status: "error", proposal: null, why: "The doc changed after this fix was drafted. Open the review again." });
      return;
    }
    fixRequestId.current++;
    setFixReview(null);
    saveSource(doc, { body: p.after, verification: doc.verification, flaggedOutdated: doc.flaggedOutdated, ownerActive: doc.owner?.active ?? true }, "verify");
    setFixApproved({ docId: p.doc.id, title: p.doc.title, text: p.edit.text });
    updateMetrics((m) => markDocFixed(m, p.doc.id, p.edit.text));
    showToast(`Fix approved: ${p.doc.title} now names the exception (simulated approval and verification).`);
  }, [fixReview, effectiveSources, saveSource, showToast, updateMetrics]);

  const dismissFix = useCallback(() => {
    fixRequestId.current++;
    setFixReview(null);
  }, []);

  return {
    role,
    seed,
    seedError,
    tickets,
    ticket,
    draft,
    rail,
    results,
    stored,
    staleReason,
    checking: checking && ticket && checking.ticketId === ticket.id ? checking : null,
    anyChecking: checking !== null,
    sendState,
    ack,
    tab,
    panelOpen,
    mobileView,
    docFocus,
    fixReview,
    fixApproved,
    view,
    toast,
    pausedDismissed,
    lastAi,
    metrics,
    overrides,
    effectiveSources,
    deletedSources,
    editedCount,
    sent: ticket ? (sent[ticket.id] ?? []) : [],
    railOf,
    isStale,
    sendStateOf: (id: string): SendState => sendStates[id] ?? { kind: "idle" },
    actions: {
      loadSeed: () => loadSeed(ref.current.role),
      selectTicket,
      setDraft,
      setRail,
      setAck,
      runCheck: () => runCheck(),
      prepareTicket,
      applyB7,
      send,
      applySafeReply,
      switchRole,
      saveSource,
      deleteSource,
      restoreSource,
      restoreSeedVersions,
      resetWorkspace,
      review,
      openDoc,
      openFixReview,
      approveFix,
      dismissFix,
      setView,
      setTab,
      setPanelOpen,
      setMobileView,
      dismissToast: () => setToast(null),
      dismissPaused: () => setPausedDismissed(true),
    },
  };
}

export type SureSend = ReturnType<typeof useSureSend>;

/** The Triage-style review of a doc-fix proposal in the Docs tab (D-037). */
export interface FixReview {
  status: "loading" | "ready" | "none" | "error";
  proposal: FixProposal | null;
  /** Why there's no proposal, or what went wrong. */
  why: string | null;
}
