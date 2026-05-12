"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { resolvePublicBaseUrl } from "@/lib/platform/base-url";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquare,
  Phone,
  QrCode,
  RefreshCcw,
  ScanLine,
  Send,
  ShieldCheck,
  Trash2,
  Timer,
  User,
  Webhook,
  Zap
} from "lucide-react";

interface SessionDetail {
  id: string;
  name: string;
  status: string;
  countryCode: string;
  phone: string;
  connectedPhone?: string;
  connectedName?: string;
  device?: string;
  webhookUrl?: string;
  apiKeyPrefix?: string;
  error?: string;
  accessMode?: string;
  accessActive?: boolean;
  createdAt: number;
}

interface ConversationSummary {
  remoteJid: string;
  contactName: string;
  contactPhone: string;
  avatarInitials: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
  lastTimestamp: string;
  messageCount: number;
}

interface SessionMessage {
  id: string;
  remoteJid: string;
  direction: "inbound" | "outbound";
  body: string;
  displayBody: string;
  status: string;
  messageType: string;
  createdAt: string;
  mediaMime?: string | null;
  mediaUrl?: string | null;
  externalMessageId?: string | null;
  contactName: string;
  contactPhone: string;
  avatarInitials: string;
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string>("");
  const [testNumber, setTestNumber] = useState("");
  const [testMessage, setTestMessage] = useState("Hello! This is a test message.");
  const [sendResult, setSendResult] = useState("");
  const [webhookFeedback, setWebhookFeedback] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDirty, setWebhookDirty] = useState(false);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [apiKeyFeedback, setApiKeyFeedback] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationMessages, setConversationMessages] = useState<SessionMessage[]>([]);
  const [selectedRemoteJid, setSelectedRemoteJid] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageFeedback, setMessageFeedback] = useState("");
  const [appBaseUrl, setAppBaseUrl] = useState(process.env.NEXT_PUBLIC_APP_URL || "");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("");
  const [qrCountdown, setQrCountdown] = useState(20);
  const webhookDirtyRef = useRef(false);
  const prevQrCodeRef = useRef<string | null>(null);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);
  const qrCountdownRef = useRef<NodeJS.Timeout | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.remoteJid === selectedRemoteJid) || null;
  const persistedWebhookUrl = session?.webhookUrl || "";
  const hasSavedWebhook = persistedWebhookUrl.trim().length > 0;
  const hasUnsavedWebhookChanges = webhookDirty || webhookUrl !== persistedWebhookUrl;

  useEffect(() => {
    params.then(({ id }) => setId(id));
  }, [params]);

  useEffect(() => {
    let cancelled = false;

    async function loadPublicBaseUrl() {
      try {
        const res = await fetch("/api/public-base-url", { cache: "no-store" });
        const data = await res.json();

        if (!cancelled && typeof data?.baseUrl === "string" && data.baseUrl.trim()) {
          setAppBaseUrl(data.baseUrl.trim());
          return;
        }
      } catch {
        // Fall back below.
      }

      if (!cancelled && typeof window !== "undefined") {
        setAppBaseUrl(window.location.origin);
      }
    }

    void loadPublicBaseUrl();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/status`, {
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        if (!webhookDirtyRef.current) {
          setWebhookUrl(data.webhookUrl || "");
          setWebhookDirty(false);
        }
        setApiKeyPrefix(data.apiKeyPrefix || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [id, fetchSession]);

  const fetchMessages = useCallback(
    async (remoteJid?: string | null, silent: boolean = false) => {
      if (!id) {
        return;
      }

      if (!silent) {
        setMessagesLoading(true);
      }

      try {
        const query = remoteJid
          ? `?remoteJid=${encodeURIComponent(remoteJid)}`
          : "";
        const res = await fetch(`/api/whatsapp/sessions/${id}/messages${query}`, {
          cache: "no-store"
        });
        const data = await res.json();

        if (!res.ok) {
          setMessageFeedback(`Error: ${data.error || "Failed to load messages."}`);
          return;
        }

        setConversations(data.conversations || []);
        setConversationMessages(data.messages || []);
        setSelectedRemoteJid(data.selectedRemoteJid || null);
        setMessageFeedback("");
      } catch (error) {
        setMessageFeedback(
          error instanceof Error ? error.message : "Failed to load messages."
        );
      } finally {
        if (!silent) {
          setMessagesLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    if (!id) {
      return;
    }

    void fetchMessages(selectedRemoteJid);
    const interval = setInterval(() => {
      void fetchMessages(selectedRemoteJid, true);
    }, 5000);

    return () => clearInterval(interval);
  }, [id, selectedRemoteJid, fetchMessages]);

  // QR polling just reads the current state and never destroys the socket.
  // Baileys automatically emits new QR codes when old ones expire,
  // so we only need to poll and display what the backend gives us.
  const stopQrPoll = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    if (qrCountdownRef.current) {
      clearInterval(qrCountdownRef.current);
      qrCountdownRef.current = null;
    }
  };

  // Track when the QR code changes to reset the countdown
  const startQrCountdown = () => {
    setQrCountdown(20);
    if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    qrCountdownRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          return 20; // Reset to 20 because Baileys auto-refreshes QR internally.
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startQrPoll = (sessionId: string) => {
    stopQrPoll();
    qrPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/sessions/${sessionId}/qr`, {
          cache: "no-store"
        });
        const data = await res.json();
        if (!res.ok) return;

        // Detect QR code change (Baileys auto-refreshed it)
        if (data.qrCode && data.qrCode !== prevQrCodeRef.current) {
          prevQrCodeRef.current = data.qrCode;
          setQrCountdown(20); // Reset countdown on new QR
        }

        if (data.qrCode) setQrCode(data.qrCode);
        setQrStatus(data.status);

        if (data.status === "connected") {
          stopQrPoll();
          setQrCode(null);
          setQrStatus("");
          prevQrCodeRef.current = null;
          await fetchSession();
        }
        if (data.status === "error") {
          stopQrPoll();
          setQrStatus("error");
          prevQrCodeRef.current = null;
        }
      } catch { /* stay quiet */ }
    }, 2000);
  };

  useEffect(() => () => stopQrPoll(), []);

  const startQrConnect = async () => {
    if (!id) return;
    setActionLoading("qr");
    setQrCode(null);
    setQrStatus("connecting");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/qr`, { method: "POST" });
      if (res.ok) {
        startQrPoll(id);
        startQrCountdown();
      } else {
        const d = await res.json();
        setSendResult(`Error: ${d.error}`);
        setQrStatus("");
      }
    } catch (e) {
      setSendResult(e instanceof Error ? e.message : "Failed to start QR");
      setQrStatus("");
    } finally {
      setActionLoading("");
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect this session? You will need to scan QR again to reconnect.")) return;
    setActionLoading("disconnect");
    try {
      await fetch(`/api/whatsapp/sessions/${id}/disconnect`, { method: "POST" });
      stopQrPoll();
      setQrCode(null);
      setQrStatus("");
      await fetchSession();
    } catch { /* ignore */ }
    finally { setActionLoading(""); }
  };

  const deleteSession = async () => {
    if (
      !confirm(
        "Permanently delete this WhatsApp number? This removes the session, QR login, webhook settings, API key, and stored history."
      )
    ) {
      return;
    }

    setActionLoading("delete");
    setSendResult("");

    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSendResult(`Error: ${data.error || "Failed to permanently delete this session."}`);
        return;
      }

      stopQrPoll();
      setQrCode(null);
      setQrStatus("");
      router.push("/app");
      router.refresh();
    } catch (err) {
      setSendResult(
        err instanceof Error ? err.message : "Failed to permanently delete this session."
      );
    } finally {
      setActionLoading("");
    }
  };

  const sendTest = async () => {
    if (!testNumber || !testMessage) return;
    if (!workspaceAccessActive) {
      setSendResult("Your trial ended. Start a subscription to send new messages again.");
      return;
    }
    setActionLoading("send");
    setSendResult("");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testNumber, message: testMessage })
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult(`Sent successfully. Message ID: ${data.messageId}`);
      } else {
        setSendResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setActionLoading("");
      setTimeout(() => setSendResult(""), 6000);
    }
  };

  const sendConversationMessage = async () => {
    if (!selectedRemoteJid) {
      setMessageFeedback("Select a conversation first.");
      return;
    }

    if (!workspaceAccessActive) {
      setMessageFeedback("Your trial ended. Start a subscription to send replies again.");
      return;
    }

    if (!messageDraft.trim()) {
      return;
    }

    setActionLoading("conversation-send");
    setMessageFeedback("");

    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteJid: selectedRemoteJid,
          text: messageDraft.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setMessageFeedback(`Error: ${data.error || "Failed to send message."}`);
        return;
      }

      const nextMessage = messageDraft.trim();
      setMessageDraft("");
      setMessageFeedback(
        `Sent to ${activeConversation?.contactName || activeConversation?.contactPhone || "contact"}.`
      );
      setConversationMessages((current) => [
        ...current,
        {
          id: `optimistic-${Date.now()}`,
          remoteJid: selectedRemoteJid,
          direction: "outbound",
          body: nextMessage,
          displayBody: nextMessage,
          status: "sending",
          messageType: "text",
          createdAt: new Date().toISOString(),
          mediaMime: null,
          mediaUrl: null,
          externalMessageId: null,
          contactName: activeConversation?.contactName || "WhatsApp contact",
          contactPhone: activeConversation?.contactPhone || "",
          avatarInitials: activeConversation?.avatarInitials || "W"
        }
      ]);
      await fetchMessages(selectedRemoteJid, true);
    } catch (error) {
      setMessageFeedback(
        error instanceof Error ? error.message : "Failed to send message."
      );
    } finally {
      setActionLoading("");
      setTimeout(() => setMessageFeedback(""), 4000);
    }
  };

  const saveWebhook = async () => {
    setActionLoading("webhook");
    setWebhookFeedback("");
    try {
      const normalizedWebhookUrl = webhookUrl.trim();
      const res = await fetch(`/api/whatsapp/sessions/${id}/webhook`, normalizedWebhookUrl
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ webhookUrl: normalizedWebhookUrl })
          }
        : {
            method: "DELETE"
          });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const nextWebhookUrl =
          typeof data.webhookUrl === "string" ? data.webhookUrl : normalizedWebhookUrl;
        setSession((current) =>
          current
            ? {
                ...current,
                webhookUrl: nextWebhookUrl || undefined
              }
            : current
        );
        webhookDirtyRef.current = false;
        setWebhookDirty(false);
        setWebhookUrl(nextWebhookUrl);
        setWebhookFeedback(normalizedWebhookUrl ? "Webhook saved." : "Webhook removed.");
      } else {
        setWebhookFeedback(`Error: ${data.error || "Failed to update webhook."}`);
      }
    } catch (err) {
      setWebhookFeedback(
        err instanceof Error ? err.message : "Failed to update webhook"
      );
    } finally {
      setActionLoading("");
      setTimeout(() => setWebhookFeedback(""), 3000);
    }
  };

  const removeWebhook = async () => {
    if (!hasSavedWebhook && !webhookUrl.trim()) {
      return;
    }

    setActionLoading("webhook-remove");
    setWebhookFeedback("");

    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/webhook`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setWebhookFeedback(`Error: ${data.error || "Failed to remove webhook."}`);
        return;
      }

      setSession((current) =>
        current
          ? {
              ...current,
              webhookUrl: undefined
            }
          : current
      );
      webhookDirtyRef.current = false;
      setWebhookDirty(false);
      setWebhookUrl("");
      setWebhookFeedback("Webhook removed.");
    } catch (err) {
      setWebhookFeedback(
        err instanceof Error ? err.message : "Failed to remove webhook"
      );
    } finally {
      setActionLoading("");
      setTimeout(() => setWebhookFeedback(""), 3000);
    }
  };

  const testWebhook = async () => {
    setActionLoading("webhook-test");
    setWebhookFeedback("");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/webhook/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setWebhookFeedback(`Test queued. Delivery ID: ${data.deliveryId}`);
      } else {
        setWebhookFeedback(`Error: ${data.error}`);
      }
    } catch (err) {
      setWebhookFeedback(
        err instanceof Error ? err.message : "Failed to test webhook"
      );
    } finally {
      setActionLoading("");
      setTimeout(() => setWebhookFeedback(""), 5000);
    }
  };

  const generateApiKey = async () => {
    if (
      apiKeyPrefix &&
      !confirm(
        "Generate a brand new API key for this session? Existing automations will stop working until you update them with the new key."
      )
    ) {
      return;
    }

    setActionLoading("api-key");
    setApiKeyFeedback("");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/api-key`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setApiKeyFeedback(`Error: ${data.error}`); return; }
      setRevealedApiKey(data.token);
      setApiKeyPrefix(data.prefix);
      setApiKeyFeedback("Copy your key now. It will not be shown again.");
    } catch (err) {
      setApiKeyFeedback(err instanceof Error ? err.message : "Failed to generate API key");
    } finally { setActionLoading(""); }
  };

  const revokeApiKey = async () => {
    if (!confirm("Revoke this API key? Active integrations will stop immediately.")) return;
    setActionLoading("api-key-revoke");
    try {
      const res = await fetch(`/api/whatsapp/sessions/${id}/api-key`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setApiKeyFeedback(`Error: ${data.error}`); return; }
      setRevealedApiKey(null);
      setApiKeyPrefix(null);
      setApiKeyFeedback("API key revoked.");
    } catch (err) {
      setApiKeyFeedback(err instanceof Error ? err.message : "Failed to revoke");
    } finally { setActionLoading(""); }
  };

  const copyApiKey = async () => {
    if (!revealedApiKey) {
      setApiKeyFeedback(
        apiKeyPrefix
          ? "Generate a new key to reveal and copy it. Only the hash of the current key is stored."
          : "Generate an API key first."
      );
      setTimeout(() => setApiKeyFeedback(""), 3500);
      return;
    }

    await navigator.clipboard.writeText(revealedApiKey);
    setApiKeyFeedback("Copied to clipboard.");
    setTimeout(() => setApiKeyFeedback(""), 2500);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Session not found.</p>
        </div>
      </div>
    );
  }

  const isConnected = session.status === "connected";
  const isConnecting = session.status === "connecting" || session.status === "qr_ready";
  const needsReconnect = session.status === "error" || session.status === "disconnected";
  const workspaceAccessActive = session.accessActive !== false;
  const resolvedBaseUrl = resolvePublicBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    appBaseUrl
  );
  const apiKeyExample = revealedApiKey || `${apiKeyPrefix || "wfk_live_xxxxxxxx"}...`;
  const replyTargetExample = selectedRemoteJid || "135558311481405@lid";
  const canSendConversationMessage =
    actionLoading !== "conversation-send" && workspaceAccessActive && Boolean(messageDraft.trim());
  const canSendOutboundTest =
    actionLoading !== "send" &&
    workspaceAccessActive &&
    Boolean(testNumber.trim()) &&
    Boolean(testMessage.trim());
  const sendMessageCurl = `curl -X POST ${resolvedBaseUrl}/api/send-message \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"${replyTargetExample}","text":"Hello! We received your message."}'`;
  const sendPresenceCurl = `curl -X POST ${resolvedBaseUrl}/api/send-presence-update \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"${replyTargetExample}","presence":"composing","durationMs":4000}'`;
  const sendTypingCurl = `curl -X POST ${resolvedBaseUrl}/api/send-typing \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"${replyTargetExample}","durationMs":4000}'`;
  const sendSeenCurl = `curl -X POST ${resolvedBaseUrl}/api/send-seen \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"${replyTargetExample}","messageId":"WEBHOOK_MESSAGE_ID"}'`;
  const contactLookupCurl = `curl -X GET ${resolvedBaseUrl}/api/contacts/${activeConversation?.contactPhone || "8801712345678"} \\
  -H "Authorization: Bearer ${apiKeyExample}"`;
  const checkNumberCurl = `curl -X GET ${resolvedBaseUrl}/api/check-number/8801712345678 \\
  -H "Authorization: Bearer ${apiKeyExample}"`;
  const webhookReplyCurl = `curl -X POST ${resolvedBaseUrl}/api/send-message \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"{{ $json.body.data.replyTarget || $json.body.data.remoteJid }}","text":"Hello! We received your message."}'`;
  const webhookSeenCurl = `curl -X POST ${resolvedBaseUrl}/api/send-seen \\
  -H "Authorization: Bearer ${apiKeyExample}" \\
  -H "Content-Type: application/json" \\
  -d '{"remoteJid":"{{ $json.body.data.replyTarget || $json.body.data.remoteJid }}","messageId":"{{ $json.body.data.message.id }}"}'`;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Back nav */}
      <Link href="/app" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground/70 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      {/* Header card */}
      <section className="rounded-2xl border border-border bg-card p-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className={`relative flex h-2.5 w-2.5`}>
                {isConnected && (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </>
                )}
                {isConnecting && (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                  </>
                )}
                {needsReconnect && (
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
                )}
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                {session.status}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em] text-foreground">{session.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {session.connectedPhone ? `+${session.connectedPhone}` : session.phone}
              {session.device && <span className="ml-2 text-xs text-muted-foreground/60">- {session.device}</span>}
            </p>
            {session.error && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 border border-red-500/15">
                <AlertTriangle className="h-3.5 w-3.5" />
                {session.error}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {workspaceAccessActive && (needsReconnect || !isConnected) && !isConnecting && !qrCode && (
              <button
                onClick={startQrConnect}
                disabled={actionLoading === "qr"}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_24px_rgba(52,211,153,0.3)] disabled:opacity-50"
              >
                {actionLoading === "qr" ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {actionLoading === "qr" ? "Generating QR..." : "Connect via QR"}
              </button>
            )}
            {isConnected && (
              <button
                onClick={disconnect}
                disabled={actionLoading === "disconnect"}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {actionLoading === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Disconnect
              </button>
            )}
            <button
              onClick={deleteSession}
              disabled={actionLoading === "delete"}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {actionLoading === "delete" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete forever
            </button>
            <button
              onClick={fetchSession}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Status", session.status],
            ["Connected as", session.connectedName || "Not available"],
            ["Number", session.connectedPhone ? `+${session.connectedPhone}` : session.phone],
            ["Created", new Date(session.createdAt).toLocaleDateString()]
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-border bg-card px-4 py-3.5">
              <p className="text-[11px] text-muted-foreground/70">{label}</p>
              <p className="mt-1.5 text-sm font-semibold text-foreground truncate">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["#session-webhook", "Webhook"],
            ["#session-messaging", "Messaging"],
            ["#session-docs", "Docs"],
            ["#session-api-key", "API key"]
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="focus-ring rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Send message", `${resolvedBaseUrl}/api/send-message`],
            ["Presence update", `${resolvedBaseUrl}/api/send-presence-update`],
            ["Typing animation", `${resolvedBaseUrl}/api/send-typing`],
            ["Seen animation", `${resolvedBaseUrl}/api/send-seen`],
            ["Contacts", `${resolvedBaseUrl}/api/contacts`],
            ["Session status", `${resolvedBaseUrl}/api/status`]
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-muted/50 px-4 py-3.5"
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
              <p className="mt-2 break-all text-sm font-medium text-emerald-400/85">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* QR reconnect panel */}
      {(qrCode || qrStatus === "connecting") && (
        <section className="rounded-2xl border border-emerald-400/15 bg-gradient-to-b from-emerald-400/[0.04] to-transparent p-7 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-6">
            <QrCode className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-foreground">Scan QR to connect</h2>
            <span className="ml-auto flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              {qrStatus === "connected" ? "Connected" : qrStatus === "error" ? "Error" : "Waiting for scan"}
            </span>
          </div>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="relative">
              {/* Pulse ring behind QR */}
              <div className="absolute inset-0 rounded-2xl bg-emerald-400/5 pulse-ring" />
              <div className="relative grid place-items-center rounded-2xl border-2 border-dashed border-emerald-400/20 bg-muted/50 p-5">
                {qrCode ? (
                  <Image src={qrCode} alt="QR code" width={220} height={220} className="rounded-xl" unoptimized />
                ) : (
                  <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                    <p className="text-sm text-muted-foreground/70">Generating…</p>
                  </div>
                )}
              </div>
              {/* Countdown badge */}
              {qrCode && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-3.5 py-1 text-xs font-semibold text-black shadow-[0_0_16px_rgba(52,211,153,0.3)]">
                  <Timer className="h-3 w-3" />
                  Auto-refresh in {qrCountdown}s
                </div>
              )}
            </div>
            <div className="space-y-4 text-sm">
              <p className="font-semibold text-foreground">How to connect</p>
              <ol className="list-decimal space-y-2 pl-4 leading-7 text-muted-foreground">
                <li>Open WhatsApp on your phone</li>
                <li>Go to <span className="text-muted-foreground font-medium">Settings → Linked Devices</span></li>
                <li>Tap the <span className="text-muted-foreground font-medium">Link a Device</span> button</li>
                <li>Point camera at the QR code</li>
              </ol>
              <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200/60">
                <strong className="text-amber-300/80">Tip:</strong> QR codes expire every ~20 seconds. The code auto-refreshes, but you can also manually refresh if needed.
              </div>
              <button
                onClick={startQrConnect}
                className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm font-medium"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refresh QR now
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Webhook */}
        <section id="session-webhook" className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3 mb-6">
            <Webhook className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-foreground">Webhook</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground/70">Endpoint URL (POST)</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => {
                    webhookDirtyRef.current = true;
                    setWebhookDirty(true);
                    setWebhookUrl(e.target.value);
                  }}
                  placeholder="https://n8n.yourdomain.com/webhook/whatsapp"
                  className="input-field flex-1"
                />
                <button
                  onClick={saveWebhook}
                  disabled={
                    actionLoading === "webhook" ||
                    actionLoading === "webhook-remove" ||
                    !hasUnsavedWebhookChanges
                  }
                  className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)] disabled:opacity-50"
                >
                  {actionLoading === "webhook" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save
                </button>
                <button
                  onClick={removeWebhook}
                  disabled={
                    actionLoading === "webhook" ||
                    actionLoading === "webhook-remove" ||
                    !hasSavedWebhook
                  }
                  className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-foreground/70 transition hover:border-accent/40 hover:text-foreground disabled:opacity-50"
                >
                  {actionLoading === "webhook-remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove
                </button>
              </div>
            </div>

            <button
              onClick={testWebhook}
              disabled={
                actionLoading === "webhook-test" ||
                webhookDirty ||
                !hasSavedWebhook
              }
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-foreground disabled:opacity-50"
            >
              {actionLoading === "webhook-test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Send test event
            </button>

            {webhookFeedback && (
              <p className={`text-xs font-medium ${webhookFeedback.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {webhookFeedback}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-4 flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs leading-5 text-muted-foreground/70">
              Every payload is HMAC-signed and replay-protected by timestamp.
            </p>
          </div>
        </section>

        {/* Account Protection */}
        <section className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-foreground">Account Protection</h2>
          </div>
          <div className="space-y-3">
            {[
              ["Queue pacing", "Enabled", "Outbound traffic spread over time."],
              ["Concurrent sends", "3 workers", "Protects against burst patterns."],
              ["High-risk endpoints", "Capped", "Group metadata checks are rate limited."],
              ["Consent policy", "Required", "Bulk import requires opt-in metadata."]
            ].map(([label, value, detail]) => (
              <div key={label as string} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">{detail}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section id="session-messaging" className="rounded-2xl border border-border bg-card p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-foreground">Messaging</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              See who messaged this number, read the conversation, and reply from the dashboard.
            </p>
          </div>
          <button
            onClick={() => void fetchMessages(selectedRemoteJid)}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh messages
          </button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-border bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-3 border-b border-border px-2 pb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Conversations</p>
                <p className="text-xs text-muted-foreground/70">
                  {conversations.length} active contact{conversations.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {messagesLoading && conversations.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-medium text-foreground">No conversations yet</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground/70">
                  When someone messages this WhatsApp number, their thread will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {conversations.map((conversation) => {
                  const isActive = selectedRemoteJid === conversation.remoteJid;

                  return (
                    <button
                      key={conversation.remoteJid}
                      onClick={() => {
                        setSelectedRemoteJid(conversation.remoteJid);
                        void fetchMessages(conversation.remoteJid, true);
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-emerald-400/30 bg-emerald-400/[0.08]"
                          : "border-border bg-card hover:border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-sm font-semibold text-emerald-300">
                          {conversation.avatarInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {conversation.contactName}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground/70">
                              {new Date(conversation.lastTimestamp).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span className="truncate">{conversation.contactPhone || conversation.remoteJid}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {conversation.lastDirection === "outbound" ? "You: " : ""}
                            {conversation.lastMessage}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-muted/50">
            {activeConversation ? (
              <div className="flex min-h-[34rem] max-h-[calc(100vh-14rem)] flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-sm font-semibold text-emerald-300">
                      {activeConversation.avatarInitials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {activeConversation.contactName}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{activeConversation.contactPhone || activeConversation.remoteJid}</span>
                      </div>
                      {activeConversation.contactName === "WhatsApp contact" && (
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          WhatsApp did not send a profile name for this contact yet.
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {conversationMessages.length} message{conversationMessages.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {conversationMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <div>
                        <p className="text-sm font-medium text-foreground">No saved messages yet</p>
                        <p className="mt-2 text-xs leading-6 text-muted-foreground/70">
                          This contact is selected, but their message history has not been stored yet.
                        </p>
                      </div>
                    </div>
                  ) : (
                    conversationMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.direction === "outbound" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                            message.direction === "outbound"
                              ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-black"
                              : "border border-border bg-muted/30 text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.displayBody}
                          </p>
                          <div
                            className={`mt-2 flex items-center justify-end gap-2 text-[10px] ${
                              message.direction === "outbound"
                                ? "text-black/60"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span>
                              {new Date(message.createdAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit"
                              })}
                            </span>
                            <span className="uppercase tracking-wide">{message.status}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-border bg-muted/50 px-5 py-4">
                  <label className="text-xs font-medium text-muted-foreground/70">
                    Reply from dashboard
                  </label>
                  <textarea
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        void sendConversationMessage();
                      }
                    }}
                    rows={3}
                    placeholder={`Reply to ${activeConversation.contactName}...`}
                    className="input-field mt-2 resize-none"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      className={`text-xs font-medium ${
                        messageFeedback.startsWith("Error")
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {messageFeedback || "Messages sent here are delivered through the connected WhatsApp session."}
                    </p>
                    <button
                      onClick={sendConversationMessage}
                      disabled={!canSendConversationMessage}
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_24px_rgba(52,211,153,0.3)] disabled:opacity-50"
                    >
                      {actionLoading === "conversation-send" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {!workspaceAccessActive
                        ? "Subscription required"
                        : !messageDraft.trim()
                        ? "Write a reply first"
                        : isConnecting
                        ? "Try send now"
                        : needsReconnect
                        ? "Reconnect to send"
                        : "Send reply"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[34rem] flex-col items-center justify-center px-8 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 text-sm font-semibold text-foreground">
                  Select a conversation
                </p>
                <p className="mt-2 max-w-md text-xs leading-6 text-muted-foreground/70">
                  Pick a contact from the left side to see their message history and send a reply from this dashboard.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="session-docs" className="rounded-2xl border border-border bg-card p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-foreground">Session docs</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              These are the production-ready `curl` examples for this connected number. Use the
              session API key as the Bearer token and the contact `remoteJid` from your webhook.
            </p>
          </div>
          <Link
            href="/docs"
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
          >
            Full docs
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Base URL", resolvedBaseUrl],
            ["Authorization", `Bearer ${apiKeyExample}`],
            ["Reply target", selectedRemoteJid || "Use data.replyTarget or data.remoteJid from your webhook"]
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-muted/50 px-4 py-3.5"
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
              <p className="mt-2 break-all text-sm font-medium text-foreground/75">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {[
            {
              title: "Presence update",
              body: "Use a generic presence signal for typing, recording, paused, or available state.",
              snippet: sendPresenceCurl
            },
            {
              title: "Typing animation",
              body: "Show WhatsApp typing for a few seconds before the text reply goes out.",
              snippet: sendTypingCurl
            },
            {
              title: "Send a message",
              body: "Send a direct text reply to the currently selected contact.",
              snippet: sendMessageCurl
            },
            {
              title: "Seen animation",
              body: "Mark the latest inbound message as seen by passing the webhook message id.",
              snippet: sendSeenCurl
            },
            {
              title: "Reply from webhook",
              body: "When a webhook fires, pass `replyTarget` or `remoteJid` straight back into the send API.",
              snippet: webhookReplyCurl
            },
            {
              title: "Contact lookup",
              body: "Resolve one synced contact by phone number and fetch their current JID or LID mapping.",
              snippet: contactLookupCurl
            },
            {
              title: "Check WhatsApp number",
              body: "Check whether a phone number is registered on WhatsApp before you send a fresh outbound message.",
              snippet: checkNumberCurl
            }
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-border bg-muted/50 p-4"
            >
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-emerald-400/80">
                {item.snippet}
              </pre>
            </article>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-sm font-semibold text-foreground">n8n webhook-ready seen receipt</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Use the same webhook payload data to trigger a seen receipt. Copy this directly into an
            HTTP Request node after your automation finishes.
          </p>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-emerald-400/80">
            {webhookSeenCurl}
          </pre>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.72fr]">
        {/* Send test message */}
        <section id="session-api-key" className="rounded-2xl border border-border bg-card p-7">
          <h2 className="text-lg font-semibold text-foreground">Start a new outbound chat</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Send a fresh message to any phone number from this session.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground/70">Recipient phone number</label>
              <input
                type="tel"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="8801712345678"
                className="input-field mt-2"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground/70">Message text</label>
              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                className="input-field mt-2 resize-none"
              />
            </div>
            <button
              onClick={sendTest}
              disabled={!canSendOutboundTest}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_24px_rgba(52,211,153,0.3)] disabled:opacity-50"
            >
              {actionLoading === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {!workspaceAccessActive
                ? "Subscription required"
                : !testNumber.trim() || !testMessage.trim()
                ? "Fill number and message"
                : isConnecting
                ? "Try send now"
                : needsReconnect
                ? "Reconnect to send"
                : "Send message"}
            </button>
            {sendResult && !webhookUrl && (
              <p className={`text-xs font-medium ${sendResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {sendResult}
              </p>
            )}
          </div>

          {/* curl example */}
          <div className="mt-7 rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">HTTP API</p>
              <a href="/docs" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <pre className="overflow-x-auto font-mono text-xs leading-6 text-emerald-400/80 whitespace-pre-wrap break-all">
              {sendMessageCurl}
            </pre>
          </div>
        </section>

        {/* API key */}
        <section className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3 mb-6">
            <KeyRound className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-foreground">Session API key</h2>
          </div>

          <p className="text-sm leading-6 text-muted-foreground mb-5">
            Authenticates the public send endpoint. Only the hash is stored in the database.
          </p>

          <div className="rounded-xl border border-border bg-card p-4 mb-5">
            <p className="font-mono text-sm text-emerald-400 break-all">
              {revealedApiKey || (apiKeyPrefix ? `${apiKeyPrefix}...` : "No key generated yet")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/60">Scope: send-message, session info</p>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={generateApiKey}
              disabled={actionLoading === "api-key"}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)] disabled:opacity-50"
            >
              {actionLoading === "api-key" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {apiKeyPrefix ? "Regenerate key" : "Generate API key"}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={copyApiKey}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:border-accent/40 hover:text-foreground disabled:opacity-50 transition-colors"
              >
                <Copy className="h-4 w-4" /> {revealedApiKey ? "Copy" : "How to copy"}
              </button>
              <button
                onClick={revokeApiKey}
                disabled={!apiKeyPrefix || actionLoading === "api-key-revoke"}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 px-3 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "api-key-revoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Revoke
              </button>
            </div>

            {apiKeyFeedback && (
              <p className={`text-xs font-medium ${apiKeyFeedback.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {apiKeyFeedback}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-4 flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
            <p className="text-xs leading-5 text-amber-200/60">
              Never expose production keys in browser code. Use server-side routes.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
