import { NextRequest, NextResponse } from "next/server";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  deleteSession,
  getSessionById
} from "@/lib/whatsapp/supabase-session-manager";
import {
  callWhatsAppWorker,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

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

    try {
      await callWhatsAppWorker(`/sessions/${id}`, {
        method: "DELETE"
      });
    } catch (error) {
      if (error instanceof WhatsAppWorkerUnavailableError) {
        await deleteSession(id);
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      message: "Session permanently deleted",
      sessionId: id,
      scrubbed: true
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to delete session";
    console.error("[API] Error deleting session:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
