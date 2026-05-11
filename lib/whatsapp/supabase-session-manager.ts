import { randomBytes, randomUUID } from "crypto";
import { Boom } from "@hapi/boom";
import type { proto, WASocket } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { countries } from "@/lib/countries";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleConfig } from "@/lib/supabase/config";
import {
  deleteSavedAuthState,
  hasSavedAuthState,
  loadSupabaseAuthState
} from "./supabase-auth-state";
import { insertMessageRecord } from "./message-store";
import { clearSessionSendState } from "./send-queue";
import {
  clearWebhookQueueForSession,
  queueWebhookDelivery
} from "./webhook-manager";
import { rememberSessionContactProfile } from "./contact-profiles";

export type SessionStatus =
  | "pending"
  | "qr_ready"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface SessionConfig {
  id: string;
  userId: string;
  name: string;
  countryCode: string;
  phone: string;
  webhookUrl?: string;
  webhookSecret?: string;
  apiKeyPrefix?: string;
  status: SessionStatus;
  qrCode?: string;
  connectedPhone?: string;
  connectedName?: string;
  device?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

type SessionRow = {
  id: string;
  user_id: string;
  name: string;
  country_code?: string | null;
  phone_number: string;
  status: SessionStatus;
  qr_code?: string | null;
  webhook_url?: string | null;
  webhook_secret?: string | null;
  api_key_prefix?: string | null;
  connected_phone?: string | null;
  connected_name?: string | null;
  device?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRuntimeStore = {
  activeSockets: Map<string, WASocket>;
  sessionConfigs: Map<string, SessionConfig>;
  reconnectAttempts: Map<string, number>;
  resumeSessionPromises: Map<string, Promise<void>>;
  processedMessageIds: Set<string>;
  hydratePromise: Promise<void> | null;
  sessionsHydrated: boolean;
};

type RevokeSessionAccessOptions = {
  clearAuthState?: boolean;
  reason?: string;
};

type BaileysModule = typeof import("@whiskeysockets/baileys");
type DisconnectReasonMap = {
  timedOut: number;
  badSession: number;
  connectionReplaced: number;
  multideviceMismatch: number;
  forbidden: number;
  loggedOut: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __whatsflowSessionRuntime: SessionRuntimeStore | undefined;
}

function createRuntimeStore(): SessionRuntimeStore {
  return {
    activeSockets: new Map<string, WASocket>(),
    sessionConfigs: new Map<string, SessionConfig>(),
    reconnectAttempts: new Map<string, number>(),
    resumeSessionPromises: new Map<string, Promise<void>>(),
    processedMessageIds: new Set<string>(),
    hydratePromise: null,
    sessionsHydrated: false
  };
}

const runtimeStore =
  globalThis.__whatsflowSessionRuntime ??
  (globalThis.__whatsflowSessionRuntime = createRuntimeStore());
const activeSockets = runtimeStore.activeSockets;
const sessionConfigs = runtimeStore.sessionConfigs;
const reconnectAttempts = runtimeStore.reconnectAttempts;
const resumeSessionPromises = runtimeStore.resumeSessionPromises;
const processedMessageIds = runtimeStore.processedMessageIds;
const baileysLogger = pino({
  level: process.env.WHATSAPP_LOG_LEVEL || "silent"
});
const maxReconnectAttempts = 3;
const configuredAppendReplayWindowMs = Number(
  process.env.WHATSAPP_APPEND_REPLAY_WINDOW_MS || 10 * 60 * 1000
);
const appendReplayWindowMs = Number.isFinite(configuredAppendReplayWindowMs)
  ? configuredAppendReplayWindowMs
  : 10 * 60 * 1000;
let baileysModulePromise: Promise<BaileysModule> | null = null;

const supabase = hasSupabaseServiceRoleConfig() ? getSupabaseAdminClient() : null;

async function loadBaileysModule(): Promise<BaileysModule> {
  if (!baileysModulePromise) {
    baileysModulePromise = import("@whiskeysockets/baileys");
  }

  return baileysModulePromise;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function shouldPersistToDb(session: Pick<SessionConfig, "id" | "userId">): boolean {
  return Boolean(supabase && isUuid(session.id) && isUuid(session.userId));
}

async function normalizePersistedSession(
  session: SessionConfig
): Promise<SessionConfig> {
  if (
    session.status === "connected" ||
    session.status === "connecting" ||
    session.status === "qr_ready"
  ) {
    if (await hasSavedAuthState(session.id)) {
      return {
        ...session,
        status: "connecting",
        qrCode: undefined,
        error: undefined
      };
    }

    return {
      ...session,
      status: "disconnected",
      qrCode: undefined,
      error:
        session.error ||
        "Server restarted. Refresh the QR code to reconnect this session."
    };
  }

  return {
    ...session,
    qrCode: undefined
  };
}

function normalizePhoneDigits(value?: string): string {
  return (value || "").replace(/\D/g, "");
}

function getExpectedPhoneDigits(session: SessionConfig): string {
  const dialCode =
    countries.find((country) => country.code === session.countryCode)?.dialCode || "";
  const dialDigits = normalizePhoneDigits(dialCode);
  const phoneDigits = normalizePhoneDigits(session.phone);

  if (!dialDigits) {
    return phoneDigits;
  }

  if (phoneDigits.startsWith(dialDigits)) {
    return phoneDigits;
  }

  return `${dialDigits}${phoneDigits.replace(/^0+/, "")}`;
}

function getConnectedPhoneDigits(userId?: string): string {
  return normalizePhoneDigits(userId?.split(":")[0]?.split("@")[0]);
}

function getJidUser(jid?: string | null): string {
  return jid?.split("@")[0] || "";
}

function isDirectChatJid(jid?: string | null): boolean {
  if (!jid) {
    return false;
  }

  return (
    jid.endsWith("@s.whatsapp.net") ||
    jid.endsWith("@lid") ||
    jid.endsWith("@hosted.lid")
  );
}

function isMessageInsideReplayWindow(message: proto.IWebMessageInfo): boolean {
  return Math.abs(Date.now() - getMessageTimestampMs(message)) <= appendReplayWindowMs;
}

function shouldProcessMessageUpsert(
  type: string,
  message: proto.IWebMessageInfo
): boolean {
  if (type === "notify") {
    return true;
  }

  if (type === "append") {
    return !message.key?.fromMe && isMessageInsideReplayWindow(message);
  }

  return false;
}

function logMessageDebug(message: string): void {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.WHATSAPP_DEBUG_MESSAGES === "1"
  ) {
    console.log(message);
  }
}

function unwrapMessageContent(
  content?: proto.IMessage | null
): proto.IMessage | undefined {
  let current = content || undefined;

  for (let depth = 0; depth < 6 && current; depth++) {
    const nested =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      current.groupMentionedMessage?.message;

    if (!nested) {
      return current;
    }

    current = nested;
  }

  return current;
}

function getMessageTimestampMs(message: proto.IWebMessageInfo): number {
  const rawTimestamp = message.messageTimestamp;
  const timestamp =
    typeof rawTimestamp === "number"
      ? rawTimestamp
      : rawTimestamp
        ? Number(rawTimestamp.toString())
        : 0;

  if (!timestamp || Number.isNaN(timestamp)) {
    return Date.now();
  }

  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
}

function getDisconnectMessage(
  statusCode: number | undefined,
  disconnectReason: DisconnectReasonMap
): string {
  switch (statusCode) {
    case disconnectReason.timedOut:
      return "QR code expired. Refresh the QR code and scan it from WhatsApp Linked Devices.";
    case disconnectReason.badSession:
      return "WhatsApp session keys became invalid. Delete this session and create a fresh QR.";
    case disconnectReason.connectionReplaced:
      return "This WhatsApp account was linked from another place. Refresh the QR to reconnect.";
    case disconnectReason.multideviceMismatch:
      return "This WhatsApp account cannot use multi-device linking right now.";
    case disconnectReason.forbidden:
      return "WhatsApp refused this connection. Try again later or use a different account.";
    case disconnectReason.loggedOut:
      return "This session was logged out from WhatsApp.";
    default:
      return "Connection closed unexpectedly. Refresh the QR code to reconnect.";
  }
}

async function persistContactProfiles(
  sessionId: string,
  contacts: Array<{
    id?: string | null;
    lid?: string | null;
    phoneNumber?: string | null;
    name?: string | null;
    notify?: string | null;
    verifiedName?: string | null;
  }>
): Promise<void> {
  for (const contact of contacts) {
    const remoteJid =
      contact.id ||
      contact.lid ||
      (contact.phoneNumber ? `${normalizePhoneDigits(contact.phoneNumber)}@s.whatsapp.net` : "");

    if (!isDirectChatJid(remoteJid)) {
      continue;
    }

    await rememberSessionContactProfile({
      sessionId,
      remoteJid,
      displayName: contact.name || contact.notify || contact.verifiedName,
      phoneNumber: contact.phoneNumber || undefined
    });
  }
}

function mapRowToSession(row: SessionRow): SessionConfig {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    countryCode: row.country_code || "",
    phone: row.phone_number,
    webhookUrl: row.webhook_url || undefined,
    webhookSecret: row.webhook_secret || undefined,
    apiKeyPrefix: row.api_key_prefix || undefined,
    status: row.status,
    qrCode: row.qr_code || undefined,
    connectedPhone: row.connected_phone || undefined,
    connectedName: row.connected_name || undefined,
    device: row.device || undefined,
    error: row.error || undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

async function saveSessionToDb(session: SessionConfig): Promise<void> {
  if (!supabase || !shouldPersistToDb(session)) {
    return;
  }

  try {
    const { error } = await supabase.from("whatsapp_sessions").upsert({
      id: session.id,
      user_id: session.userId,
      name: session.name,
      country_code: session.countryCode,
      phone_number: session.phone,
      status: session.status,
      qr_code: session.qrCode ?? null,
      webhook_url: session.webhookUrl ?? null,
      webhook_secret: session.webhookSecret ?? null,
      api_key_prefix: session.apiKeyPrefix ?? null,
      connected_phone: session.connectedPhone ?? null,
      connected_name: session.connectedName ?? null,
      device: session.device ?? null,
      error: session.error ?? null,
      last_seen_at:
        session.status === "connected"
          ? new Date(session.updatedAt).toISOString()
          : null,
      created_at: new Date(session.createdAt).toISOString(),
      updated_at: new Date(session.updatedAt).toISOString()
    });

    if (error) {
      console.error("[DB] Error saving session:", error);
    }
  } catch (error) {
    console.error("[DB] Failed to save session:", error);
  }
}

async function loadSessionsFromDb(userId?: string): Promise<SessionConfig[]> {
  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from("whatsapp_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[DB] Error loading sessions:", error);
      return [];
    }

    const mappedSessions = ((data || []) as SessionRow[]).map(mapRowToSession);
    return Promise.all(mappedSessions.map(normalizePersistedSession));
  } catch (error) {
    console.error("[DB] Failed to load sessions:", error);
    return [];
  }
}

async function loadSingleSessionFromDb(
  sessionId: string,
  userId?: string
): Promise<SessionConfig | null> {
  if (!supabase || !isUuid(sessionId)) {
    return null;
  }

  try {
    let query = supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("id", sessionId);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("[DB] Error loading session:", error);
      }
      return null;
    }

    return normalizePersistedSession(mapRowToSession(data as SessionRow));
  } catch (error) {
    console.error("[DB] Failed to load session:", error);
    return null;
  }
}

