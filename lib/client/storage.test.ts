// Builder-owned tests for the localStorage migration from the pre-rename "answerguard.*" keys (D-031).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canPersist, readJson } from "./storage";

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("canPersist", () => {
  it("is true when localStorage works, and leaves nothing behind", () => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    expect(canPersist()).toBe(true);
    expect(store.size).toBe(0);
  });

  it("is false when the browser blocks it", () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error("denied");
      },
    };
    expect(canPersist()).toBe(false);
  });
});

describe("readJson legacy migration", () => {
  it("moves a legacy value to the new key when the new key is empty", () => {
    store.set("answerguard.metrics.v1", JSON.stringify({ caught: 2 }));
    expect(readJson("suresend.metrics.v1", null)).toEqual({ caught: 2 });
    expect(store.get("suresend.metrics.v1")).toBe(JSON.stringify({ caught: 2 }));
    expect(store.has("answerguard.metrics.v1")).toBe(false);
  });

  it("keeps the new value and still removes the legacy key when both exist", () => {
    store.set("answerguard.tour.seen.v1", "false");
    store.set("suresend.tour.seen.v1", "true");
    expect(readJson("suresend.tour.seen.v1", null)).toBe(true);
    expect(store.get("suresend.tour.seen.v1")).toBe("true");
    expect(store.has("answerguard.tour.seen.v1")).toBe(false);
  });

  it("returns the fallback when neither key exists", () => {
    expect(readJson("suresend.overrides.v1", { none: true })).toEqual({ none: true });
    expect(store.size).toBe(0);
  });
});
