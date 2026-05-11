import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/platform/workspace";
import {
  PublicApiRequestError,
  requirePublicApiSession,
  resolvePublicApiTargetJid
} from "@/lib/whatsapp/public-api";
import {
  callWhatsAppWorker,
  isWhatsAppWorkerHttpError,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await requirePublicApiSession(req);
    const body = await req.json();
    const { to, jid, remoteJid, text, message } = body;
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

    if (
      !hasStructuredPayload &&
      (!(
        typeof text === "string" && text.trim()
      ) && !(typeof message === "string" && message.trim()))
    ) {
      return NextResponse.json(
        { error: "Message text or a supported structured payload is required." },
        { status: 400 }
      );
    }

    const resolvedJid = await resolvePublicApiTargetJid(session.id, target);

    const result = await callWhatsAppWorker<{
      success: boolean;
      sessionId: string;
      messageId?: string;
      to: string;
      scheduledDelayMs: number;
      messageType?: string;
    }>(`/sessions/${session.id}/send-message`, {
      method: "POST",
      body: JSON.stringify({
        ...body,
        userId: session.userId,
        remoteJid: resolvedJid
      })
    });

    return NextResponse.json(
      {
        success: true,
        sessionId: session.id,
        messageId: result.messageId,
        to: result.to,
        scheduledDelayMs: result.scheduledDelayMs,
        messageType: result.messageType || "text"
      },
      {
        headers: {
          "X-WhatsFlow-Queue-Delay": result.scheduledDelayMs.toString()
        }
      }
    );
  } catch (error) {
    if (error instanceof PublicApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
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

    const message = error instanceof Error ? error.message : "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