async function persistSession(session: SessionConfig): Promise<void> {
  sessionConfigs.set(session.id, session);
  await saveSessionToDb(session);
}

async function hydrateSessions(): Promise<void> {
  if (runtimeStore.sessionsHydrated) {
    return;
  }

  if (runtimeStore.hydratePromise) {
    return runtimeStore.hydratePromise;
  }

  runtimeStore.hydratePromise = (async () => {
    const dbSessions = await loadSessionsFromDb();

    for (const session of dbSessions) {
      if (!sessionConfigs.has(session.id)) {
        sessionConfigs.set(session.id, session);
      }
    }

    runtimeStore.sessionsHydrated = true;
  })().finally(() => {
    runtimeStore.hydratePromise = null;
  });

  return runtimeStore.hydratePromise;
}

export async function createSession(
  config: Omit<SessionConfig, "id" | "status" | "createdAt" | "updatedAt">
): Promise<SessionConfig> {
  const now = Date.now();
  const session: SessionConfig = {
    ...config,
    id: randomUUID(),
    webhookSecret: randomBytes(24).toString("hex"),
    status: "pending",
    createdAt: now,
    updatedAt: now
  };

  await persistSession(session);
  return session;
}

export function getSession(id: string): SessionConfig | undefined {
  return sessionConfigs.get(id);
}

