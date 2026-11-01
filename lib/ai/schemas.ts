// AI output schemas (SPEC §6.2). The model fills the "wire" shape below; zod validates it and it is then mapped
// onto SourceClaim / DraftClaim. JSON schemas follow Groq strict-mode rules (D-009): every property required,
// additionalProperties false, optional values as nullable.
import { z } from "zod";
import type { DraftClaim, SourceClaim, SourceForExtraction } from "@/lib/engine/types";

/** Bump whenever a zod schema or the topic taxonomy changes (SPEC §10 cache identity). */
export const SCHEMA_VERSION = "2026-10-30.1";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Models sometimes return "27 Oct 2026" despite the ISO instruction. Normalize common shapes to YYYY-MM-DD;
 * anything unparseable becomes null (no effective date) rather than failing the whole extraction.
 */
export function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})$/);
  const mdy = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  const parts = dmy ? { d: dmy[1]!, m: dmy[2]!, y: dmy[3]! } : mdy ? { d: mdy[2]!, m: mdy[1]!, y: mdy[3]! } : null;
  const month = parts ? MONTHS[parts.m.slice(0, 3).toLowerCase()] : undefined;
  if (!parts || !month) return null;
  return `${parts.y}-${String(month).padStart(2, "0")}-${parts.d.padStart(2, "0")}`;
}

const Topic = z.enum(["reversal_window", "other"]);
const Unit = z.enum(["business_days", "calendar_days", "hours"]);
const WireValue = z
  .object({ amount: z.number().nonnegative(), amountMax: z.number().nonnegative().nullable(), unit: Unit })
  .nullable();

export const SourceExtractionWire = z.object({
  claims: z
    .array(
      z.object({
        topic: Topic,
        value: WireValue,
        valueText: z.string().max(200),
        rail: z.enum(["instant", "standard", "any"]),
        effectiveFrom: z.string().max(40).nullable().transform(toIsoDate),
        statusWording: z.enum(["in_force", "proposed", "pending_approval", "deprecated", "unstated"]),
        // An empty supersedes quote is kept here and dropped later by quote validation (listed as rejected).
        supersedes: z
          .object({ targetText: z.string().max(300), quote: z.string().max(600) })
          .nullable()
          .transform((v) => (v && v.targetText.trim() ? v : null)),
        quote: z.string().min(1).max(600),
      }),
    )
    .max(12),
});

export const DraftExtractionWire = z.object({
  claims: z
    .array(
      z.object({
        topic: Topic,
        value: WireValue,
        valueText: z.string().max(200),
        span: z.string().min(1).max(600),
        definitive: z.boolean(),
      }),
    )
    .max(12),
});

export const SafeReplyWire = z.object({ reply: z.string().min(1).max(1000) });

export type SourceExtractionWireT = z.infer<typeof SourceExtractionWire>;
export type DraftExtractionWireT = z.infer<typeof DraftExtractionWire>;

const toValue = (v: z.infer<typeof WireValue>) =>
  v === null ? null : v.amountMax === null || v.amountMax === v.amount ? { amount: v.amount, unit: v.unit } : { amount: v.amount, amountMax: v.amountMax, unit: v.unit };

export function toSourceClaims(wire: SourceExtractionWireT, source: SourceForExtraction): SourceClaim[] {
  return wire.claims.map((c, i) => ({
    claimId: `${source.id}#${i + 1}`,
    sourceId: source.id,
    sourceVersion: source.version,
    topic: c.topic,
    value: toValue(c.value),
    valueText: c.valueText,
    scope: { rail: c.rail },
    effectiveFrom: c.effectiveFrom,
    statusWording: c.statusWording,
    supersedes: c.supersedes,
    quote: c.quote,
  }));
}

export function toDraftClaims(wire: DraftExtractionWireT): DraftClaim[] {
  return wire.claims.map((c, i) => ({
    claimId: `draft#${i + 1}`,
    topic: c.topic,
    value: toValue(c.value),
    valueText: c.valueText,
    span: c.span,
    definitive: c.definitive,
  }));
}

// ---- JSON schemas sent to the provider (strict-mode compatible) --------------------------------

type Json = Record<string, unknown>;
const str = (description?: string): Json => ({ type: "string", ...(description ? { description } : {}) });
const nullable = (schema: Json): Json => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties: Record<string, Json>): Json => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const valueSchema = nullable(
  obj({
    amount: { type: "number", description: "Lower (or only) amount, e.g. 4 for '4 business days', 5 for '5-7 days'." },
    amountMax: nullable({ type: "number", description: "Upper amount for a range like '5-7 days' (7); otherwise null." }),
    unit: { type: "string", enum: ["business_days", "calendar_days", "hours"] },
  }),
);

export const SOURCE_JSON_SCHEMA: Json = obj({
  claims: {
    type: "array",
    items: obj({
      topic: { type: "string", enum: ["reversal_window", "other"] },
      value: valueSchema,
      valueText: str("The value as written, e.g. '4 business days'."),
      rail: { type: "string", enum: ["instant", "standard", "any"] },
      effectiveFrom: nullable(str("ISO date YYYY-MM-DD, only from an explicit 'Effective …' statement.")),
      statusWording: { type: "string", enum: ["in_force", "proposed", "pending_approval", "deprecated", "unstated"] },
      supersedes: nullable(
        obj({
          targetText: str("What the text says it replaces, copied from the text."),
          quote: str("The exact sentence saying it supersedes/replaces something, copied character for character."),
        }),
      ),
      quote: str("The exact sentence stating the claim, copied character for character from the document."),
    }),
  },
});

export const DRAFT_JSON_SCHEMA: Json = obj({
  claims: {
    type: "array",
    items: obj({
      topic: { type: "string", enum: ["reversal_window", "other"] },
      value: valueSchema,
      valueText: str("The value as written in the reply."),
      span: str("The exact words from the reply that make the claim, copied character for character."),
      definitive: { type: "boolean", description: "false if hedged ('usually', 'around', 'we're checking')." },
    }),
  },
});

export const REPLY_JSON_SCHEMA: Json = obj({ reply: str("The rewritten customer reply.") });

// ---- doc_fix (D-037) ---------------------------------------------------------------------------

export const DocFixWire = z.object({
  action: z.enum(["add_after", "replace"]),
  target: z.string().min(1).max(1000),
  text: z.string().min(1).max(600),
});

export const DOC_FIX_JSON_SCHEMA: Json = obj({
  action: { type: "string", enum: ["add_after", "replace"], description: "Prefer add_after: add a sentence right after the target." },
  target: str("The sentence that states the general value, copied character for character from the document."),
  text: str("The sentence(s) to add after the target (or its replacement): plain text, one short paragraph."),
});
