// SPEC Appendix B variants as workspace overrides, shared by the eval, the recorder and the guided demo.
// Bodies are derived from the seed by exact replacement, so they stay in step with data/seed.
import type { SourceOverride } from "@/lib/engine/types";
import { seedSources } from "./seed";
import { doc103Variant } from "./variantBodies";

export type VariantId = "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "F1";

/** D-041, golden only: the instant-rail exception also keeps the transfer fee on instant transfers. */
export const F1_FEE_LINE = "For instant-rail transfers, the transfer fee is not refunded.";

export function seedBody(id: string): string {
  const s = seedSources().find((x) => x.id === id);
  if (!s) throw new Error(`unknown source ${id}`);
  return s.body;
}

export const DOC103_BODIES = {
  B1: () => doc103Variant.B1(seedBody("DOC-103")),
  B2: () => doc103Variant.B2(seedBody("DOC-103")),
  B3: () => doc103Variant.B3(),
  B5: () => doc103Variant.B5(seedBody("DOC-103")),
};

/** "Save and verify (simulated)": text changes and the source is re-verified now. */
export function verifiedSave(id: string, body: string, at: string, version = 2): SourceOverride {
  return { id, body, version, updatedAt: at, verification: "verified", verifiedAt: at };
}

/** "Save draft": text changes, verification untouched → EDITED_AFTER_VERIFICATION. */
export function draftSave(id: string, body: string, at: string, version = 2): SourceOverride {
  return { id, body, version, updatedAt: at };
}

export function variantOverrides(v: VariantId, at: string): SourceOverride[] {
  switch (v) {
    case "B1":
      return [verifiedSave("DOC-103", DOC103_BODIES.B1(), at)];
    case "B2":
      return [verifiedSave("DOC-103", DOC103_BODIES.B2(), at)];
    case "B3":
      return [verifiedSave("DOC-103", DOC103_BODIES.B3(), at)];
    case "B4":
      return [{ id: "DOC-103", deleted: true }];
    case "B5":
      return [verifiedSave("DOC-103", DOC103_BODIES.B5(), at)];
    case "B6":
      return [draftSave("DOC-101", seedBody("DOC-101"), at)];
    case "B7":
      return [draftSave("DOC-103", DOC103_BODIES.B1(), at)];
    case "F1":
      return [verifiedSave("DOC-103", `${seedBody("DOC-103").trimEnd()}

${F1_FEE_LINE}
`, at)];
  }
}
