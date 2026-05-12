import { NextRequest, NextResponse } from "next/server";
import {
  WorkspaceAccessError,
  getWorkspaceContext,
  requireActiveWorkspace
} from "@/lib/platform/workspace";
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

    // forceNewQr=true clears any stale signal keys before connecting
    await callWhatsAppWorker(`/sessions/${id}/start?forceNewQr=1`, {
      method: "POST"
    });

    return NextResponse.json({ message: "Connection started", sessionId: id });
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

    const message = error instanceof Error ? error.message : "Failed to start connection";
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

    const { entitlement } = await getWorkspaceContext(user.id);
    if (!entitlement.hasActiveAccess) {
      return NextResponse.json({
        id: session.id,
        status: session.status,
        qrCode: null,
        connectedPhone: session.connectedPhone,
        connectedName: session.connectedName,
        device: session.device,
        error: entitlement.statusMessage
      });
    }

    try {
      const workerSession = await callWhatsAppWorker<{
        id: string;
        status: string;
        qrCode: string | null;
        connectedPhone: string | null;
        connectedName: string | null;
        device: string | null;
        error: string | null;
      }>(`/sessions/${id}/qr`, { method: "GET", timeoutMs: 8000 });

      return NextResponse.json(workerSession);
    } catch (error) {
      if (error instanceof WhatsAppWorkerUnavailableError) {
        return NextResponse.json({
          id: session.id,
          status: session.status === "connected" ? session.status : "error",
          qrCode: session.qrCode || null,
          connectedPhone: session.connectedPhone,
          connectedName: session.connectedName,
          device: session.device,
          error: error.message
        });
      }

      throw error;
    }
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
