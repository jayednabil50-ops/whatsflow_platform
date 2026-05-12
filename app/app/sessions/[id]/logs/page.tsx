"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  ArrowUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  direction: "inbound" | "outbound";
  remoteJid: string;
  messageType: string;
  body?: string;
  status: string;
  errorMessage?: string;
  externalMessageId?: string;
  mediaMime?: string;
  createdAt: string;
}

type DirectionFilter = "" | "inbound" | "outbound";
type StatusFilter = "" | "pending" | "sent" | "received" | "failed";

export default function SessionLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionName, setSessionName] = useState<string>("Session");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortDesc, setSortDesc] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then(({ id }) => setSessionId(id));
  }, [params]);

  const fetchLogs = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (directionFilter) qs.set("direction", directionFilter);
      if (typeFilter) qs.set("type", typeFilter);
      qs.set("limit", "200");

      const res = await fetch(`/api/whatsapp/sessions/${sessionId}/logs?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load logs."); return; }
      setSessionName(data.sessionName || "Session");
      setLogs(data.logs || []);
    } catch { setError("Network error loading logs."); }
    finally { setLoading(false); }
  }, [sessionId, directionFilter, typeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filtered = logs
    .filter((log) => !statusFilter || log.status === statusFilter)
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortDesc ? diff : -diff;
    });

  function exportCsv() {
    const header = "id,direction,remoteJid,type,status,body,createdAt\n";
    const rows = filtered
      .map((l) => [l.id, l.direction, l.remoteJid, l.messageType, l.status, JSON.stringify(l.body || ""), l.createdAt].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <Link
          href={`/app/sessions/${sessionId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {sessionName}
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent/80">{sessionName}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Message Logs
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Searchable delivery records, inbound payloads, and status history.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={fetchLogs}
              className="focus-ring flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="focus-ring flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters:
        </div>
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
          className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="">All directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="received">Received</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="">All types</option>
          <option value="text">Text</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="document">Document</option>
          <option value="sticker">Sticker</option>
          <option value="poll">Poll</option>
          <option value="reaction">Reaction</option>
          <option value="contact">Contact</option>
          <option value="location">Location</option>
        </select>
        <button
          onClick={() => setSortDesc((v) => !v)}
          className="focus-ring flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/30"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortDesc ? "Newest first" : "Oldest first"}
        </button>
        <p className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 py-20 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-foreground">No logs found</p>
          <p className="mt-1.5 text-xs text-muted-foreground">Messages appear here once they are sent or received.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Direction", "Type", "Remote JID", "Body", "Status", "Time"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((log) => (
                  <tr key={log.id} className="transition hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          log.direction === "inbound"
                            ? "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400"
                            : "bg-accent/10 text-accent"
                        )}
                      >
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {log.messageType || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[160px] truncate font-mono text-xs text-foreground/70">
                        {log.remoteJid}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {log.body || <span className="italic text-muted-foreground/40">{log.mediaMime || "No text"}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          log.status === "sent" || log.status === "received"
                            ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                            : log.status === "failed"
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
