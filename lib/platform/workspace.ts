import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type WorkspaceProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type WorkspaceSubscription = {
  id: string;
  user_id: string;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  created_at: string;
};

export type WorkspaceEntitlement = {
  mode: "owner" | "subscription" | "trial" | "expired";
  hasActiveAccess: boolean;
  isUnlimited: boolean;
  planLabel: string;
  sessionLimit: number | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  statusMessage: string;
};

export type WorkspaceContext = {
  profile: WorkspaceProfile;
  subscription: WorkspaceSubscription | null;
  trustedEmail: string | null;
  entitlement: WorkspaceEntitlement;
};

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(message: string, status: number = 403) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.status = status;
  }
}

const DEFAULT_OWNER_EMAILS = ["jayednabil50@gmail.com"];
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const TRIAL_SESSION_LIMIT = 1;
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

function parseOwnerEmails(): string[] {
  const raw = process.env.WHATSFLOW_OWNER_EMAILS?.trim();
  const configured = raw
    ? raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const emails = configured.length > 0 ? configured : DEFAULT_OWNER_EMAILS;
  return Array.from(new Set(emails.map((value) => value.toLowerCase())));
}

function formatPlanName(plan?: string | null): string {
  if (!plan) {
    return "Subscription";
  }

  return plan
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return parseOwnerEmails().includes(email.trim().toLowerCase());
}

async function getTrustedUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(userId);

  if (error) {
    throw new WorkspaceAccessError("Failed to verify workspace identity.", 500);
  }

  return data.user?.email?.trim().toLowerCase() || null;
}

export function getSessionLimit(plan?: string | null): number | null {
  switch ((plan || "").toLowerCase()) {
    case "trial":
      return TRIAL_SESSION_LIMIT;
    case "expired":
      return 0;
    default:
      return null;
  }
}

export function getActivePlanLabel(plan?: string | null): string {
  switch ((plan || "").toLowerCase()) {
    case "owner":
      return "Owner unlimited";
    case "trial":
      return "3-day trial";
    case "expired":
      return "Trial expired";
    default:
      return formatPlanName(plan);
  }
}

export function getEffectiveTrialEndsAt(
  profile: Pick<WorkspaceProfile, "created_at" | "trial_ends_at">
): string {
  const createdAtMs = parseTimestamp(profile.created_at) || Date.now();
  const fallbackEndsAtMs = createdAtMs + TRIAL_DURATION_MS;
  const storedEndsAtMs = parseTimestamp(profile.trial_ends_at);
  const effectiveEndsAtMs = Math.max(storedEndsAtMs || 0, fallbackEndsAtMs);
  return new Date(effectiveEndsAtMs).toISOString();
}

export function isTrialExpired(
  profile: Pick<WorkspaceProfile, "created_at" | "trial_ends_at">
): boolean {
  return parseTimestamp(getEffectiveTrialEndsAt(profile))! <= Date.now();
}

export function getTrialRemainingMs(
  profile: Pick<WorkspaceProfile, "created_at" | "trial_ends_at">
): number {
  return Math.max(0, parseTimestamp(getEffectiveTrialEndsAt(profile))! - Date.now());
}

