import { NextResponse, type NextRequest } from "next/server";
import { routeDeps } from "@/lib/check/deps";
import { handleCheck } from "@/lib/check/handlers";
import { limiterStatus } from "@/lib/rateLimit";

export const runtime = "nodejs";
// Live extraction of several sources plus a safe reply can take a few seconds on a cold start.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const json: unknown = await req.json().catch(() => null);
  const { status, body } = await handleCheck(json, routeDeps(req.headers));
  return NextResponse.json(body, { status, headers: { "x-suresend-limiter": limiterStatus() } });
}
