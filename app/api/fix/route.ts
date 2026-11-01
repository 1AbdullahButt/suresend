import { NextResponse, type NextRequest } from "next/server";
import { routeFixDeps } from "@/lib/check/deps";
import { handleFix } from "@/lib/check/handlers";
import { limiterStatus } from "@/lib/rateLimit";

export const runtime = "nodejs";
// A proposal reruns the check, drafts the fix and rechecks the canonical replies; on a cold start that takes a few seconds.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const json: unknown = await req.json().catch(() => null);
  const deps = routeFixDeps(req.headers);
  const { status, body } = await handleFix(json, deps, deps);
  return NextResponse.json(body, { status, headers: { "x-suresend-limiter": limiterStatus() } });
}