export async function getSessionById(
  id: string,
  userId?: string
): Promise<SessionConfig | undefined> {
  await hydrateSessions();

  const existing = sessionConfigs.get(id);
  if (existing && (!userId || existing.userId === userId)) {
    return existing;
  }

  const fromDb = await loadSingleSessionFromDb(id, userId);
  if (!fromDb) {
    return undefined;
  }

  sessionConfigs.set(fromDb.id, fromDb);
  return fromDb;
}

async function resolveSessionFromCacheOrDb(
  id: string,
  userId?: string
): Promise<SessionConfig | undefined> {
  const existing = sessionConfigs.get(id);
  if (existing && (!userId || existing.userId === userId)) {
    return existing;
  }

  return getSessionById(id, userId);
}

export async function ensureSessionConnection(
  id: string
): Promise<SessionConfig | undefined> {
  await hydrateSessions();

  const session = sessionConfigs.get(id);
  if (!session) {
    return undefined;
  }

  const hasSavedAuth = await hasSavedAuthState(id);

  // Already active or no saved credentials to restore from
  if (activeSockets.has(id) || !hasSavedAuth) {
    return session;
  }

  // Don't start another resume if we've already hit the reconnect ceiling
  if ((reconnectAttempts.get(id) || 0) >= maxReconnectAttempts) {
    return session;
  }

  const existingResume = resumeSessionPromises.get(id);
  if (existingResume) {
    await existingResume.catch(() => undefined);
    return sessionConfigs.get(id);
  }

  const resumePromise = (async () => {
    console.log(
      `[WHATSAPP] Auto-resuming session=${id} from saved device credentials`
    );
    reconnectAttempts.set(id, (reconnectAttempts.get(id) || 0) + 1);
    updateSession(id, {
      status: "connecting",
      qrCode: undefined,
      error: undefined
    });

    await startSessionConnection(id);
  })();

  resumeSessionPromises.set(id, resumePromise);

  try {
    await resumePromise;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restore WhatsApp connection.";

    console.error(`[WHATSAPP] Failed to auto-resume session=${id}:`, message);
    updateSession(id, {
      status: "error",
      qrCode: undefined,
      error: message
    });
  } finally {
    resumeSessionPromises.delete(id);
  }

  return sessionConfigs.get(id);
}

