import { NextRequest, NextResponse } from "next/server";
import {
  AdminAccessAction,
  AdminAccessOptions,
  AdminGrantPlan,
  applyAdminAccessAction
} from "@/lib/platform/admin";
import { requireOwnerWorkspace, WorkspaceAccessError } from "@/lib/platform/workspace";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";

export const runtime = "nodejs";

const validActions = new Set<AdminAccessAction>([
  "extendTrial",
  "grantSubscription",
  "expireAccess",
  "deleteUser"
]);

const validPlans = new Set<AdminGrantPlan>(["starter", "pro", "annual", "unlimited"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    await requireOwnerWorkspace(user.id);
    const { id } = await params;
    const body = await req.json();
    const action = body?.action as AdminAccessAction;

    if (!validActions.has(action)) {
      return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
    }

    const options: AdminAccessOptions = {};
    if (typeof body?.trialDays === "number" && body.trialDays > 0) {
      options.trialDays = Math.min(365, Math.floor(body.trialDays));
    }
    if (typeof body?.durationDays === "number" && body.durationDays > 0) {
      options.durationDays = Math.min(3650, Math.floor(body.durationDays));
    }
    if (typeof body?.plan === "string" && validPlans.has(body.plan as AdminGrantPlan)) {
      options.plan = body.plan as AdminGrantPlan;
    }

    await applyAdminAccessAction(id, action, options);

    return NextResponse.json({
      success: true,
      action,
      ...(options.plan ? { plan: options.plan } : {}),
      ...(options.durationDays ? { durationDays: options.durationDays } : {}),
      ...(options.trialDays ? { trialDays: options.trialDays } : {})
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Failed to update workspace access.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
