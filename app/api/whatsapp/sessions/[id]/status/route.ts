import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/platform/workspace";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  getSessionById
} from "@/lib/whatsapp/supabase-session-manager";
import {
  callWhatsAppWorker,
  WhatsAppWorkerUnavailableError
} from "@/lib/whatsapp/worker-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { id } = await params;
    const session = await getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { entitlement } = await getWorkspaceContext(user.id);
    if (!entitlement.hasActiveAccess) {
      return NextResponse.json({
        id: session.id,
        name: session.name,
        status: session.status,
        countryCode: session.countryCode,
        phone: session.phone,
        connectedPhone: session.connectedPhone,
        connectedName: session.connectedName,
        device: session.device,
        webhookUrl: session.webhookUrl,
        apiKeyPrefix: session.apiKeyPrefix,
        error: entitlement.statusMessage,
        createdAt: session.createdAt,
        accessMode: entitlement.mode,
        accessActive: entitlement.hasActiveAccess
      });
    }

    try {
      const runtimeSession = await callWhatsAppWorker<any>(`/sessions/${id}/status`, {
        method: "GET",
        timeoutMs: 8000
      });

      return NextResponse.json({
        id: session.id,
        name: session.name,
        status: runtimeSession.status,
        countryCode: session.countryCode,
        phone: session.phone,
        connectedPhone: runtimeSession.connectedPhone ?? session.connectedPhone,
        connectedName: runtimeSession.connectedName ?? session.connectedName,
        device: runtimeSession.device ?? session.device,
        webhookUrl: session.webhookUrl,
        apiKeyPrefix: session.apiKeyPrefix,
        error: runtimeSession.error,
        createdAt: session.createdAt,
        accessMode: entitlement.mode,
        accessActive: entitlement.hasActiveAccess
      });
    } catch (error) {
      if (error instanceof WhatsAppWorkerUnavailableError) {
        return NextResponse.json({
          id: session.id,
          name: session.name,
          status: session.status === "connected" ? session.status : "error",
          countryCode: session.countryCode,
          phone: session.phone,
          connectedPhone: session.connectedPhone,
          connectedName: session.connectedName,
          device: session.device,
          webhookUrl: session.webhookUrl,
          apiKeyPrefix: session.apiKeyPrefix,
          error: error.message,
          createdAt: session.createdAt,
          accessMode: entitlement.mode,
          accessActive: entitlement.hasActiveAccess
        });
      }

      throw error;
    }
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch status";
    console.error("[API] Error fetching status:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