export function getAllSessions(): SessionConfig[] {
  return Array.from(sessionConfigs.values());
}

export async function listSessions(userId?: string): Promise<SessionConfig[]> {
  await hydrateSessions();

  if (userId) {
    const dbSessions = await loadSessionsFromDb(userId);
    for (const session of dbSessions) {
      sessionConfigs.set(session.id, session);
    }

    return dbSessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  return Array.from(sessionConfigs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function updateSession(
  id: string,
  updates: Partial<SessionConfig>
): SessionConfig | undefined {
  const session = sessionConfigs.get(id);
  if (!session) {
    return undefined;
  }

  const updated: SessionConfig = {
    ...session,
    ...updates,
    updatedAt: Date.now()
  };

  // BUGFIX: Immediately update in-memory Map so all subsequent reads
  // return the latest state, not stale data from before the update.
  sessionConfigs.set(id, updated);

  void persistSession(updated).catch((error) => {
    console.error("[SESSION] Failed to persist session update:", error);
  });

  return updated;
}

function clearProcessedMessageState(sessionId: string): void {
  for (const messageKey of Array.from(processedMessageIds)) {
    if (messageKey.startsWith(`${sessionId}:`)) {
      processedMessageIds.delete(messageKey);
    }
  }
}

async function shutdownSessionSocket(
  id: string,
  options?: { logout?: boolean }
): Promise<void> {
  const socket = activeSockets.get(id);
  if (!socket) {
    return;
  }

  try {
    socket.ev.removeAllListeners("connection.update");
    socket.ev.removeAllListeners("messages.upsert");
    socket.ev.removeAllListeners("creds.update");
  } catch {
    // Ignore listener cleanup errors during shutdown.
  }

  if (options?.logout) {
    try {
      await socket.logout();
    } catch {
      // Ignore logout errors during cleanup.
    }
  }

  try {
    socket.end(undefined);
  } catch {
    // Ignore socket shutdown errors during cleanup.
  }

  activeSockets.delete(id);
}

export async function setSessionWebhook(
  id: string,
  webhookUrl?: string | null
): Promise<SessionConfig | undefined> {
  await hydrateSessions();

  const session = await resolveSessionFromCacheOrDb(id);
  if (!session) {
    return undefined;
  }

  const normalizedWebhookUrl =
    typeof webhookUrl === "string" ? webhookUrl.trim() : "";
  const updated: SessionConfig = {
    ...session,
    webhookUrl: normalizedWebhookUrl || undefined,
    updatedAt: Date.now()
  };

  await persistSession(updated);
  return updated;
}

export async function revokeSessionAccess(
  id: string,
  options: RevokeSessionAccessOptions = {}
): Promise<SessionConfig | undefined> {
  await hydrateSessions();

  const session = await resolveSessionFromCacheOrDb(id);
  if (!session) {
    return undefined;
  }

  await shutdownSessionSocket(id, { logout: true });
  reconnectAttempts.delete(id);
  resumeSessionPromises.delete(id);
  clearProcessedMessageState(id);
  clearSessionSendState(id);
  clearWebhookQueueForSession(id);

  if (options.clearAuthState !== false) {
    await deleteSavedAuthState(id);
  }

  const updated: SessionConfig = {
    ...session,
    status: "disconnected",
    qrCode: undefined,
    connectedPhone: undefined,
    connectedName: undefined,
    device: undefined,
    error:
      options.reason?.trim() ||
      "Workspace access is inactive. Reconnect this session after access is restored.",
    updatedAt: Date.now()
  };

  await persistSession(updated);
  return updated;
}

export async function deleteSession(id: string): Promise<boolean> {
  await hydrateSessions();

  const session = await resolveSessionFromCacheOrDb(id);
  if (!session) {
    return false;
  }

  await shutdownSessionSocket(id, { logout: true });
  sessionConfigs.delete(id);
  reconnectAttempts.delete(id);
  resumeSessionPromises.delete(id);
  clearProcessedMessageState(id);
  clearSessionSendState(id);
  clearWebhookQueueForSession(id);
  await deleteSavedAuthState(id);

  if (supabase && shouldPersistToDb(session)) {
    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[DB] Failed to delete session from DB:", error);
      throw new Error("Failed to permanently delete the WhatsApp session from the database.");
    }

    if (!data) {
      throw new Error("The WhatsApp session could not be confirmed as deleted.");
    }
  }

  return true;
}

export async function startSessionConnection(id: string, forceNewQr = false): Promise<void> {
  await hydrateSessions();

  const session = await resolveSessionFromCacheOrDb(id);
  if (!session) {
    throw new Error("Session not found");
  }

  const existingSocket = activeSockets.get(id);
  const currentStatus = sessionConfigs.get(id)?.status;

  // CRITICAL FIX: If there's already an active socket waiting for QR scan,
  // do NOT destroy it. Baileys automatically emits new QR codes when old
  // ones expire. Destroying the socket mid-scan kills the handshake and
  // causes the "invalid QR code" error users were seeing.
  if (existingSocket && !forceNewQr && (currentStatus === "qr_ready" || currentStatus === "connecting")) {
    console.log(`[WHATSAPP] Session ${id} already has an active socket in ${currentStatus} state. Keeping existing connection.`);
    return;
  }

  if (existingSocket) {
    try {
      // CRITICAL: Remove all event listeners before closing to prevent
      // stale creds.update handlers from overwriting fresh signal keys
      // in the database. This was the root cause of QR scan failures.
      (existingSocket.ev as unknown as { removeAllListeners: () => void }).removeAllListeners();
      existingSocket.end(undefined);
    } catch {
      // Ignore socket recycle errors while refreshing QR.
    }
    activeSockets.delete(id);
  }

  // When explicitly starting a fresh QR scan, wipe any stale/corrupted
  // signal keys from Supabase. Stale keys cause MessageCounterError
  // which silently breaks the handshake after scanning.
  if (forceNewQr) {
    await deleteSavedAuthState(id).catch(() => null);
    reconnectAttempts.delete(id);

    // Small delay to ensure stale socket handlers finish and
    // database deletes are committed before creating fresh state.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const { state, saveCreds } = await loadSupabaseAuthState(id);
  const baileys = await loadBaileysModule();
  const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion
  } = baileys;
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: baileysLogger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.windows("Desktop"),
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 60000,
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 2500,
    fireInitQueries: true,
    shouldSyncHistoryMessage: () => false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  activeSockets.set(id, sock);
  reconnectAttempts.delete(id);
  updateSession(id, {
    status: "connecting",
    qrCode: undefined,
    error: undefined
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messaging-history.set", ({ contacts }) => {
    if (!contacts?.length) {
      return;
    }

    void persistContactProfiles(id, contacts).catch((error) => {
      console.error("[CONTACTS] Failed to persist history contacts:", error);
    });
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    if (!contacts?.length) {
      return;
    }

    void persistContactProfiles(id, contacts).catch((error) => {
      console.error("[CONTACTS] Failed to persist contacts.upsert:", error);
    });
  });

  sock.ev.on("contacts.update", (contacts) => {
    if (!contacts?.length) {
      return;
    }

    void persistContactProfiles(id, contacts).catch((error) => {
      console.error("[CONTACTS] Failed to persist contacts.update:", error);
    });
  });

  sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
    if (!lid || !pn) {
      return;
    }

    void rememberSessionContactProfile({
      sessionId: id,
      remoteJid: `${lid}@lid`,
      phoneNumber: pn
    }).catch((error) => {
      console.error("[CONTACTS] Failed to persist lid mapping:", error);
    });
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

    console.log(
      `[WHATSAPP] connection.update session=${id} connection=${connection || "unknown"} statusCode=${statusCode ?? "none"} hasQr=${Boolean(qr)}`
    );

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          margin: 2,
          width: 400,
          color: { dark: "#000000", light: "#ffffff" }
        });

        updateSession(id, {
          status: "qr_ready",
          qrCode: qrDataUrl,
          error: undefined
        });
      } catch {
        updateSession(id, {
          status: "qr_ready",
          qrCode: undefined,
          error: undefined
        });
      }
    }

    if (connection === "close") {
      const terminalDisconnects = [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.forbidden,
        DisconnectReason.multideviceMismatch
      ];
      const shouldReconnect =
        statusCode !== undefined &&
        !terminalDisconnects.includes(statusCode) &&
        statusCode !== DisconnectReason.timedOut;

      // If the connection dropped while we were waiting for the QR to be scanned,
      // the signal keys may be corrupted (MessageCounterError / handshake failure).
      // Auto-reconnecting with the same stale state causes an infinite bad-QR loop.
      // Instead, wipe auth state and surface an error so the user retries cleanly.
      const wasAwaitingQrScan = sessionConfigs.get(id)?.status === "qr_ready";

      activeSockets.delete(id);

      if (shouldReconnect && !wasAwaitingQrScan) {
        const attempts = reconnectAttempts.get(id) || 0;

        if (attempts < maxReconnectAttempts) {
          reconnectAttempts.set(id, attempts + 1);
          updateSession(id, {
            status: "connecting",
            qrCode: undefined,
            error: undefined
          });

          setTimeout(() => {
            void startSessionConnection(id).catch((error) => {
          updateSession(id, {
            status: "error",
            qrCode: undefined,
            error:
              error instanceof Error
                    ? error.message
                    : "Failed to reconnect WhatsApp."
              });
            });
          }, 1500 * (attempts + 1));
          return;
        }
      }

      if (wasAwaitingQrScan) {
        await deleteSavedAuthState(id).catch(() => null);
        updateSession(id, {
          status: "error",
          qrCode: undefined,
          error: "QR scan failed or timed out. Click 'Connect' to try again."
        });
        return;
      }

      if (terminalDisconnects.includes(statusCode as number)) {
        await deleteSavedAuthState(id);
      }

      if (statusCode === DisconnectReason.loggedOut) {
        updateSession(id, {
          status: "disconnected",
          qrCode: undefined,
          error: getDisconnectMessage(statusCode, DisconnectReason)
        });
        return;
      }

      updateSession(id, {
        status: "error",
        qrCode: undefined,
        error: getDisconnectMessage(statusCode, DisconnectReason)
      });
      console.error(
        `[WHATSAPP] session=${id} connection closed with status=${statusCode ?? "unknown"} message="${getDisconnectMessage(statusCode, DisconnectReason)}"`
      );
      return;
    }

    if (connection === "open") {
      const user = sock.user;
      const connectedPhone = getConnectedPhoneDigits(user?.id);
      const expectedPhone = getExpectedPhoneDigits(session);

      if (connectedPhone && expectedPhone && connectedPhone !== expectedPhone) {
        const message = `Connected number +${connectedPhone} does not match the expected number +${expectedPhone}.`;

        try {
          await sock.logout();
        } catch {
          try {
            sock.end(new Error(message));
          } catch {
            // Ignore shutdown errors after a rejected scan.
          }
        }

        activeSockets.delete(id);
        await deleteSavedAuthState(id);
        updateSession(id, {
          status: "error",
          qrCode: undefined,
          connectedPhone,
          connectedName: user?.name || session.name,
          device: "Linked Device",
          error: `${message} Scan the QR with the phone number entered in this session.`
        });
        return;
      }

      // Successful connection — reset counters
      reconnectAttempts.delete(id);
      resumeSessionPromises.delete(id);
      updateSession(id, {
        status: "connected",
        qrCode: undefined,
        connectedPhone: connectedPhone || session.phone,
        connectedName: user?.name || session.name,
        device: "Linked Device",
        error: undefined
      });
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    if (upsert.type !== "notify" && upsert.type !== "append") {
      return;
    }

    logMessageDebug(
      `[WHATSAPP] messages.upsert session=${id} type=${upsert.type} count=${upsert.messages.length}`
    );

    for (const message of upsert.messages) {
      const remoteJid = message.key?.remoteJid;

      if (!isDirectChatJid(remoteJid)) {
        logMessageDebug(
          `[WHATSAPP] Ignored non-direct message session=${id} remoteJid=${remoteJid || "unknown"} id=${message.key?.id || "unknown"}`
        );
        continue;
      }

      if (!shouldProcessMessageUpsert(upsert.type, message)) {
        logMessageDebug(
          `[WHATSAPP] Ignored replay/history message session=${id} type=${upsert.type} fromMe=${Boolean(message.key?.fromMe)} id=${message.key?.id || "unknown"}`
        );
        continue;
      }

      await handleMessageEvent(id, message);
    }
  });

  // ── messages.update — edits and deletes ──
  sock.ev.on("messages.update", async (updates) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    for (const update of updates) {
      if (!update.key?.remoteJid) continue;
      const eventType = update.update?.message?.protocolMessage?.type === 0
        ? "message.deleted"
        : "message.edited";
      await queueWebhookDelivery(id, session.webhookUrl, {
        event: eventType,
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          remoteJid: update.key.remoteJid,
          messageId: update.key.id,
          fromMe: Boolean(update.key.fromMe),
          update: update.update
        }
      }, 3, { secret: session.webhookSecret, userId: session.userId });
    }
  });

  // ── message-receipt.update — delivery/read receipts ──
  sock.ev.on("message-receipt.update", async (updates) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    for (const update of updates) {
      if (!update.key?.remoteJid) continue;
      await queueWebhookDelivery(id, session.webhookUrl, {
        event: "message.receipt",
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          remoteJid: update.key.remoteJid,
          messageId: update.key.id,
          fromMe: Boolean(update.key.fromMe),
          receipt: update.receipt
        }
      }, 2, { secret: session.webhookSecret, userId: session.userId });
    }
  });

  // ── call events ──
  sock.ev.on("call", async (calls) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    for (const call of calls) {
      await queueWebhookDelivery(id, session.webhookUrl, {
        event: "call.incoming",
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          callId: call.id,
          from: call.from,
          status: call.status,
          isVideo: call.isVideo,
          isGroup: call.isGroup
        }
      }, 2, { secret: session.webhookSecret, userId: session.userId });
    }
  });

  // ── group participant updates ──
  sock.ev.on("group-participants.update", async (update) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    await queueWebhookDelivery(id, session.webhookUrl, {
      event: "group.participants.update",
      timestamp: Date.now(),
      data: {
        sessionId: id,
        sessionName: session.name,
        groupId: update.id,
        participants: update.participants,
        action: update.action
      }
    }, 2, { secret: session.webhookSecret, userId: session.userId });
  });

  // ── group metadata updates ──
  sock.ev.on("groups.update", async (updates) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    for (const update of updates) {
      await queueWebhookDelivery(id, session.webhookUrl, {
        event: "group.update",
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          groupId: update.id,
          update
        }
      }, 2, { secret: session.webhookSecret, userId: session.userId });
    }
  });

  // ── contacts update ──
  sock.ev.on("contacts.update", async (updates) => {
    const session = sessionConfigs.get(id);
    if (!session?.webhookUrl) return;
    for (const contact of updates) {
      if (!contact.id) continue;
      await queueWebhookDelivery(id, session.webhookUrl, {
        event: "contact.update",
        timestamp: Date.now(),
        data: {
          sessionId: id,
          sessionName: session.name,
          contactId: contact.id,
          contact
        }
      }, 2, { secret: session.webhookSecret, userId: session.userId });
    }
  });
}

