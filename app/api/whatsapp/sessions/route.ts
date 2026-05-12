import { NextRequest, NextResponse } from "next/server";
import { requireSessionCapacity, WorkspaceAccessError } from "@/lib/platform/workspace";
import { createSession, listSessions } from "@/lib/whatsapp/supabase-session-manager";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const existingSessions = await listSessions(user.id);
    await requireSessionCapacity(user.id, existingSessions.length);
    const body = await req.json();
    const { name, countryCode, phone, webhookUrl } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    }
    if (!countryCode || typeof countryCode !== "string") {
      return NextResponse.json({ error: "Country code is required" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
      return NextResponse.json({ error: "Valid phone number is required" }, { status: 400 });
    }

    const session = await createSession({
      userId: user.id,
      name: name.trim(),
      countryCode: countryCode.trim(),
      phone: phone.trim(),
      webhookUrl: webhookUrl?.trim() || undefined
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to create session";
    console.error("[API] Error creating session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const sessions = await listSessions(user.id);
    return NextResponse.json(sessions);
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch sessions";
    console.error("[API] Error fetching sessions:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
