import { NextRequest, NextResponse } from "next/server";
import { deleteSessionAsAdmin } from "@/lib/platform/admin";
import { requireOwnerWorkspace, WorkspaceAccessError } from "@/lib/platform/workspace";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    await requireOwnerWorkspace(user.id);
    const { id } = await params;

    const deleted = await deleteSessionAsAdmin(id);
    if (!deleted) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      sessionId: id
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to delete session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