async function handleMessageEvent(
  sessionId: string,
  message: proto.IWebMessageInfo
): Promise<void> {
  const session = sessionConfigs.get(sessionId);
  if (!session) {
    return;
  }

  const externalMessageId = message.key?.id || "";
  const dedupeKey = `${sessionId}:${message.key?.fromMe ? "out" : "in"}:${externalMessageId}`;

  if (externalMessageId && processedMessageIds.has(dedupeKey)) {
    return;
  }

  if (externalMessageId) {
    processedMessageIds.add(dedupeKey);

    if (processedMessageIds.size > 1000) {
      processedMessageIds.clear();
    }
  }

  const remoteJid = message.key?.remoteJid || "";
  const remotePhone = getJidUser(remoteJid);
  const connectedPhone = session.connectedPhone || getExpectedPhoneDigits(session);
  const direction = message.key?.fromMe ? "outbound" : "inbound";
  const event = message.key?.fromMe ? "message.sent" : "message.received";
  const from = message.key?.fromMe ? connectedPhone : remotePhone;
  const to = message.key?.fromMe ? remotePhone : connectedPhone;
  const content = unwrapMessageContent(message.message);
  const text =
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    "";

  const messageType = getMessageType(content);
  const timestamp = getMessageTimestampMs(message);
  await rememberSessionContactProfile({
    sessionId: session.id,
    remoteJid,
    displayName: message.pushName || undefined,
    phoneNumber: remotePhone,
    lastMessageAt: timestamp
  });

  const inserted = await insertMessageRecord({
    sessionId: session.id,
    userId: session.userId,
    direction,
    remoteJid,
    contactName: message.pushName || undefined,
    contactPhone: remotePhone,
    body: text,
    messageType,
    status: direction === "inbound" ? "received" : "sent",
    externalMessageId,
    messageTimestamp: timestamp
  });

  if (!inserted) {
    logMessageDebug(
      `[WHATSAPP] Skipped duplicate persisted message session=${sessionId} id=${externalMessageId || "unknown"}`
    );
    return;
  }

  console.log(`[WHATSAPP] ${event} session=${sessionId} from=${from} to=${to}`);

  if (!session.webhookUrl) {
    console.warn(`[WEBHOOK] No webhook URL configured for session ${sessionId}`);
    return;
  }

  const payload = {
    event,
    timestamp,
    data: {
      sessionId,
      sessionName: session.name,
      direction,
      remoteJid,
      replyTarget: remoteJid,
      fromMe: Boolean(message.key?.fromMe),
      pushName: message.pushName || undefined,
      message: {
        id: externalMessageId,
        from,
        to,
        type: messageType,
        text,
        timestamp,
        raw: content || message.message
      }
    }
  };

  await queueWebhookDelivery(sessionId, session.webhookUrl, payload, 3, {
    secret: session.webhookSecret,
    userId: session.userId
  });
}

