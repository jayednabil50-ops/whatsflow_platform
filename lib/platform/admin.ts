import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getWorkspaceEntitlement,
  type WorkspaceProfile,
  type WorkspaceSubscription
} from "./workspace";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "paused"
]);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "expired",
  "inactive",
  "ended",
  "unpaid"
]);

type AdminAuthUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

type AdminSessionRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  phone_number?: string | null;
  connected_phone?: string | null;
  connected_name?: string | null;
  webhook_url?: string | null;
  created_at: string;
};

type AdminUsageRow = {
  user_id: string;
  messages_sent: number;
  messages_received: number;
  webhook_deliveries: number;
};

type AdminMessageRow = {
  user_id: string;
  session_id: string;
  direction: string;
  body: string | null;
  created_at: string;
};

type AdminProfileRow = WorkspaceProfile;
type AdminSubscriptionRow = WorkspaceSubscription;
type AdminSessionIdRow = {
  id: string;
};

export type AdminOverview = {
  totals: {
    totalUsers: number;
    activeWorkspaces: number;
    trialingUsers: number;
    subscribedUsers: number;
    expiredUsers: number;
    totalSessions: number;
    connectedSessions: number;
    loginsLast24h: number;
  };
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    accessMode: string;
    planLabel: string;
    sessionCount: number;
    connectedCount: number;
    messagesSent: number;
    messagesReceived: number;
    webhookDeliveries: number;
    createdAt: string;
    lastSignInAt: string | null;
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
  }>;
  sessions: Array<{
    id: string;
    name: string;
    ownerEmail: string;
    ownerName: string;
    status: string;
    number: string;
    connectedAs: string;
    webhookUrl: string;
    createdAt: string;
  }>;
  recentLogins: Array<{
    id: string;
    email: string;
    fullName: string;
    lastSignInAt: string;
  }>;
  recentActivity: Array<{
    sessionId: string;
    ownerEmail: string;
    direction: string;
    body: string;
    createdAt: string;
  }>;
};

export type AdminAccessAction =
  | "extendTrial"
  | "grantSubscription"
  | "expireAccess"
  | "deleteUser";

export type AdminGrantPlan = "starter" | "pro" | "annual" | "unlimited";

export type AdminAccessOptions = {
  /** Days to add for extendTrial (default 2). */
  trialDays?: number;
  /** Plan key to grant for grantSubscription. */
  plan?: AdminGrantPlan;
  /** Days for the subscription period (default depends on plan). */
  durationDays?: number;
};

const PLAN_DEFAULT_DURATION_DAYS: Record<AdminGrantPlan, number> = {
  starter: 30,
  pro: 60,
  annual: 365,
  unlimited: 30
};

