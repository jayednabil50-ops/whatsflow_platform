import { getSocket } from "./supabase-session-manager";
import {
  getPhoneNumberFromJid,
  rememberSessionContactProfile
} from "./contact-profiles";
import { insertMessageRecord } from "./message-store";

const configuredMinDelayMs = Number(process.env.WHATSAPP_SEND_MIN_DELAY_MS || 4500);
const configuredMaxDelayMs = Number(process.env.WHATSAPP_SEND_MAX_DELAY_MS || 12000);
const configuredRollingWindowMs = Number(process.env.WHATSAPP_SEND_WINDOW_MS || 60000);
const configuredMaxMessagesPerWindow = Number(
  process.env.WHATSAPP_SEND_MAX_MESSAGES_PER_WINDOW || 18
);
const configuredTypingDelayMs = Number(process.env.WHATSAPP_TYPING_DELAY_MS || 900);

const minDelayMs = Number.isFinite(configuredMinDelayMs) ? configuredMinDelayMs : 4500;
const maxDelayMs = Number.isFinite(configuredMaxDelayMs) ? configuredMaxDelayMs : 12000;
const rollingWindowMs = Number.isFinite(configuredRollingWindowMs)
  ? configuredRollingWindowMs
  : 60000;
const maxMessagesPerWindow = Number.isFinite(configuredMaxMessagesPerWindow)
  ? configuredMaxMessagesPerWindow
  : 18;
const typingDelayMs = Number.isFinite(configuredTypingDelayMs)
  ? configuredTypingDelayMs
  : 900;

const queueBySession = new Map<string, Promise<unknown>>();
const lastSentAtBySession = new Map<string, number>();
const sentWindowsBySession = new Map<string, number[]>();
const sessionRevisionById = new Map<string, number>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pruneWindow(sessionId: string): number[] {
  const current = sentWindowsBySession.get(sessionId) || [];
  const cutoff = Date.now() - rollingWindowMs;
  const next = current.filter((timestamp) => timestamp >= cutoff);
  sentWindowsBySession.set(sessionId, next);
  return next;
}

function getRecommendedDelay(sessionId: string): number {
  const now = Date.now();
  const timestamps = pruneWindow(sessionId);
  const lastSentAt = lastSentAtBySession.get(sessionId) || 0;
  const jitter = randomBetween(minDelayMs, maxDelayMs);
  const minGapDelay = Math.max(0, jitter - (now - lastSentAt));

  if (timestamps.length < maxMessagesPerWindow) {
    return minGapDelay;
  }

  const oldestAllowed = timestamps[0] || now;
  const rollingWindowDelay =
    Math.max(0, oldestAllowed + rollingWindowMs - now) + randomBetween(2000, 6000);

  return Math.max(minGapDelay, rollingWindowDelay);
}

function enqueueBySession<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = queueBySession.get(sessionId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  queueBySession.set(
    sessionId,
    next.finally(() => {
      if (queueBySession.get(sessionId) === next) {
        queueBySession.delete(sessionId);
      }
    })
  );

  return next;
}

function getSessionRevision(sessionId: string): number {
  return sessionRevisionById.get(sessionId) || 0;
}

function ensureActiveSessionRevision(sessionId: string, revision: number): void {
  if (getSessionRevision(sessionId) !== revision) {
    throw new Error("This WhatsApp session was deleted before the send could finish.");
  }
}

export function clearSessionSendState(sessionId: string): void {
  sessionRevisionById.set(sessionId, getSessionRevision(sessionId) + 1);
  queueBySession.delete(sessionId);
  lastSentAtBySession.delete(sessionId);
  sentWindowsBySession.delete(sessionId);
}

type OutboundMessageBody = Record<string, unknown>;

