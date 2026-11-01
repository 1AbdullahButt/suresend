// Comparator registry (D-041): how values are compared, keyed by value kind. The decision rules (S, A, D0–D11) never
// compare amounts or units themselves; they call the helpers below, which pick the comparator for the value's kind.
// Adding a value kind = its type in KindMap and its comparator in COMPARATORS. Pure: no I/O.
import type { Unit } from "./types";

export type DurationValue = { amount: number; amountMax?: number; unit: Unit };
/**
 * The duration fields, absent. Every other kind declares them, so code written against the SPEC's duration-only Value
 * (the acceptance tests read `governing.value.amount`) still compiles and reads undefined. Narrow with isDuration.
 */
type NoDuration = { amount?: undefined; amountMax?: undefined; unit?: undefined };
/** Any other amount: a fee amount, a limit ("PKR 500,000", "3 transfers a day"). Claims on topic "other" carry it. */
export type QuantityValue = { quantity: number; of: string } & NoDuration;

/** Every value kind a claim can carry, and the shape of its value. */
interface KindMap {
  duration: DurationValue;
  quantity: QuantityValue;
}
export type ValueKind = keyof KindMap;
export type AnyValue = KindMap[ValueKind];

export interface Comparator<V extends AnyValue> {
  kind: ValueKind;
  /** True when `v` has this kind's shape. */
  is(v: AnyValue): v is V;
  /** The same value (D1 and D4 "agree", D5 targets, one entry per source and value). */
  same(a: V, b: V): boolean;
  /** `inner` lies within `outer` (D9/D10, D11b, the evidence relation). Ignores units; `unitsMatch` checks those (D8). */
  within(inner: V, outer: V): boolean;
  /** The units agree (D8). A kind without units always agrees. */
  unitsMatch(a: V, b: V): boolean;
  /** The unit for the trace ("business days"), or null for a kind without units. */
  unitLabel(v: V): string | null;
  /** Engine wording: "4 business days", "5–7 calendar days". */
  format(v: V): string;
  /** Reply wording for the UI and MCP: "4 business days", "5–7 days". */
  words(v: V): string;
}

// ---- duration (reversal_window): the comparison the engine has always used, moved here unchanged ----------------

function range(v: DurationValue): [number, number] {
  const lo = v.amount;
  const hi = v.amountMax ?? v.amount;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

const UNIT_WORDS: Record<Unit, [string, string]> = {
  business_days: ["business day", "business days"],
  calendar_days: ["calendar day", "calendar days"],
  hours: ["hour", "hours"],
};

const REPLY_UNIT_WORDS: Record<Unit, [string, string]> = {
  business_days: ["business day", "business days"],
  calendar_days: ["day", "days"],
  hours: ["hour", "hours"],
};

export const isDuration = (v: AnyValue): v is DurationValue => typeof v.amount === "number" && typeof v.unit === "string";

const duration: Comparator<DurationValue> = {
  kind: "duration",
  is: isDuration,
  same(a, b) {
    const [alo, ahi] = range(a);
    const [blo, bhi] = range(b);
    return a.unit === b.unit && alo === blo && ahi === bhi;
  },
  within(inner, outer) {
    const [ilo, ihi] = range(inner);
    const [olo, ohi] = range(outer);
    return ilo >= olo && ihi <= ohi;
  },
  unitsMatch: (a, b) => a.unit === b.unit,
  unitLabel: (v) => v.unit.replace("_", " "),
  format(v) {
    const [lo, hi] = range(v);
    const [one, many] = UNIT_WORDS[v.unit];
    if (lo !== hi) return `${lo}–${hi} ${many}`;
    return `${lo} ${lo === 1 ? one : many}`;
  },
  words(v) {
    const [one, many] = REPLY_UNIT_WORDS[v.unit];
    if (v.amountMax !== undefined && v.amountMax !== v.amount) return `${v.amount}–${v.amountMax} ${many}`;
    return `${v.amount} ${v.amount === 1 ? one : many}`;
  },
};

// ---- quantity (amounts outside the covered topics) -------------------------------------------------------------

const unitKey = (of: string) => of.trim().toLowerCase().replace(/\s+/g, " ");

const quantity: Comparator<QuantityValue> = {
  kind: "quantity",
  is: (v): v is QuantityValue => "quantity" in v && "of" in v,
  same: (a, b) => a.quantity === b.quantity && unitKey(a.of) === unitKey(b.of),
  within: (inner, outer) => inner.quantity === outer.quantity,
  unitsMatch: (a, b) => unitKey(a.of) === unitKey(b.of),
  unitLabel: (v) => v.of,
  format: (v) => `${v.quantity.toLocaleString("en-US")} ${v.of}`,
  words: (v) => `${v.quantity.toLocaleString("en-US")} ${v.of}`,
};

// ---- the registry ----------------------------------------------------------------------------------------------

const COMPARATORS: { [K in ValueKind]: Comparator<KindMap[K]> } = { duration, quantity };

export function comparatorFor(v: AnyValue): Comparator<AnyValue> {
  const c = (Object.values(COMPARATORS) as Array<Comparator<AnyValue>>).find((x) => x.is(v));
  if (!c) throw new Error(`No comparator for value ${JSON.stringify(v)}`);
  return c;
}

export function kindOf(v: AnyValue): ValueKind {
  return comparatorFor(v).kind;
}

export const valueKinds = (): ValueKind[] => Object.keys(COMPARATORS) as ValueKind[];

/** Same kind and the same value. */
export function sameValue(a: AnyValue, b: AnyValue): boolean {
  const c = comparatorFor(a);
  return c.is(b) && c.same(a, b);
}

/** Same kind and `inner` within `outer` (units aside: see unitsMatch). */
export function valueWithin(inner: AnyValue, outer: AnyValue): boolean {
  const c = comparatorFor(outer);
  return c.is(inner) && c.within(inner, outer);
}

/** Same kind and the units agree. Values of different kinds never match. */
export function unitsMatch(a: AnyValue, b: AnyValue): boolean {
  const c = comparatorFor(a);
  return c.is(b) && c.unitsMatch(a, b);
}

export const unitLabel = (v: AnyValue): string | null => comparatorFor(v).unitLabel(v);
export const formatValue = (v: AnyValue): string => comparatorFor(v).format(v);
export const valueWords = (v: AnyValue): string => comparatorFor(v).words(v);
