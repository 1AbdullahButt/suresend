// localStorage wrapped in try/catch with an in-memory fallback (SPEC §9). Private mode, quota errors and
// disabled storage all degrade to memory for this tab.
const memory = new Map<string, string>();

/** Keys were "answerguard.*" before the SureSend rename (D-031); returning visitors keep their workspace and metrics. */
const LEGACY_PREFIX = { from: "answerguard.", to: "suresend." } as const;

/** Copies the legacy value to `key` only when `key` has none; the legacy key is removed either way. */
function migrateLegacy(key: string, current: string | null): string | null {
  if (!key.startsWith(LEGACY_PREFIX.to)) return current;
  const legacy = LEGACY_PREFIX.from + key.slice(LEGACY_PREFIX.to.length);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(legacy);
  } catch {
    return current;
  }
  if (raw === null) return current;
  try {
    if (current === null) window.localStorage.setItem(key, raw);
    window.localStorage.removeItem(legacy);
  } catch {
    // quota or disabled storage: the legacy key stays and the next load retries
  }
  return current ?? raw;
}

export function readJson<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  raw = migrateLegacy(key, raw);
  if (raw === null) raw = memory.get(key) ?? null;
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // the memory fallback already holds it
  }
}

/** Whether a write here outlives this page: false when the browser blocks localStorage, so only the memory fallback holds it. */
export function canPersist(): boolean {
  const probe = "suresend.probe";
  try {
    window.localStorage.setItem(probe, "1");
    const ok = window.localStorage.getItem(probe) === "1";
    window.localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
