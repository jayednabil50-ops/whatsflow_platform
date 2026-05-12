import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import { getSessionById } from "@/lib/whatsapp/supabase-session-manager";
import { queueWebhookDelivery } from "@/lib/whatsapp/webhook-manager";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/sessions/[id]/webhook-deliveries
 * Fetch webhook delivery history for a session
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get query parameters for pagination
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");

    // Build query
    let query = getSupabaseAdminClient()
      .from("webhook_deliveries")
      .select("*", { count: "exact" })
      .eq("session_id", id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      deliveries: data || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch webhook deliveries";
    console.error("[API] Error fetching webhook deliveries:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/sessions/[id]/webhook-deliveries/retry
 * Retry a failed webhook delivery
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await req.json();
    const { deliveryId } = body;

    if (!deliveryId) {
      return NextResponse.json({ error: "Delivery ID is required" }, { status: 400 });
    }

    let payload: unknown;

    const { data: delivery, error: fetchError } = await getSupabaseAdminClient()
      .from("webhook_deliveries")
      .select("*")
      .eq("id", deliveryId)
      .eq("session_id", id)
      .single();

    if (fetchError || !delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    payload = delivery.payload;

    if (!session.webhookUrl) {
      return NextResponse.json(
        { error: "Webhook URL is not configured for this session" },
        { status: 400 }
      );
    }

    await queueWebhookDelivery(id, session.webhookUrl, payload as any, 3, {
      secret: session.webhookSecret,
      userId: session.userId
    });

    return NextResponse.json({
      message: "Webhook delivery queued for replay",
      deliveryId
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to retry webhook delivery";
    console.error("[API] Error retrying webhook delivery:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
