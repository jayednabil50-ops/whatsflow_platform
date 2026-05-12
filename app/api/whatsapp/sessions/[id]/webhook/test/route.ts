import { NextResponse } from "next/server";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import { getSessionById } from "@/lib/whatsapp/supabase-session-manager";
import { queueWebhookDelivery } from "@/lib/whatsapp/webhook-manager";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!session.webhookUrl) {
      return NextResponse.json(
        { error: "Webhook URL is not configured for this session" },
        { status: 400 }
      );
    }

    const deliveryId = await queueWebhookDelivery(
      id,
      session.webhookUrl,
      {
        event: "message.received",
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          direction: "inbound",
          message: {
            id: `test_${Date.now()}`,
            from: "8801711111111",
            to: session.connectedPhone || session.phone,
            type: "text",
            text: "WS Center webhook test",
            raw: {}
          }
        }
      },
      1,
      {
        secret: session.webhookSecret,
        userId: session.userId
      }
    );

    return NextResponse.json({
      message: "Webhook test queued",
      deliveryId
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to test webhook";
    console.error("[API] Error testing webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
