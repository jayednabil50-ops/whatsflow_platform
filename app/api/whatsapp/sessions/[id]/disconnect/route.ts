import { NextRequest, NextResponse } from "next/server";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  disconnectSession,
  getSessionById
} from "@/lib/whatsapp/supabase-session-manager";
import {
  callWhatsAppWorker,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    try {
      await callWhatsAppWorker(`/sessions/${id}/disconnect`, {
        method: "POST"
      });
    } catch (error) {
      if (error instanceof WhatsAppWorkerUnavailableError) {
        await disconnectSession(id);
      } else {
        throw error;
      }
    }

    return NextResponse.json({ message: "Session disconnected", sessionId: id });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to disconnect";
    console.error("[API] Error disconnecting session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
