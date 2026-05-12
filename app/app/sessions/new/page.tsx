"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe2,
  Link2,
  Loader2,
  MonitorSmartphone,
  Phone,
  QrCode,
  RefreshCcw,
  Save,
  ScanLine,
  Smartphone,
  Trash2,
  User,
  Webhook
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { countries } from "@/lib/countries";
import { readJsonResponse } from "@/lib/http/response";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  countryCode: z.string().min(1, "Select a country"),
  phone: z.string().min(7, "Enter a valid phone number"),
  webhookUrl: z.string().url("Enter a valid URL").optional().or(z.literal(""))
});

type Values = z.infer<typeof schema>;

type SessionStatus =
  | "pending"
  | "qr_ready"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface SessionData {
  id: string;
  name: string;
  countryCode: string;
  phone: string;
  status: SessionStatus;
  qrCode?: string;
  connectedPhone?: string;
  connectedName?: string;
  device?: string;
  webhookUrl?: string;
  error?: string;
}

const payloadExample = {
  event: "message.received",
  timestamp: 1715000000000,
  data: {
    sessionId: "SESSION_ID",
    sessionName: "Support Line",
    message: {
      id: "wamid.HBgM...",
      from: "8801711111111",
      type: "text",
      text: "Hello, is this available?",
      raw: {}
    }
  }
};

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [error, setError] = useState("");
  const [copiedPayload, setCopiedPayload] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      countryCode: "BD",
      phone: "",
      webhookUrl: ""
    }
  });

  const selectedCountry = watch("countryCode");
  const selectedDialCode =
    countries.find((country) => country.code === selectedCountry)?.dialCode || "";

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    setValue("webhookUrl", session.webhookUrl || "");
  }, [session, setValue]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (sessionId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/sessions/${sessionId}/qr`, {
          cache: "no-store"
        });
        const data = await readJsonResponse<SessionData & { error?: string }>(res);

        if (!res.ok) {
          return;
        }

        setSession((prev) => (prev ? { ...prev, ...data } : prev));

        if (data.status === "connected") {
          stopPolling();
          setStep(3);
          setError("");
        }

        if (data.status === "error" || data.status === "disconnected") {
          stopPolling();
          setError(data.error || "Connection failed. Please try again.");
        }
      } catch {
        // Polling should stay quiet and keep trying.
      }
    }, 2500);
  };

  const onSubmit = async (values: Values) => {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/whatsapp/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          countryCode: values.countryCode,
          phone: values.phone,
          webhookUrl: values.webhookUrl || undefined
        })
      });

      const data = await readJsonResponse<SessionData & { error?: string }>(res);

      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }

      setSession(data);
      setStep(2);

      const startRes = await fetch(`/api/whatsapp/sessions/${data.id}/qr`, {
        method: "POST"
      });

      if (!startRes.ok) {
        const startData = await readJsonResponse<{ error?: string }>(startRes);
        setError(startData.error || "Failed to start QR connection");
        return;
      }

      startPolling(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const saveWebhook = async () => {
    if (!session) {
      return;
    }

    const webhookUrl = watch("webhookUrl");
    if (!webhookUrl) {
      setError("Please enter a webhook URL");
      return;
    }

    setWebhookLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/whatsapp/sessions/${session.id}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl })
      });

      if (!res.ok) {
        const data = await readJsonResponse<{ error?: string }>(res);
        setError(data.error || "Failed to save webhook");
        return;
      }

      setWebhookSaved(true);
      setSession((prev) => (prev ? { ...prev, webhookUrl } : prev));
      setTimeout(() => setWebhookSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save webhook");
    } finally {
      setWebhookLoading(false);
    }
  };

  const restartConnection = async () => {
    if (!session) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`/api/whatsapp/sessions/${session.id}/qr`, {
        method: "POST"
      });

      if (!res.ok) {
        const data = await readJsonResponse<{ error?: string }>(res);
        setError(data.error || "Failed to restart connection");
        return;
      }

      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "connecting",
              qrCode: undefined,
              error: undefined
            }
          : prev
      );

      startPolling(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart connection");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSession = async () => {
    if (!session) {
      return;
    }

    if (
      !confirm(
        "Permanently delete this WhatsApp number? This removes the session, QR login, webhook settings, API key, and stored history."
      )
    ) {
      return;
    }

    stopPolling();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/whatsapp/sessions/${session.id}`, {
        method: "DELETE"
      });

      const data = await readJsonResponse<{ error?: string }>(res).catch(
        () => ({ error: "" })
      );

      if (!res.ok) {
        setError(data.error || "Failed to permanently delete this session.");
        return;
      }

      setSession(null);
      setStep(1);
      setValue("webhookUrl", "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to permanently delete this session."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const copyWebhookPayload = async () => {
    if (!session) {
      return;
    }

    const payload = {
      ...payloadExample,
      data: {
        ...payloadExample.data,
        sessionId: session.id,
        sessionName: session.name
      }
    };

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const goToDashboard = () => {
    router.push("/app");
  };

  const statusLabel =
    session?.status === "qr_ready"
      ? "QR ready to scan"
      : session?.status === "connecting"
        ? "Waiting for WhatsApp"
        : session?.status === "connected"
          ? "Connected"
          : "Preparing";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        {[
          ["1", "Details"],
          ["2", "Scan QR"],
          ["3", "Webhook"]
        ].map(([value, label], index) => (
          <div key={value} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
                  step >= Number(value)
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {value}
              </span>
              <span
                className={`text-sm font-medium ${
                  step >= Number(value) ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {index < 2 ? <div className="h-px w-8 bg-border" /> : null}
          </div>
        ))}
      </div>

      {error ? (
        <div className="mb-4 flex gap-3 rounded-md border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            {session && session.status !== "connected" ? (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={restartConnection}
                  className="inline-flex items-center gap-2 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Retry connection
                </button>
                <button
                  onClick={deleteSession}
                  className="inline-flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete session
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="rounded-md border border-border bg-card p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-accent">New WhatsApp session</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Connect a WhatsApp number
            </h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Add the session details first. On the next step we will generate a live QR
              code for WhatsApp Linked Devices.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="name">
                <User className="h-4 w-4 text-muted-foreground" />
                Session name
              </label>
              <input
                {...register("name")}
                id="name"
                placeholder="e.g. Support Line"
                className="input-field mt-2"
              />
              {errors.name ? (
                <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="grid gap-5 md:grid-cols-[200px_1fr]">
              <div>
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  htmlFor="countryCode"
                >
                  <Globe2 className="h-4 w-4 text-muted-foreground" />
                  Country
                </label>
                <select
                  {...register("countryCode")}
                  id="countryCode"
                  className="input-field mt-2"
                  value={selectedCountry}
                  onChange={(event) => setValue("countryCode", event.target.value)}
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {country.name} ({country.dialCode})
                    </option>
                  ))}
                </select>
                {errors.countryCode ? (
                  <p className="mt-1 text-xs text-red-400">{errors.countryCode.message}</p>
                ) : null}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium" htmlFor="phone">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone number
                </label>
                <div className="mt-2 flex rounded-md border border-border bg-background">
                  <span className="inline-flex items-center border-r border-border bg-muted px-3 text-sm text-muted-foreground">
                    {selectedDialCode}
                  </span>
                  <input
                    {...register("phone")}
                    id="phone"
                    type="tel"
                    placeholder="1712345678"
                    className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {errors.phone ? (
                  <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/70 p-4">
              <div className="flex items-start gap-3">
                <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-medium">How to connect</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-6 text-muted-foreground">
                    <li>Fill in your details and create the session.</li>
                    <li>Open WhatsApp on the phone that owns this number.</li>
                    <li>Go to Settings &gt; Linked Devices &gt; Link a Device.</li>
                    <li>Scan the QR code from the next step.</li>
                  </ol>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              {isLoading ? "Creating session..." : "Create session and show QR"}
            </button>
          </form>
        </div>
      ) : null}

      {step === 2 && session ? (
        <div className="rounded-md border border-border bg-card p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-accent">Scan QR code</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Link your WhatsApp</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Scan this QR code with WhatsApp Linked Devices to connect{" "}
              <strong>{session.name}</strong>.
            </p>
          </div>

          <div className="mx-auto max-w-sm">
            <div className="relative grid place-items-center rounded-lg border-2 border-dashed border-border bg-background p-8">
              {session.qrCode ? (
                <Image
                  src={session.qrCode}
                  alt="WhatsApp QR code"
                  width={256}
                  height={256}
                  className="h-64 w-64 rounded-md"
                  unoptimized
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground">Generating QR code...</p>
                </div>
              )}

              {session.qrCode ? (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  <ScanLine className="mr-1 inline-block h-3 w-3" />
                  Scan with WhatsApp
                </div>
              ) : null}
            </div>

            <div className="mt-6 space-y-3 rounded-md border border-border bg-background/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Session</span>
                <span className="text-sm font-medium">{session.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Phone label</span>
                <span className="text-sm font-medium">
                  {countries.find((country) => country.code === session.countryCode)?.dialCode}{" "}
                  {session.phone}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="inline-flex items-center gap-1.5 rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  {statusLabel}
                </span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={restartConnection}
                disabled={isLoading}
                className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh QR
              </button>
              <button
                onClick={deleteSession}
                className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 && session ? (
        <div className="space-y-6">
          <div className="rounded-md border border-border bg-card p-6">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">
                WhatsApp connected successfully
              </h1>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Your session is live. Save a webhook URL and every inbound message will be
                sent there with a `POST` request.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border bg-background/70 p-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-accent" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Session
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold">
                  {session.connectedName || session.name}
                </p>
                <p className="text-sm text-muted-foreground">{session.name}</p>
              </div>

              <div className="rounded-md border border-border bg-background/70 p-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-accent" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Number
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold">
                  {session.connectedPhone
                    ? `+${session.connectedPhone}`
                    : `${countries.find((country) => country.code === session.countryCode)?.dialCode} ${session.phone}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.device || "Linked Device"}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-start gap-3">
                <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Webhook URL</p>
                    <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      POST method
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Paste your n8n, Make, or any public endpoint. Incoming messages for this
                    number will be delivered to that webhook.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      {...register("webhookUrl")}
                      type="url"
                      placeholder="https://n8n.yourdomain.com/webhook/whatsapp"
                      className="input-field flex-1"
                    />
                    <button
                      onClick={saveWebhook}
                      disabled={webhookLoading}
                      className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-60"
                    >
                      {webhookLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : webhookSaved ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {webhookLoading ? "Saving..." : webhookSaved ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={goToDashboard}
                className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" />
                Go to dashboard
              </button>
              <button
                onClick={deleteSession}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete session
              </button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Webhook payload preview</h2>
              </div>
              <button
                onClick={copyWebhookPayload}
                className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
              >
                {copiedPayload ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              This is the JSON payload we will send to your webhook when a message arrives.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background p-4 font-mono text-xs leading-6 text-emerald-50">
{JSON.stringify(
  {
    ...payloadExample,
    data: {
      ...payloadExample.data,
      sessionId: session.id,
      sessionName: session.name
    }
  },
  null,
  2
)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
