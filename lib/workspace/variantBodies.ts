// Pure Appendix B variant bodies: the exact replacements applied to a seed body. No I/O, so the browser
// (guided tour) and the Node scripts (variants.ts) share one definition and the saved responses replay.

export const B2_FROM = "Effective 27 Oct 2026. Approved by Head of Ops after the instant-transfer settlement change.";
export const B2_TO =
  "Proposed change, pending sign-off from Compliance. Not approved yet; do not use with customers until Jonas confirms.";
export const B3_BODY =
  "# Reversal Timeline Update\nEffective 27 Oct 2026. Approved by Head of Ops. Failed transfers are reversed within 1 business day.\n";

export function replaceOnce(body: string, from: string, to: string): string {
  if (!body.includes(from)) throw new Error(`variant: "${from}" not found in seed body`);
  return body.replace(from, to);
}

/**
 * Guided-tour step 6 asks the visitor to change "1 business day" to "2 business days" in DOC-103. Both ways of typing it
 * have saved responses (D-034), so the step never needs live AI: the full edit (the B1 body) and changing only the digit.
 */
export const tourStep5Edits = {
  full: (seed: string) => replaceOnce(seed, "1 business day", "2 business days"),
  digitOnly: (seed: string) => replaceOnce(seed, "1 business day", "2 business day"),
};

/** DOC-103 variant bodies, given DOC-103's seed body. B7 uses the B1 body with Save draft. */
export const doc103Variant = {
  B1: (seed: string) => replaceOnce(seed, "1 business day", "2 business days"),
  B2: (seed: string) => replaceOnce(seed, B2_FROM, B2_TO),
  B3: () => B3_BODY,
  B5: (seed: string) => replaceOnce(seed, "Effective 27 Oct 2026.", "Effective 1 Jan 2030."),
};
