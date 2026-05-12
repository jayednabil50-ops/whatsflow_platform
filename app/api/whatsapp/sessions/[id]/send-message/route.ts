import { NextRequest, NextResponse } from "next/server";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/platform/workspace";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  getSessionById
} from "@/lib/whatsapp/supabase-session-manager";
import {
  callWhatsAppWorker,
  isWhatsAppWorkerHttpError,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await requireActiveWorkspace(user.id);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await req.json();
    const { to, jid, remoteJid, message, text } = body;
    const target = [remoteJid, jid, to].find(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    if (!target) {
      return NextResponse.json(
        { error: "Provide `remoteJid`, `jid`, or `to` in the request body." },
        { status: 400 }
      );
    }

    const hasStructuredPayload =
      body.poll ||
      body.location ||
      body.contact ||
      body.mediaUrl ||
      body.url ||
      body.mediaType ||
      body.type === "contact" ||
      body.type === "location" ||
      body.type === "poll";

    const textValue = typeof message === "string" ? message : text;
    const hasText = typeof textValue === "string" && textValue.trim().length > 0;

    if (!hasStructuredPayload && !hasText) {
      return NextResponse.json(
        { error: "Provide message text or a supported structured payload (mediaUrl, poll, location, contact)." },
        { status: 400 }
      );
    }

    const result = await callWhatsAppWorker<{
      success: boolean;
      messageId?: string;
      to: string;
      scheduledDelayMs: number;
      messageType?: string;
    }>(`/sessions/${id}/send-message`, {
      method: "POST",
      body: JSON.stringify({
        ...body,
        userId: session.userId,
        remoteJid: target,
        ...(hasText ? { text: textValue.trim() } : {})
      })
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      to: result.to,
      scheduledDelayMs: result.scheduledDelayMs,
      messageType: result.messageType || "text"
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof WhatsAppWorkerUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (isWhatsAppWorkerHttpError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to send message";
    console.error("[API] Error sending message:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
