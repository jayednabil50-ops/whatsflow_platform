import { NextRequest, NextResponse } from "next/server";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  getSessionById,
  setSessionWebhook
} from "@/lib/whatsapp/supabase-session-manager";
import {
  callWhatsAppWorker,
  isWhatsAppWorkerHttpError,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

async function syncWorkerWebhookConfig(
  sessionId: string,
  webhookUrl?: string | null
): Promise<void> {
  try {
    await callWhatsAppWorker(`/sessions/${sessionId}/webhook`, {
      method: "POST",
      body: JSON.stringify({
        webhookUrl: webhookUrl || ""
      })
    });
  } catch (error) {
    if (error instanceof WhatsAppWorkerUnavailableError) {
      return;
    }

    if (isWhatsAppWorkerHttpError(error) && error.status === 404) {
      return;
    }

    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await req.json();
    const { webhookUrl } = body;

    if (typeof webhookUrl !== "string") {
      return NextResponse.json({ error: "Webhook URL must be a string" }, { status: 400 });
    }

    const normalizedWebhookUrl = webhookUrl.trim();

    if (normalizedWebhookUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(normalizedWebhookUrl);
      } catch {
        return NextResponse.json({ error: "Invalid webhook URL format" }, { status: 400 });
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return NextResponse.json(
          { error: "Webhook URL must start with http:// or https://" },
          { status: 400 }
        );
      }
    }

    const updated = await setSessionWebhook(id, normalizedWebhookUrl || null);

    if (!updated) {
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    await syncWorkerWebhookConfig(id, normalizedWebhookUrl || null);

    return NextResponse.json(
      {
        ...updated,
        webhookUrl: updated.webhookUrl || null,
        message: normalizedWebhookUrl ? "Webhook saved" : "Webhook removed"
      },
      { status: 200 }
    );
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to save webhook";
    console.error("[API] Error saving webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      webhookUrl: session.webhookUrl,
      status: session.status
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch webhook";
    console.error("[API] Error fetching webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updated = await setSessionWebhook(id, null);

    if (!updated) {
      return NextResponse.json({ error: "Failed to remove webhook" }, { status: 500 });
    }

    await syncWorkerWebhookConfig(id, null);

    return NextResponse.json({ message: "Webhook removed", webhookUrl: null });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to remove webhook";
    console.error("[API] Error removing webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
