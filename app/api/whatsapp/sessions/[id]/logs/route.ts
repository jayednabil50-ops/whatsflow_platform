import { NextRequest, NextResponse } from "next/server";
import { isAuthenticationError, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionById } from "@/lib/whatsapp/supabase-session-manager";

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

    const url = new URL(req.url);
    const direction = url.searchParams.get("direction") || "";
    const messageType = url.searchParams.get("type") || "";
    const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10));

    let query = getSupabaseAdminClient()
      .from("messages")
      .select("id, direction, remote_jid, message_type, body, status, error_message, external_message_id, created_at, media_mime, media_url")
      .eq("session_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (direction === "inbound" || direction === "outbound") {
      query = query.eq("direction", direction);
    }
    if (messageType) {
      query = query.eq("message_type", messageType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      sessionId: id,
      sessionName: session.name,
      total: data?.length ?? 0,
      logs: (data ?? []).map((row) => ({
        id: row.id,
        direction: row.direction,
        remoteJid: row.remote_jid,
        messageType: row.message_type,
        body: row.body,
        status: row.status,
        errorMessage: row.error_message,
        externalMessageId: row.external_message_id,
        mediaMime: row.media_mime,
        mediaUrl: row.media_url,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const msg = error instanceof Error ? error.message : "Failed to fetch logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