function getMessageType(content?: proto.IMessage): string {
  if (content?.conversation) return "text";
  if (content?.extendedTextMessage) return "text";
  if (content?.imageMessage) return "image";
  if (content?.videoMessage) return "video";
  if (content?.audioMessage) return "audio";
  if (content?.documentMessage) return "document";
  if (content?.contactMessage || content?.contactsArrayMessage) return "contact";
  if (content?.locationMessage || content?.liveLocationMessage) return "location";
  if (content?.stickerMessage) return "sticker";
  if (content?.reactionMessage) return "reaction";
  if (
    content?.pollCreationMessage ||
    content?.pollCreationMessageV2 ||
    content?.pollCreationMessageV3
  ) {
    return "poll";
  }
  return "unknown";
}

export async function disconnectSession(id: string): Promise<void> {
  await hydrateSessions();
  await resolveSessionFromCacheOrDb(id);

  const socket = activeSockets.get(id);
  if (socket) {
    try {
      await socket.logout();
    } catch {
      // Ignore logout errors during disconnect.
    }
    activeSockets.delete(id);
  }

  updateSession(id, {
    status: "disconnected",
    qrCode: undefined,
    error: undefined
  });
}

export function getSocket(id: string): WASocket | undefined {
  return activeSockets.get(id);
}