function buildContactVcard(input: {
  fullName: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${input.fullName}`,
    `TEL;type=CELL;type=VOICE;waid=${input.phoneNumber}:${input.phoneNumber}`
  ];

  if (input.organization) {
    lines.push(`ORG:${input.organization}`);
  }

  if (input.email) {
    lines.push(`EMAIL:${input.email}`);
  }

  if (input.url) {
    lines.push(`URL:${input.url}`);
  }

  lines.push("END:VCARD");
  return lines.join("\n");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeWebpUrl(value: string): boolean {
  try {
    const path = new URL(value).pathname.toLowerCase();
    return path.endsWith(".webp") || path.includes(".webp");
  } catch {
    return value.toLowerCase().includes(".webp");
  }
}

function sanitizeMentions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const mentions = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => resolveTargetJid(item));

  return mentions.length > 0 ? mentions : undefined;
}

function buildOutboundMessageSpec(body: OutboundMessageBody): {
  content: Record<string, unknown>;
  options?: Record<string, unknown>;
  messageType: string;
  bodyPreview: string;
} {
  const rawType =
    typeof body.type === "string" && body.type.trim()
      ? body.type.trim().toLowerCase()
      : null;
  const mentions = sanitizeMentions(body.mentions);
  const quoted =
    body.quoted && typeof body.quoted === "object" ? (body.quoted as Record<string, unknown>) : undefined;
  const options = quoted ? { quoted } : undefined;
  const text =
    typeof body.text === "string"
      ? body.text.trim()
      : typeof body.message === "string"
        ? body.message.trim()
        : "";
  const mediaUrl =
    typeof body.mediaUrl === "string"
      ? body.mediaUrl.trim()
      : typeof body.url === "string"
        ? body.url.trim()
        : "";
  const mediaType =
    typeof body.mediaType === "string"
      ? body.mediaType.trim().toLowerCase()
      : rawType;
  const caption = typeof body.caption === "string" ? body.caption.trim() : text;
  const viewOnce = body.viewOnce === true;

  if (body.poll && typeof body.poll === "object") {
    const poll = body.poll as Record<string, unknown>;
    const values = Array.isArray(poll.options)
      ? poll.options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const pollName =
      typeof poll.name === "string"
        ? poll.name.trim()
        : typeof poll.question === "string"
          ? poll.question.trim()
        : typeof poll.title === "string"
          ? poll.title.trim()
          : text;

    if (!pollName || values.length < 2) {
      throw new Error("Poll messages require a title and at least two options.");
    }

    const selectableCount =
      typeof poll.selectableCount === "number"
        ? Math.max(1, Math.round(poll.selectableCount))
        : poll.multiSelect === true
          ? values.length
          : 1;

    return {
      content: {
        poll: {
          name: pollName,
          values,
          selectableCount
        }
      },
      options,
      messageType: "poll",
      bodyPreview: pollName
    };
  }

  if (body.location && typeof body.location === "object") {
    const location = body.location as Record<string, unknown>;
    const latitude =
      typeof location.latitude === "number"
        ? location.latitude
        : typeof location.degreesLatitude === "number"
          ? location.degreesLatitude
          : null;
    const longitude =
      typeof location.longitude === "number"
        ? location.longitude
        : typeof location.degreesLongitude === "number"
          ? location.degreesLongitude
          : null;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Location messages require latitude and longitude.");
    }

    const name = typeof location.name === "string" ? location.name.trim() : "";
    const address = typeof location.address === "string" ? location.address.trim() : "";

    return {
      content: {
        location: {
          degreesLatitude: latitude,
          degreesLongitude: longitude,
          ...(name ? { name } : {}),
          ...(address ? { address } : {})
        }
      },
      options,
      messageType: "location",
      bodyPreview: name || address || `${latitude},${longitude}`
    };
  }

  if (body.contact && typeof body.contact === "object") {
    const contact = body.contact as Record<string, unknown>;
    const phoneNumber =
      typeof contact.phoneNumber === "string"
        ? contact.phoneNumber.replace(/\D/g, "")
        : Array.isArray(contact.phoneNumbers)
          ? String(contact.phoneNumbers[0] || "").replace(/\D/g, "")
          : "";
    const fullName =
      typeof contact.fullName === "string"
        ? contact.fullName.trim()
        : typeof contact.name === "string"
          ? contact.name.trim()
          : "";

    if (!phoneNumber || !fullName) {
      throw new Error("Contact messages require `contact.fullName` and `contact.phoneNumber`.");
    }

    const vcard = buildContactVcard({
      fullName,
      phoneNumber,
      organization:
        typeof contact.organization === "string" ? contact.organization.trim() : undefined,
      email: typeof contact.email === "string" ? contact.email.trim() : undefined,
      url: typeof contact.url === "string" ? contact.url.trim() : undefined
    });

    return {
      content: {
        contacts: {
          displayName: fullName,
          contacts: [
            {
              displayName: fullName,
              vcard
            }
          ]
        }
      },
      options,
      messageType: "contact",
      bodyPreview: fullName
    };
  }

  if (mediaUrl && mediaType) {
    if (!isValidHttpUrl(mediaUrl)) {
      throw new Error("`mediaUrl` must be a valid http(s) URL.");
    }

    const shared = {
      ...(caption ? { caption } : {}),
      ...(mentions ? { mentions } : {}),
      ...(viewOnce ? { viewOnce: true } : {})
    };

    switch (mediaType) {
      case "image":
        return {
          content: {
            image: { url: mediaUrl },
            ...shared
          },
          options,
          messageType: "image",
          bodyPreview: caption || "Image message"
        };
      case "video":
        return {
          content: {
            video: { url: mediaUrl },
            ...shared
          },
          options,
          messageType: "video",
          bodyPreview: caption || "Video message"
        };
      case "audio": {
        const audioMime =
          typeof body.mimetype === "string" && body.mimetype.trim()
            ? body.mimetype.trim()
            : body.voiceNote === true || body.ptt === true
              ? "audio/ogg; codecs=opus"
              : "audio/mp4";

        return {
          content: {
            audio: { url: mediaUrl },
            mimetype: audioMime,
            ...(body.voiceNote === true || body.ptt === true ? { ptt: true } : {})
          },
          options,
          messageType: "audio",
          bodyPreview: caption || "Audio message"
        };
      }
      case "document":
        return {
          content: {
            document: { url: mediaUrl },
            ...(typeof body.fileName === "string" && body.fileName.trim()
              ? { fileName: body.fileName.trim() }
              : {}),
            ...(typeof body.mimetype === "string" ? { mimetype: body.mimetype } : {}),
            ...shared
          },
          options,
          messageType: "document",
          bodyPreview: caption || "Document message"
        };
      case "sticker": {
        if (!looksLikeWebpUrl(mediaUrl)) {
          throw new Error(
            "Stickers must be WebP format. Provide a `.webp` URL (max 512x512, <100KB recommended)."
          );
        }
        return {
          content: {
            sticker: { url: mediaUrl }
          },
          options,
          messageType: "sticker",
          bodyPreview: "Sticker"
        };
      }
      default:
        throw new Error(
          `Unsupported media type: "${mediaType}". Use image, video, audio, document, or sticker.`
        );
    }
  }

  if (mediaUrl && !mediaType) {
    throw new Error("`mediaType` is required when sending media. Use image, video, audio, document, or sticker.");
  }

  if (!text) {
    throw new Error("Message text is required.");
  }

  return {
    content: {
      text,
      ...(mentions ? { mentions } : {})
    },
    options,
    messageType: "text",
    bodyPreview: text
  };
}

export async function queueOutboundMessage(input: {
  sessionId: string;
  userId: string;
  to: string;
  body: OutboundMessageBody;
}): Promise<{
  jid: string;
  messageId?: string;
  scheduledDelayMs: number;
  messageType: string;
}> {
  const jid = resolveTargetJid(input.to);
  const sessionRevision = getSessionRevision(input.sessionId);
  const spec = buildOutboundMessageSpec(input.body);

  return enqueueBySession(input.sessionId, async () => {
    ensureActiveSessionRevision(input.sessionId, sessionRevision);

    const scheduledDelayMs = getRecommendedDelay(input.sessionId);
    if (scheduledDelayMs > 0) {
      await wait(scheduledDelayMs);
    }

    ensureActiveSessionRevision(input.sessionId, sessionRevision);

    const socket = getSocket(input.sessionId);
    if (!socket) {
      throw new Error("The WhatsApp session is not connected right now.");
    }

    try {
      await socket.waitForSocketOpen();
    } catch {
      throw new Error("The WhatsApp session is still reconnecting. Try again in a moment.");
    }

    try {
      await socket.sendPresenceUpdate("composing", jid);
      await wait(typingDelayMs);
    } catch {
      // Presence is a best-effort signal only.
    }

    ensureActiveSessionRevision(input.sessionId, sessionRevision);
    const result = await socket.sendMessage(
      jid,
      spec.content as any,
      spec.options as any
    );
    const sentAt = Date.now();
    lastSentAtBySession.set(input.sessionId, sentAt);
    sentWindowsBySession.set(input.sessionId, [...pruneWindow(input.sessionId), sentAt]);
    await rememberSessionContactProfile({
      sessionId: input.sessionId,
      remoteJid: jid,
      phoneNumber: getPhoneNumberFromJid(jid),
      lastMessageAt: sentAt
    });

    await insertMessageRecord({
      sessionId: input.sessionId,
      userId: input.userId,
      direction: "outbound",
      remoteJid: jid,
      contactPhone: getPhoneNumberFromJid(jid),
      messageType: spec.messageType,
      body: spec.bodyPreview,
      status: "sent",
      externalMessageId: result?.key?.id || undefined,
      messageTimestamp: sentAt
    });

    return {
      jid,
      messageId: result?.key?.id || undefined,
      scheduledDelayMs,
      messageType: spec.messageType
    };
  });
}

export async function queueTextMessage(input: {
  sessionId: string;
  userId: string;
  to: string;
  text: string;
}): Promise<{
  jid: string;
  messageId?: string;
  scheduledDelayMs: number;
}> {
  const result = await queueOutboundMessage({
    sessionId: input.sessionId,
    userId: input.userId,
    to: input.to,
    body: { text: input.text }
  });

  return {
    jid: result.jid,
    messageId: result.messageId,
    scheduledDelayMs: result.scheduledDelayMs
  };
}

const supportedPresenceTypes = new Set([
  "available",
  "unavailable",
  "composing",
  "recording",
  "paused"
]);

export async function sendPresenceUpdate(input: {
  sessionId: string;
  to: string;
  presence: string;
  durationMs?: number;
}): Promise<{
  jid: string;
  presence: string;
  durationMs: number;
}> {
  const jid = resolveTargetJid(input.to);
  const socket = getSocket(input.sessionId);

  if (!socket) {
    throw new Error("The WhatsApp session is not connected right now.");
  }

  try {
    await socket.waitForSocketOpen();
  } catch {
    throw new Error("The WhatsApp session is still reconnecting. Try again in a moment.");
  }

  const presence = supportedPresenceTypes.has(input.presence)
    ? input.presence
    : "composing";
  const durationMs =
    presence === "composing" || presence === "recording"
      ? clampTypingDuration(input.durationMs)
      : 0;

  await socket.sendPresenceUpdate(presence as any, jid);

  if (durationMs > 0) {
    await wait(durationMs);
    await socket.sendPresenceUpdate("paused", jid);
  }

  return {
    jid,
    presence,
    durationMs
  };
}

export async function sendTypingIndicator(input: {
  sessionId: string;
  to: string;
  durationMs?: number;
}): Promise<{
  jid: string;
  durationMs: number;
}> {
  const result = await sendPresenceUpdate({
    sessionId: input.sessionId,
    to: input.to,
    presence: "composing",
    durationMs: input.durationMs
  });

  return {
    jid: result.jid,
    durationMs: result.durationMs
  };
}

export async function markConversationSeen(input: {
  sessionId: string;
  to: string;
  messageId: string;
  participantJid?: string;
}): Promise<{
  jid: string;
  messageId: string;
}> {
  const jid = resolveTargetJid(input.to);
  const socket = getSocket(input.sessionId);

  if (!socket) {
    throw new Error("The WhatsApp session is not connected right now.");
  }

  try {
    await socket.waitForSocketOpen();
  } catch {
    throw new Error("The WhatsApp session is still reconnecting. Try again in a moment.");
  }

  await socket.readMessages([
    {
      remoteJid: jid,
      fromMe: false,
      id: input.messageId,
      participant: input.participantJid
    }
  ]);

  return {
    jid,
    messageId: input.messageId
  };
}

function clampTypingDuration(value?: number): number {
  const fallback = 4000;

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(15000, Math.max(1000, Math.round(value as number)));
}

function resolveTargetJid(rawTarget: string): string {
  const target = rawTarget.trim();

  if (!target) {
    throw new Error("A target WhatsApp number or JID is required.");
  }

  if (target.includes("@")) {
    return target;
  }

  const digits = target.replace(/\D/g, "");
  if (digits.length < 7) {
    throw new Error("A valid recipient number is required.");
  }

  return `${digits}@s.whatsapp.net`;
}
