import { NextRequest, NextResponse } from "next/server";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  removeSessionApiKey,
  rotateSessionApiKey
} from "@/lib/whatsapp/api-keys";
import { getSessionById, updateSession } from "@/lib/whatsapp/supabase-session-manager";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      hasApiKey: Boolean((session as { apiKeyPrefix?: string | null }).apiKeyPrefix),
      prefix: (session as { apiKeyPrefix?: string | null }).apiKeyPrefix || null
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch API key state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const rotated = await rotateSessionApiKey(id, user.id);
    updateSession(id, { apiKeyPrefix: rotated.prefix });

    return NextResponse.json({
      message: "API key generated",
      token: rotated.token,
      prefix: rotated.prefix
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to generate API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await removeSessionApiKey(id, user.id);
    updateSession(id, { apiKeyPrefix: undefined });

    return NextResponse.json({
      message: "API key revoked"
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to revoke API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