export function formatTrialEndsAt(
  value?: string | null,
  options?: { isUnlimited?: boolean }
): string {
  if (options?.isUnlimited) {
    return "No expiration";
  }

  const timestamp = parseTimestamp(value);
  if (!timestamp) {
    return "-";
  }

  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function isActiveSubscription(subscription?: WorkspaceSubscription | null): boolean {
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

function chooseBestSubscription(
  subscriptions: WorkspaceSubscription[]
): WorkspaceSubscription | null {
  if (subscriptions.length === 0) {
    return null;
  }

  return [...subscriptions].sort((left, right) => {
    const leftActive = isActiveSubscription(left) ? 1 : 0;
    const rightActive = isActiveSubscription(right) ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftPeriodEnd = parseTimestamp(left.current_period_end) || 0;
    const rightPeriodEnd = parseTimestamp(right.current_period_end) || 0;
    if (leftPeriodEnd !== rightPeriodEnd) {
      return rightPeriodEnd - leftPeriodEnd;
    }

    return (
      (parseTimestamp(right.created_at) || 0) - (parseTimestamp(left.created_at) || 0)
    );
  })[0];
}

export function getWorkspaceEntitlement(
  profile: WorkspaceProfile,
  subscription?: WorkspaceSubscription | null,
  trustedEmail?: string | null
): WorkspaceEntitlement {
  if (isOwnerEmail(trustedEmail)) {
    return {
      mode: "owner",
      hasActiveAccess: true,
      isUnlimited: true,
      planLabel: "Owner unlimited",
      sessionLimit: null,
      expiresAt: null,
      trialEndsAt: null,
      subscriptionEndsAt: subscription?.current_period_end || null,
      statusMessage: "Unlimited access is active for this owner workspace."
    };
  }

  if (isActiveSubscription(subscription)) {
    const periodEnd = subscription?.current_period_end || null;
    return {
      mode: "subscription",
      hasActiveAccess: true,
      isUnlimited: false,
      planLabel: `${formatPlanName(subscription?.plan)} active`,
      sessionLimit: null,
      expiresAt: periodEnd,
      trialEndsAt: null,
      subscriptionEndsAt: periodEnd,
      statusMessage: "Your paid workspace is active."
    };
  }

  const trialEndsAt = getEffectiveTrialEndsAt(profile);
  const trialIsActive = parseTimestamp(trialEndsAt)! > Date.now();

  if (trialIsActive) {
    return {
      mode: "trial",
      hasActiveAccess: true,
      isUnlimited: false,
      planLabel: "3-day trial",
      sessionLimit: TRIAL_SESSION_LIMIT,
      expiresAt: trialEndsAt,
      trialEndsAt,
      subscriptionEndsAt: subscription?.current_period_end || null,
      statusMessage: "Your 3-day free trial is active."
    };
  }

  return {
    mode: "expired",
    hasActiveAccess: false,
    isUnlimited: false,
    planLabel: "Trial expired",
    sessionLimit: 0,
    expiresAt: trialEndsAt,
    trialEndsAt,
    subscriptionEndsAt: subscription?.current_period_end || null,
    statusMessage:
      "Your 3-day free trial has ended. Start a subscription to reconnect this number."
  };
}

export async function getWorkspaceProfile(userId: string): Promise<WorkspaceProfile> {
  const { data, error } = await getSupabaseAdminClient()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new WorkspaceAccessError("Workspace profile not found.", 404);
  }

  return data as WorkspaceProfile;
}

export async function getLatestSubscription(
  userId: string
): Promise<WorkspaceSubscription | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("subscriptions")
    .select("id, user_id, plan, status, current_period_end, created_at")
    .eq("user_id", userId)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new WorkspaceAccessError("Failed to load subscription state.", 500);
  }

  return chooseBestSubscription((data || []) as WorkspaceSubscription[]);
}

export async function getWorkspaceContext(userId: string): Promise<WorkspaceContext> {
  const [profile, subscription, trustedEmail] = await Promise.all([
    getWorkspaceProfile(userId),
    getLatestSubscription(userId),
    getTrustedUserEmail(userId)
  ]);

  return {
    profile,
    subscription,
    trustedEmail,
    entitlement: getWorkspaceEntitlement(profile, subscription, trustedEmail)
  };
}

export async function requireActiveWorkspace(userId: string): Promise<WorkspaceProfile> {
  const { profile, entitlement } = await getWorkspaceContext(userId);

  if (!entitlement.hasActiveAccess) {
    throw new WorkspaceAccessError(entitlement.statusMessage, 402);
  }

  return profile;
}

export async function requireOwnerWorkspace(userId: string): Promise<WorkspaceProfile> {
  const { profile, trustedEmail } = await getWorkspaceContext(userId);

  if (!isOwnerEmail(trustedEmail)) {
    throw new WorkspaceAccessError("Owner access is required for this area.", 403);
  }

  return profile;
}

export async function requireSessionCapacity(
  userId: string,
  currentSessionCount: number
): Promise<WorkspaceProfile> {
  const { profile, entitlement } = await getWorkspaceContext(userId);

  if (!entitlement.hasActiveAccess) {
    throw new WorkspaceAccessError(entitlement.statusMessage, 402);
  }

  if (
    entitlement.sessionLimit !== null &&
    currentSessionCount >= entitlement.sessionLimit
  ) {
    const label = entitlement.planLabel.toLowerCase();
    throw new WorkspaceAccessError(
      `Your ${label} includes ${entitlement.sessionLimit} connected WhatsApp ${
        entitlement.sessionLimit === 1 ? "number" : "numbers"
      }. Upgrade to add more sessions.`,
      403
    );
  }

  return profile;
}
