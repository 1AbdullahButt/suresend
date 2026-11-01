"use client";
import { useEffect, useId, useState } from "react";
import type { Source } from "@/lib/engine/types";
import type { FixReview as FixReviewState, SaveMode } from "@/lib/client/useSureSend";
import { FixReview } from "./FixReview";
import { diffSummary, shortDate } from "@/lib/client/format";
import { cx, Tag, ui, type TagTone } from "@/components/ui/atoms";
import s from "./agent.module.css";

const MAX_DOC = 4000;

export interface DocEdit {
  body: string;
  verification: Source["verification"];
  flaggedOutdated: boolean;
  ownerActive: boolean;
}

function docTag(src: Source, edited: boolean): { text: string; tone: TagTone } {
  if (src.flaggedOutdated) return { text: "Outdated", tone: "amber" };
  if (src.kind === "slack" || src.kind === "release_note") return { text: "Proposal", tone: "ask" };
  if (src.verification === "verified" && src.verifiedAt && src.updatedAt > src.verifiedAt) return { text: "Edited", tone: "amber" };
  if (src.verification === "verified") return { text: "Verified", tone: "good" };
  if (src.verification === "expired") return { text: "Expired", tone: "amber" };
  if (src.visibility === "ops") return { text: "Restricted", tone: "neutral" };
  return { text: edited ? "Edited" : "Unverified", tone: edited ? "amber" : "neutral" };
}

const KIND: Record<Source["kind"], string> = { policy: "Policy", sop: "SOP", macro: "Macro", slack: "Slack", release_note: "Release note" };

function Switch({ checked, onChange, label, text }: { checked: boolean; onChange: (v: boolean) => void; label: string; text: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)}>
      <span className={s.sw} aria-hidden="true" />
      <span>{text}</span>
    </button>
  );
}

/**
 * Docs (design v2): edit a doc and re-check. "Save and re-check" = text only (a verified doc gets "edited after
 * verification", SPEC §9 Save draft). "Save and verify (simulated)" = text + verified now. Visible docs only.
 */
export function DocsView({
  sources,
  deleted,
  edited,
  focusId,
  preferredId,
  onSave,
  onRemove,
  onRestore,
  fixReview,
  holdsFor,
  onApproveFix,
  onDismissFix,
}: {
  sources: Source[];
  deleted: Source[];
  edited: (id: string) => boolean;
  focusId: string | null;
  preferredId: string | null;
  onSave: (source: Source, edit: DocEdit, mode: SaveMode) => void;
  onRemove: (source: Source) => void;
  onRestore: (id: string) => void;
  /** A doc-fix proposal under review (D-037): shown instead of the editor until approved or dismissed. */
  fixReview: FixReviewState | null;
  holdsFor: (docId: string) => number;
  onApproveFix: () => void;
  onDismissFix: () => void;
}) {
  const fallback = sources.find((x) => x.id === preferredId) ?? sources.find((x) => x.id === "DOC-103") ?? sources[0] ?? null;
  const [selId, setSelId] = useState<string | null>(focusId ?? fallback?.id ?? null);
  useEffect(() => {
    if (focusId) setSelId(focusId);
  }, [focusId]);
  const doc = sources.find((x) => x.id === selId) ?? fallback;

  if (fixReview) {
    return (
      <FixReview
        review={fixReview}
        holds={fixReview.proposal ? holdsFor(fixReview.proposal.doc.id) : 0}
        onApprove={onApproveFix}
        onDismiss={onDismissFix}
      />
    );
  }
  if (!doc) return <p className={s.note}>No docs are visible to this role.</p>;
  return (
    <DocEditor
      key={`${doc.id}@${doc.version}:${doc.verification}:${doc.flaggedOutdated}`}
      doc={doc}
      others={sources.filter((x) => x.id !== doc.id)}
      deleted={deleted}
      edited={edited}
      onPick={setSelId}
      onSave={onSave}
      onRemove={onRemove}
      onRestore={onRestore}
    />
  );
}

