import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isAuthenticationError,
  requireAuthenticatedUser
} from "@/lib/supabase/auth";
import {
  getBestContactName,
  getPhoneNumberFromJid,
  getSessionContactProfiles,
  resolveSessionPhoneNumber
} from "@/lib/whatsapp/contact-profiles";
import { getSessionById } from "@/lib/whatsapp/supabase-session-manager";

export const runtime = "nodejs";

type MessageRow = {
  id: string;
  remote_jid: string;
  direction: "inbound" | "outbound";
  body: string | null;
  status: string;
  message_type: string | null;
  created_at: string;
  media_mime?: string | null;
  media_url?: string | null;
  external_message_id?: string | null;
};

function toMessagePreview(message: MessageRow): string {
  const body = message.body?.trim();
  if (body) {
    return body;
  }

  return describeMessageBody(message);
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizePhoneDigits(value?: string | null): string {
  return (value || "").replace(/\D/g, "");
}

function describeMessageBody(
  message: Pick<MessageRow, "message_type" | "media_mime" | "direction">
): string {
  const action = message.direction === "outbound" ? "Sent" : "Received";

  switch (message.message_type || "unknown") {
    case "image":
      return `${action} an image`;
    case "video":
      return `${action} a video`;
    case "audio":
      return `${action} an audio message`;
    case "document":
      return `${action} a document`;
    case "contact":
      return `${action} a contact`;
    case "location":
      return `${action} a location`;
    case "sticker":
      return `${action} a sticker`;
    case "reaction":
      return `${action} a reaction`;
    case "poll":
      return `${action} a poll`;
    default:
      if (message.media_mime) {
        return `${action} ${message.media_mime.split("/")[0] || "media"}`;
      }

      return `${action} a WhatsApp item`;
  }
}

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

    const requestUrl = new URL(req.url);
    const requestedRemoteJid = requestUrl.searchParams.get("remoteJid")?.trim() || null;
    const recentLimit = parseBoundedInteger(
      requestUrl.searchParams.get("conversationLimit"),
      300,
      50,
      600
    );
    const threadLimit = parseBoundedInteger(
      requestUrl.searchParams.get("messageLimit"),
      120,
      20,
      200
    );

    const [{ data, error }, contactProfiles] = await Promise.all([
      getSupabaseAdminClient()
        .from("messages")
        .select(
          "id, remote_jid, direction, body, status, message_type, created_at, media_mime, media_url, external_message_id"
        )
        .eq("session_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(recentLimit),
      getSessionContactProfiles(id)
    ]);

    if (error) {
      throw error;
    }

    const recentMessages = ((data || []) as MessageRow[]).filter(
      (message) => message.remote_jid
    );
    const remoteJids = Array.from(new Set(recentMessages.map((message) => message.remote_jid)));
    const resolvedPhones = new Map<string, string>();

    await Promise.all(
      remoteJids.map(async (remoteJid) => {
        resolvedPhones.set(
          remoteJid,
          await resolveSessionPhoneNumber({
            sessionId: id,
            remoteJid,
            fallbackPhoneNumber: contactProfiles[remoteJid]?.phoneNumber || getPhoneNumberFromJid(remoteJid)
          })
        );
      })
    );

    const connectedPhoneDigits = normalizePhoneDigits(
      session.connectedPhone || session.phone
    );
    const conversationMap = new Map<
      string,
      {
        remoteJid: string;
        contactName: string;
        contactPhone: string;
        avatarInitials: string;
        lastMessage: string;
        lastDirection: "inbound" | "outbound";
        lastTimestamp: string;
        messageCount: number;
        hasInbound: boolean;
        isSelfConversation: boolean;
      }
    >();

    for (const message of recentMessages) {
      const remoteJid = message.remote_jid;
      const profile = contactProfiles[remoteJid];
      const resolvedPhone = resolvedPhones.get(remoteJid) || getPhoneNumberFromJid(remoteJid);
      const contactName = getBestContactName({
        displayName: profile?.displayName,
        fallbackPhoneNumber: resolvedPhone
      });
      const isSelfConversation =
        Boolean(connectedPhoneDigits) &&
        normalizePhoneDigits(resolvedPhone) === connectedPhoneDigits;

      const existing = conversationMap.get(remoteJid);
      if (!existing) {
        conversationMap.set(remoteJid, {
          remoteJid,
          contactName,
          contactPhone: resolvedPhone,
          avatarInitials: getInitials(contactName),
          lastMessage: toMessagePreview(message),
          lastDirection: message.direction,
          lastTimestamp: message.created_at,
          messageCount: 1,
          hasInbound: message.direction === "inbound",
          isSelfConversation
        });
        continue;
      }

      existing.messageCount += 1;
      existing.hasInbound = existing.hasInbound || message.direction === "inbound";
      if (!existing.contactPhone && resolvedPhone) {
        existing.contactPhone = resolvedPhone;
      }
      if (existing.contactName === "WhatsApp contact" && profile?.displayName) {
        existing.contactName = profile.displayName;
        existing.avatarInitials = getInitials(profile.displayName);
      }
    }

    const conversations = Array.from(conversationMap.values())
      .filter((conversation) => conversation.hasInbound && !conversation.isSelfConversation)
      .sort(
        (a, b) =>
          new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
      )
      .map(({ hasInbound: _hasInbound, isSelfConversation: _isSelfConversation, ...conversation }) => conversation);

    const selectedRemoteJid =
      conversations.some((conversation) => conversation.remoteJid === requestedRemoteJid)
        ? requestedRemoteJid
        : conversations[0]?.remoteJid || null;

    let threadMessages: MessageRow[] = [];
    if (selectedRemoteJid) {
      const { data: threadData, error: threadError } = await getSupabaseAdminClient()
        .from("messages")
        .select(
          "id, remote_jid, direction, body, status, message_type, created_at, media_mime, media_url, external_message_id"
        )
        .eq("session_id", id)
        .eq("user_id", user.id)
        .eq("remote_jid", selectedRemoteJid)
        .order("created_at", { ascending: false })
        .limit(threadLimit);

      if (threadError) {
        throw threadError;
      }

      threadMessages = ((threadData || []) as MessageRow[]).reverse();
    }

    return NextResponse.json({
      selectedRemoteJid,
      totalConversations: conversations.length,
      conversations,
      messages: threadMessages.map((message) => {
        const profile = contactProfiles[message.remote_jid];
        const contactPhone =
          resolvedPhones.get(message.remote_jid) ||
          profile?.phoneNumber ||
          getPhoneNumberFromJid(message.remote_jid);
        const contactName = getBestContactName({
          displayName: profile?.displayName,
          fallbackPhoneNumber: contactPhone
        });
        const body = message.body?.trim() || "";

        return {
          id: message.id,
          remoteJid: message.remote_jid,
          direction: message.direction,
          body,
          displayBody: body || describeMessageBody(message),
          status: message.status,
          messageType: message.message_type || "text",
          createdAt: message.created_at,
          mediaMime: message.media_mime || null,
          mediaUrl: message.media_url || null,
          externalMessageId: message.external_message_id || null,
          contactName,
          contactPhone,
          avatarInitials: getInitials(contactName)
        };
      }),
      source: "supabase"
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Failed to fetch messages";
    console.error("[API] Error fetching messages:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
