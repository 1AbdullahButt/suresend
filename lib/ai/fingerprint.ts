// What the AI is told, as one hash: the system prompts and the JSON schemas. The eval's resume stamp and the held-out freeze
// test compare it, so an edit with no version bump still counts as a change (D-041).
import { createHash } from "node:crypto";
import { DRAFT_SYSTEM, FIX_SYSTEM, REPLY_SYSTEM, SOURCE_SYSTEM } from "./prompts";
import { DOC_FIX_JSON_SCHEMA, DRAFT_JSON_SCHEMA, REPLY_JSON_SCHEMA, SOURCE_JSON_SCHEMA } from "./schemas";

export function promptFingerprint(): string {
  const parts = [DRAFT_SYSTEM, SOURCE_SYSTEM, REPLY_SYSTEM, FIX_SYSTEM, DRAFT_JSON_SCHEMA, SOURCE_JSON_SCHEMA, REPLY_JSON_SCHEMA, DOC_FIX_JSON_SCHEMA];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