function DocEditor({
  doc,
  others,
  deleted,
  edited,
  onPick,
  onSave,
  onRemove,
  onRestore,
}: {
  doc: Source;
  others: Source[];
  deleted: Source[];
  edited: (id: string) => boolean;
  onPick: (id: string) => void;
  onSave: (source: Source, edit: DocEdit, mode: SaveMode) => void;
  onRemove: (source: Source) => void;
  onRestore: (id: string) => void;
}) {
  const [body, setBody] = useState(doc.body);
  const [verification, setVerification] = useState(doc.verification);
  const [flagged, setFlagged] = useState(doc.flaggedOutdated);
  const [ownerActive, setOwnerActive] = useState(doc.owner?.active ?? true);
  const textId = useId();
  const verId = useId();
  const dirty = body !== doc.body || verification !== doc.verification || flagged !== doc.flaggedOutdated || ownerActive !== (doc.owner?.active ?? true);
  const diff = diffSummary(doc.body, body);
  const edit: DocEdit = { body, verification, flaggedOutdated: flagged, ownerActive };
  const tag = docTag(doc, edited(doc.id));

  return (
    <div className={s.stack} style={{ flex: 1, gap: 16 }}>
      <div className={s.docHead} data-tour={`doc-${doc.id}`}>
        <h3 className={s.docName}>{doc.title}</h3>
        <div className={s.tags}>
          {doc.verification === "verified" && doc.verifiedAt ? (
            <Tag tone="good">Verified {shortDate(doc.verifiedAt)}</Tag>
          ) : (
            <Tag tone={tag.tone}>{tag.text}</Tag>
          )}
          <Tag tone="neutral">
            {KIND[doc.kind]}
            {doc.owner ? ` · ${doc.owner.name}` : ""}
          </Tag>
          {doc.flaggedOutdated ? <Tag tone="amber">Outdated</Tag> : null}
          {doc.visibility === "ops" ? <Tag tone="neutral">Ops only</Tag> : null}
        </div>
      </div>

      <label htmlFor={textId} className="sr-only">
        Document text
      </label>
      <textarea id={textId} className={s.docText} value={body} maxLength={MAX_DOC} spellCheck={false} onChange={(e) => setBody(e.target.value)} />

      {diff ? (
        <p className={s.diff}>
          <span className={s.edited}>Edited</span>
          {diff.removed ? <s>{diff.removed}</s> : null}
          <span aria-hidden="true">→</span>
          <span className="sr-only">changed to</span>
          <strong>{diff.added || "(removed)"}</strong>
        </p>
      ) : (
        <p className={s.note}>
          v{doc.version} · {body.length.toLocaleString("en-US")} / {MAX_DOC.toLocaleString("en-US")} characters
        </p>
      )}

      <div className={s.stack} style={{ gap: 8 }}>
        <button type="button" className={cx(ui.btn, ui.primary, ui.lg)} disabled={!dirty} onClick={() => onSave(doc, edit, "draft")}>
          Save and re-check
        </button>
        <button type="button" className={cx(ui.btn, ui.outline, ui.lg)} onClick={() => onSave(doc, edit, "verify")}>
          Save and verify (simulated)
        </button>
        <p className={s.note}>
          Saving without verifying tells SureSend the doc changed since it was verified, so it trusts it less. In Slite only the doc&apos;s
          owner or an admin verifies; this button simulates that.
        </p>
      </div>

      <details className={s.settings}>
        <summary>Doc settings</summary>
        <div className={s.settingsBody}>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor={verId}>
              Verification
            </label>
            <select id={verId} className={s.select} value={verification} onChange={(e) => setVerification(e.target.value as Source["verification"])}>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          {doc.owner ? (
            <div className={s.field}>
              <span className={s.fieldLabel}>Owner active</span>
              <Switch checked={ownerActive} onChange={setOwnerActive} label="Owner active" text={doc.owner.name} />
            </div>
          ) : null}
          <div className={s.field}>
            <span className={s.fieldLabel}>Flagged outdated</span>
            <Switch checked={flagged} onChange={setFlagged} label="Flagged outdated" text={flagged ? "Flagged" : "Not flagged"} />
          </div>
          <p className={s.note}>The effective date only changes through the text. Visibility comes from the seed.</p>
          <button type="button" className={cx(ui.btn, ui.outline, ui.sm)} onClick={() => onRemove(doc)}>
            Remove from this demo
          </button>
        </div>
      </details>

      <div className={s.otherDocs}>
        <h4 className={ui.sectionLabel}>Other docs</h4>
        {others.map((o) => {
          const t = docTag(o, edited(o.id));
          return (
            <button key={o.id} type="button" className={s.docBtn} onClick={() => onPick(o.id)}>
              <span>{o.title}</span>
              <Tag tone={t.tone}>{t.text}</Tag>
            </button>
          );
        })}
        {deleted.map((o) => (
          <button key={o.id} type="button" className={s.docBtn} onClick={() => onRestore(o.id)}>
            <span>
              <s>{o.title}</s>
            </span>
            <Tag tone="neutral">Removed · restore</Tag>
          </button>
        ))}
      </div>
    </div>
  );
}
