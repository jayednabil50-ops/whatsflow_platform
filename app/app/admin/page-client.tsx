"use client";

import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  Activity,
  Clock3,
  Loader2,
  Shield,
  Trash2,
  UserRound,
  Wifi
} from "lucide-react";
import { readJsonResponse } from "@/lib/http/response";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { AnimatedNumber } from "@/components/ui/animated-number";

type AdminOverview = {
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

function MetricCard({
  icon: Icon,
  label,
  numericValue,
  valueSuffix,
  detail
}: {
  icon: ElementType;
  label: string;
  numericValue: number;
  valueSuffix?: string;
  detail: string;
}) {
  return (
    <div className="lift rounded-2xl border border-border bg-card p-5 hover:border-accent/30">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-foreground">
        <AnimatedNumber value={numericValue} suffix={valueSuffix} />
      </p>
      <p className="mt-2 text-xs text-muted-foreground/70">{detail}</p>
    </div>
  );
}

export function AdminDashboardClient() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [userActionLoading, setUserActionLoading] = useState<string>("");
  const [sessionActionLoading, setSessionActionLoading] = useState<string>("");

  const userCountLabel = useMemo(
    () => `${data?.totals.totalUsers || 0} total`,
    [data?.totals.totalUsers]
  );

  useEffect(() => {
    void fetchOverview();
    const interval = setInterval(() => {
      void fetchOverview(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function fetchOverview(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const body = await readJsonResponse<AdminOverview & { error?: string }>(res);

      if (!res.ok) {
        setFeedback(`Error: ${body.error || "Failed to load the admin dashboard."}`);
        return;
      }

      setData(body);
      if (!silent) {
        setFeedback("");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to load the admin dashboard.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function runUserAction(
    userId: string,
    action: "extendTrial" | "grantSubscription" | "expireAccess" | "deleteUser",
    userEmail?: string,
    extras?: { plan?: string; durationDays?: number; trialDays?: number }
  ) {
    if (action === "deleteUser") {
      const confirmText = userEmail
        ? `Permanently delete ${userEmail}? This wipes their account, sessions, messages, webhooks, and API keys. This cannot be undone.`
        : "Permanently delete this user? This wipes their account, sessions, messages, webhooks, and API keys. This cannot be undone.";
      if (!confirm(confirmText)) {
        return;
      }
    }

    setUserActionLoading(`${userId}:${action}`);
    setFeedback("");

    try {
      const res = await fetch(`/api/admin/users/${userId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extras || {}) })
      });
      const body = await readJsonResponse<{ error?: string }>(res);

      if (!res.ok) {
        setFeedback(`Error: ${body.error || "Failed to update workspace access."}`);
        return;
      }

      setFeedback("Workspace access updated.");
      await fetchOverview(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to update workspace access.");
    } finally {
      setUserActionLoading("");
    }
  }

  function GrantSubscriptionControl({
    userId,
    userEmail
  }: {
    userId: string;
    userEmail: string;
  }) {
    const [plan, setPlan] = useState<"starter" | "pro" | "annual" | "unlimited">("pro");
    const [days, setDays] = useState<string>("");

    const defaultDaysByPlan: Record<typeof plan, number> = {
      starter: 30,
      pro: 60,
      annual: 365,
      unlimited: 30
    };

    const effectiveDays =
      days.trim() && Number(days) > 0 ? Math.floor(Number(days)) : defaultDaysByPlan[plan];

    const loadingKey = `${userId}:grantSubscription`;
    const isLoading = userActionLoading === loadingKey;

    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 py-1.5">
        <select
          value={plan}
          onChange={(event) => setPlan(event.target.value as typeof plan)}
          disabled={isLoading}
          className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-foreground/80"
        >
          <option value="starter">Starter (1 session)</option>
          <option value="pro">Pro (3 sessions)</option>
          <option value="annual">Annual (3 sessions)</option>
          <option value="unlimited">Unlimited</option>
        </select>
        <input
          type="number"
          min="1"
          max="3650"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          placeholder={`${defaultDaysByPlan[plan]}d`}
          disabled={isLoading}
          className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground/80 placeholder:text-muted-foreground/50"
          title="Custom duration in days"
        />
        <button
          onClick={() =>
            void runUserAction(userId, "grantSubscription", userEmail, {
              plan,
              durationDays: effectiveDays
            })
          }
          disabled={isLoading}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {isLoading ? "Granting..." : `Grant ${effectiveDays}d`}
        </button>
      </div>
    );
  }

  function ExtendTrialControl({ userId }: { userId: string }) {
    const [days, setDays] = useState<string>("");
    const effectiveDays = days.trim() && Number(days) > 0 ? Math.floor(Number(days)) : 2;
    const loadingKey = `${userId}:extendTrial`;
    const isLoading = userActionLoading === loadingKey;

    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-1.5">
        <input
          type="number"
          min="1"
          max="365"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          placeholder="2d"
          disabled={isLoading}
          className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground/80 placeholder:text-muted-foreground/50"
          title="Days to add to trial"
        />
        <button
          onClick={() =>
            void runUserAction(userId, "extendTrial", undefined, {
              trialDays: effectiveDays
            })
          }
          disabled={isLoading}
          className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:border-accent/40 hover:text-foreground disabled:opacity-50"
        >
          {isLoading ? "Extending..." : `Extend trial +${effectiveDays}d`}
        </button>
      </div>
    );
  }

  async function deleteAdminSession(sessionId: string) {
    if (!confirm("Delete this WhatsApp session for the customer? This cannot be undone.")) {
      return;
    }

    setSessionActionLoading(sessionId);
    setFeedback("");

    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: "DELETE"
      });
      const body = await readJsonResponse<{ error?: string }>(res);

      if (!res.ok) {
        setFeedback(`Error: ${body.error || "Failed to delete the session."}`);
        return;
      }

      setFeedback("Session deleted from the owner admin dashboard.");
      await fetchOverview(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to delete the session.");
    } finally {
      setSessionActionLoading("");
    }
  }

  if (loading && !data) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400/80">
            Owner control room
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Admin dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Full visibility into users, sessions, access windows, and login activity.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {userCountLabel} workspaces - auto refresh every 5s
        </div>
      </div>

      {feedback && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground/70">
          {feedback}
        </div>
      )}

      <section className="stagger-children grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UserRound}
          label="Total users"
          numericValue={data?.totals.totalUsers || 0}
          detail={`${data?.totals.activeWorkspaces || 0} active right now`}
        />
        <MetricCard
          icon={Shield}
          label="Trialing users"
          numericValue={data?.totals.trialingUsers || 0}
          detail={`${data?.totals.subscribedUsers || 0} subscribed / ${data?.totals.expiredUsers || 0} expired`}
        />
        <MetricCard
          icon={Wifi}
          label="WhatsApp sessions"
          numericValue={data?.totals.totalSessions || 0}
          detail={`${data?.totals.connectedSessions || 0} currently connected`}
        />
        <MetricCard
          icon={Clock3}
          label="Logins (24h)"
          numericValue={data?.totals.loginsLast24h || 0}
          detail="Recent sign-ins"
        />
      </section>

      <ScrollReveal className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Customer workspaces</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Extend trials, grant subscription time, or revoke access from one place.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {data?.users.map((user, idx) => (
            <ScrollReveal
              key={user.id}
              delay={Math.min(idx * 50, 300)}
              className="lift rounded-2xl border border-border bg-muted/50 p-4 hover:border-accent/30"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-300">
                      {user.planLabel}
                    </span>
                    <span className="rounded-full bg-muted/50 px-2.5 py-1 text-muted-foreground">
                      {user.sessionCount} sessions
                    </span>
                    <span className="rounded-full bg-muted/50 px-2.5 py-1 text-muted-foreground">
                      {user.connectedCount} connected
                    </span>
                    <span className="rounded-full bg-muted/50 px-2.5 py-1 text-muted-foreground">
                      last login {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "never"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Messages sent", user.messagesSent],
                    ["Messages received", user.messagesReceived],
                    ["Webhook hits", user.webhookDeliveries],
                    ["Created", user.createdAt],
                    ["Trial ends", user.trialEndsAt ? new Date(user.trialEndsAt).toLocaleString() : "Not set"],
                    ["Subscription", user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleString() : "Not active"]
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
                      <p className="mt-1.5 text-sm font-medium text-foreground/75">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ExtendTrialControl userId={user.id} />
                <GrantSubscriptionControl userId={user.id} userEmail={user.email} />
                <button
                  onClick={() => void runUserAction(user.id, "expireAccess")}
                  disabled={userActionLoading === `${user.id}:expireAccess`}
                  className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {userActionLoading === `${user.id}:expireAccess` ? "Updating..." : "Expire access"}
                </button>
                <button
                  onClick={() => void runUserAction(user.id, "deleteUser", user.email)}
                  disabled={userActionLoading === `${user.id}:deleteUser`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {userActionLoading === `${user.id}:deleteUser` ? "Deleting..." : "Delete user"}
                </button>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </ScrollReveal>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ScrollReveal className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <h2 className="text-lg font-semibold text-foreground">All sessions</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Delete a customer session from the owner console if needed.
          </p>

          <div className="mt-5 space-y-3">
            {data?.sessions.map((session, idx) => (
              <ScrollReveal
                key={session.id}
                delay={Math.min(idx * 40, 240)}
                className="lift flex flex-col gap-3 rounded-2xl border border-border bg-muted/50 p-4 xl:flex-row xl:items-center xl:justify-between hover:border-accent/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{session.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {session.ownerEmail} - {session.number}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    {session.status} - {session.connectedAs} - {session.createdAt}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                    {session.webhookUrl}
                  </span>
                  <button
                    onClick={() => void deleteAdminSession(session.id)}
                    disabled={sessionActionLoading === session.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {sessionActionLoading === session.id ? (
                      "Deleting..."
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete session
                      </>
                    )}
                  </button>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </ScrollReveal>

        <div className="space-y-6">
          <ScrollReveal className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Recent logins</h2>
            <div className="mt-4 space-y-3">
              {data?.recentLogins.map((user, idx) => (
                <ScrollReveal
                  key={user.id}
                  delay={Math.min(idx * 30, 180)}
                  className="lift rounded-xl border border-border bg-muted/50 px-4 py-3 hover:border-accent/30"
                >
                  <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-2 text-xs text-emerald-500">{user.lastSignInAt}</p>
                </ScrollReveal>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Recent message activity</h2>
            <div className="mt-4 space-y-3">
              {data?.recentActivity.map((item, index) => (
                <ScrollReveal
                  key={`${item.sessionId}-${index}`}
                  delay={Math.min(index * 30, 180)}
                  className="lift rounded-xl border border-border bg-muted/50 px-4 py-3 hover:border-accent/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{item.ownerEmail}</p>
                    <span className="rounded-full bg-muted/50 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.direction}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-foreground/45">{item.body}</p>
                  <p className="mt-2 text-[11px] text-emerald-500">{item.createdAt}</p>
                </ScrollReveal>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}
