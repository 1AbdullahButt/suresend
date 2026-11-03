// Workspace overrides store (SPEC §9). Edits live in this browser and are sent with every check as overrides.
import type { Source, SourceOverride } from "@/lib/engine/types";
import { readJson, removeKey, writeJson } from "./storage";
import type { OverrideRecord } from "./types";

// v2: the seed docs' text changed in Phase 12, and an edit saved under v1 holds the old text.
const KEY = "suresend.overrides.v2";

export type OverrideMap = Record<string, OverrideRecord>;

export function loadOverrides(): OverrideMap {
  const raw = readJson<unknown>(KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as OverrideMap;
}

export function saveOverrides(map: OverrideMap): void {
  writeJson(KEY, map);
}

export function clearOverrides(): void {
  removeKey(KEY);
}

/** Starting record for a source that has no override yet. */
export function recordFrom(source: Source): OverrideRecord {
  return {
    id: source.id,
    body: source.body,
    version: source.version,
    updatedAt: source.updatedAt,
    verification: source.verification,
    verifiedAt: source.verifiedAt,
    flaggedOutdated: source.flaggedOutdated,
    ownerActive: source.owner?.active ?? true,
    deleted: false,
  };
}

/** The override array sent to /api/check and /api/send. The server ignores hidden or unknown IDs. */
export function toRequestOverrides(map: OverrideMap): SourceOverride[] {
  return Object.values(map).map((o) => ({
    id: o.id,
    body: o.body,
    version: o.version,
    updatedAt: o.updatedAt,
    verification: o.verification,
    verifiedAt: o.verifiedAt,
    flaggedOutdated: o.flaggedOutdated,
    ownerActive: o.ownerActive,
    deleted: o.deleted,
  }));
}

/** A stable fingerprint of the workspace, used to mark results stale after an edit. */
export function workspaceKey(map: OverrideMap): string {
  return Object.keys(map)
    .sort()
    .map((id) => {
      const o = map[id];
      if (!o) return id;
      const flags = `${o.flaggedOutdated ? 1 : 0}${o.ownerActive ? 1 : 0}${o.deleted ? 1 : 0}`;
      return `${id}@${o.version}:${o.verification}:${o.verifiedAt ?? "-"}:${flags}`;
    })
    .join("|");
}