function parseTimestamp(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function chooseBestSubscription(
  subscriptions: AdminSubscriptionRow[]
): AdminSubscriptionRow | null {
  if (subscriptions.length === 0) {
    return null;
  }

  return [...subscriptions].sort((left, right) => {
    const leftActive = isActiveSubscription(left) ? 1 : 0;
    const rightActive = isActiveSubscription(right) ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftPeriodEnd = parseTimestamp(left.current_period_end);
    const rightPeriodEnd = parseTimestamp(right.current_period_end);
    if (leftPeriodEnd !== rightPeriodEnd) {
      return rightPeriodEnd - leftPeriodEnd;
    }

    return parseTimestamp(right.created_at) - parseTimestamp(left.created_at);
  })[0];
}

function isActiveSubscription(subscription?: AdminSubscriptionRow | null): boolean {
  if (!subscription) {
    return false;
  }

  const status = (subscription.status || "").trim().toLowerCase();
  const periodEndMs = parseTimestamp(subscription.current_period_end);

  if (periodEndMs) {
    return periodEndMs > Date.now() && !TERMINAL_SUBSCRIPTION_STATUSES.has(status);
  }

  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

async function revokeUserSessionAccess(userId: string, reason: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_sessions")
    .select("id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const sessionIds = ((data || []) as AdminSessionIdRow[])
    .map((session) => session.id)
    .filter(Boolean);

  if (sessionIds.length === 0) {
    return;
  }

  const [
    { callWhatsAppWorker, isWhatsAppWorkerHttpError, WhatsAppWorkerUnavailableError },
    { revokeSessionAccess }
  ] = await Promise.all([
    import("@/lib/whatsapp/worker-client"),
    import("@/lib/whatsapp/supabase-session-manager")
  ]);

  await Promise.all(
    sessionIds.map(async (sessionId) => {
      try {
        await callWhatsAppWorker(`/sessions/${sessionId}/revoke`, {
          method: "POST",
          body: JSON.stringify({
            clearAuthState: true,
            reason
          })
        });
      } catch (error) {
        if (
          error instanceof WhatsAppWorkerUnavailableError ||
          (isWhatsAppWorkerHttpError(error) && error.status === 404)
        ) {
          await revokeSessionAccess(sessionId, {
            clearAuthState: true,
            reason
          });
          return;
        }

        throw error;
      }
    })
  );
}

async function listAllAuthUsers(): Promise<AdminAuthUser[]> {
  const users: AdminAuthUser[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw error;
    }

    const batch = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      full_name:
        (typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        null,
      last_sign_in_at: user.last_sign_in_at,
      created_at: user.created_at
    }));

    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = getSupabaseAdminClient();
  const [
    authUsers,
    profilesResult,
    subscriptionsResult,
    sessionsResult,
    usageResult,
    messagesResult
  ] = await Promise.all([
    listAllAuthUsers(),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("id, user_id, plan, status, current_period_end, created_at"),
    supabase
      .from("whatsapp_sessions")
      .select("id, user_id, name, status, phone_number, connected_phone, connected_name, webhook_url, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("usage_daily").select("user_id, messages_sent, messages_received, webhook_deliveries"),
    supabase
      .from("messages")
      .select("user_id, session_id, direction, body, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (usageResult.error) throw usageResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const profiles = (profilesResult.data || []) as AdminProfileRow[];
  const subscriptions = (subscriptionsResult.data || []) as AdminSubscriptionRow[];
  const sessions = (sessionsResult.data || []) as AdminSessionRow[];
  const usageRows = (usageResult.data || []) as AdminUsageRow[];
  const recentMessages = (messagesResult.data || []) as AdminMessageRow[];

  const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const subscriptionsByUser = new Map<string, AdminSubscriptionRow[]>();
  const sessionsByUser = new Map<string, AdminSessionRow[]>();
  const usageByUser = new Map<
    string,
    { sent: number; received: number; webhooks: number }
  >();

  for (const subscription of subscriptions) {
    const rows = subscriptionsByUser.get(subscription.user_id) || [];
    rows.push(subscription);
    subscriptionsByUser.set(subscription.user_id, rows);
  }

  for (const session of sessions) {
    const rows = sessionsByUser.get(session.user_id) || [];
    rows.push(session);
    sessionsByUser.set(session.user_id, rows);
  }

  for (const row of usageRows) {
    const current = usageByUser.get(row.user_id) || { sent: 0, received: 0, webhooks: 0 };
    current.sent += row.messages_sent || 0;
    current.received += row.messages_received || 0;
    current.webhooks += row.webhook_deliveries || 0;
    usageByUser.set(row.user_id, current);
  }

  const allUserIds = new Set<string>([
    ...authUsers.map((user) => user.id),
    ...profiles.map((profile) => profile.id),
    ...sessions.map((session) => session.user_id),
    ...usageRows.map((row) => row.user_id),
    ...subscriptions.map((subscription) => subscription.user_id)
  ]);

  const users = Array.from(allUserIds).map((userId) => {
    const authUser = authUsersById.get(userId);
    const profile =
      profileById.get(userId) ||
      ({
        id: userId,
        email: authUser?.email || null,
        full_name: authUser?.full_name || null,
        avatar_url: null,
        plan: "trial",
        trial_ends_at: null,
        created_at: authUser?.created_at || new Date().toISOString(),
        updated_at: null
      } satisfies WorkspaceProfile);
    const createdAtSource = profile.created_at || authUser?.created_at || new Date().toISOString();
    const userSessions = sessionsByUser.get(userId) || [];
    const userUsage = usageByUser.get(userId) || { sent: 0, received: 0, webhooks: 0 };
    const latestSubscription = chooseBestSubscription(
      subscriptionsByUser.get(userId) || []
    );
    const entitlement = getWorkspaceEntitlement(
      profile,
      latestSubscription,
      authUser?.email || profile.email || null
    );

    return {
      id: userId,
      email: profile.email || authUser?.email || "Unknown",
      fullName: profile.full_name || authUser?.full_name || "Unknown user",
      accessMode: entitlement.mode,
      planLabel: entitlement.planLabel,
      sessionCount: userSessions.length,
      connectedCount: userSessions.filter((session) => session.status === "connected").length,
      messagesSent: userUsage.sent,
      messagesReceived: userUsage.received,
      webhookDeliveries: userUsage.webhooks,
      createdAt: formatDateTime(createdAtSource),
      createdAtSortMs: parseTimestamp(createdAtSource),
      lastSignInAt: authUser?.last_sign_in_at || null,
      trialEndsAt: entitlement.trialEndsAt,
      subscriptionEndsAt: entitlement.subscriptionEndsAt
    };
  })
    .sort((left, right) => right.createdAtSortMs - left.createdAtSortMs)
    .map(({ createdAtSortMs: _createdAtSortMs, ...user }) => user);

  const recentLogins = users
    .filter((user) => Boolean(user.lastSignInAt))
    .sort(
      (left, right) =>
        parseTimestamp(right.lastSignInAt) - parseTimestamp(left.lastSignInAt)
    )
    .slice(0, 12)
    .map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      lastSignInAt: formatDateTime(user.lastSignInAt)
    }));
  const sessionRows = sessions.map((session) => {
    const owner = profileById.get(session.user_id);
    const authOwner = authUsersById.get(session.user_id);

    return {
      id: session.id,
      name: session.name,
      ownerEmail: owner?.email || authOwner?.email || "Unknown",
      ownerName: owner?.full_name || authOwner?.full_name || "Unknown user",
      status: session.status,
      number: session.connected_phone || session.phone_number || "Not available",
      connectedAs: session.connected_name || "Not connected",
      webhookUrl: session.webhook_url || "Not set",
      createdAt: formatDateTime(session.created_at)
    };
  });

  const recentActivity = recentMessages.map((message) => {
    const owner = profileById.get(message.user_id);
    const authOwner = authUsersById.get(message.user_id);

    return {
      sessionId: message.session_id,
      ownerEmail: owner?.email || authOwner?.email || "Unknown",
      direction: message.direction,
      body: message.body?.trim() || "No body",
      createdAt: formatDateTime(message.created_at)
    };
  });

  return {
    totals: {
      totalUsers: users.length,
      activeWorkspaces: users.filter((user) => user.accessMode !== "expired").length,
      trialingUsers: users.filter((user) => user.accessMode === "trial").length,
      subscribedUsers: users.filter((user) => user.accessMode === "subscription").length,
      expiredUsers: users.filter((user) => user.accessMode === "expired").length,
      totalSessions: sessions.length,
      connectedSessions: sessions.filter((session) => session.status === "connected").length,
      loginsLast24h: users.filter(
        (user) => parseTimestamp(user.lastSignInAt) >= Date.now() - 24 * 60 * 60 * 1000
      ).length
    },
    users,
    sessions: sessionRows,
    recentLogins,
    recentActivity
  };
}

export async function applyAdminAccessAction(
  userId: string,
  action: AdminAccessAction,
  options: AdminAccessOptions = {}
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  switch (action) {
    case "extendTrial": {
      const { data, error } = await supabase
        .from("profiles")
        .select("trial_ends_at")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const days = options.trialDays && options.trialDays > 0 ? options.trialDays : 2;
      const currentEnd =
        parseTimestamp(
          (data as { trial_ends_at?: string | null } | null)?.trial_ends_at || null
        ) || now.getTime();
      const nextEnd = new Date(
        Math.max(currentEnd, now.getTime()) + days * 24 * 60 * 60 * 1000
      );
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          plan: "trial",
          trial_ends_at: nextEnd.toISOString()
        })
        .eq("id", userId);

      if (updateError) {
        throw updateError;
      }
      return;
    }

    case "grantSubscription": {
      const plan: AdminGrantPlan = options.plan || "unlimited";
      const durationDays =
        options.durationDays && options.durationDays > 0
          ? options.durationDays
          : PLAN_DEFAULT_DURATION_DAYS[plan];
      const expiresAt = new Date(
        now.getTime() + durationDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error: expireError } = await supabase
        .from("subscriptions")
        .update({
          status: "expired",
          current_period_end: now.toISOString()
        })
        .eq("user_id", userId)
        .in("status", Array.from(ACTIVE_SUBSCRIPTION_STATUSES));

      if (expireError) {
        throw expireError;
      }

      const { error: insertError } = await supabase.from("subscriptions").insert({
        user_id: userId,
        plan,
        status: "active",
        current_period_end: expiresAt
      });

      if (insertError) {
        throw insertError;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ plan: "subscription" })
        .eq("id", userId);

      if (profileError) {
        throw profileError;
      }
      return;
    }

    case "expireAccess": {
      const expiredAt = new Date(now.getTime() - 60 * 1000).toISOString();
      const revokeReason =
        "Workspace access expired from admin. Reconnect this session after access is restored.";

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          plan: "expired",
          trial_ends_at: expiredAt
        })
        .eq("id", userId);

      if (profileError) {
        throw profileError;
      }

      const { error: subscriptionError } = await supabase
        .from("subscriptions")
        .update({
          status: "expired",
          current_period_end: now.toISOString()
        })
        .eq("user_id", userId);

      if (subscriptionError) {
        throw subscriptionError;
      }

      await revokeUserSessionAccess(userId, revokeReason);
      return;
    }

    case "deleteUser": {
      // Full purge: revoke live WhatsApp sockets, then delete every row tied
      // to this user across the public + private schemas, then drop the
      // auth.users record itself. This is irreversible.
      await revokeUserSessionAccess(userId, "Workspace deleted by admin.").catch(() => null);

      const { deleteSession } = await import("@/lib/whatsapp/supabase-session-manager");

      const { data: userSessions } = await supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("user_id", userId);

      for (const row of (userSessions || []) as AdminSessionIdRow[]) {
        if (row.id) {
          await deleteSession(row.id).catch(() => null);
        }
      }

      // Cascade-clean any remaining rows owned by the user. Each delete is
      // best-effort because RLS policies + foreign keys may already clear them.
      const cascadeTargets = [
        "messages",
        "webhook_deliveries",
        "personal_access_tokens",
        "subscriptions",
        "usage_daily",
        "whatsapp_sessions",
        "profiles"
      ];

      for (const table of cascadeTargets) {
        await supabase.from(table).delete().eq("user_id", userId).then(
          () => undefined,
          () => undefined
        );
      }
      // profiles row uses `id` not `user_id`
      await supabase.from("profiles").delete().eq("id", userId).then(
        () => undefined,
        () => undefined
      );

      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        throw authDeleteError;
      }
      return;
    }

    default:
      throw new Error("Unsupported admin action.");
  }
}

export async function deleteSessionAsAdmin(sessionId: string): Promise<boolean> {
  const { deleteSession } = await import("@/lib/whatsapp/supabase-session-manager");
  return deleteSession(sessionId);
}
