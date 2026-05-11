import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Workflow } from "lucide-react";

export function SdkSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-6 py-24" id="sdks">
      <div className="text-center mb-12">
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-1.5 text-xs font-semibold text-emerald-400 tracking-wide uppercase mb-5">
          No-code Integration
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-white">
          Build WhatsApp Automations Visually
        </h2>
        <p className="mt-3 text-white/45 max-w-xl mx-auto leading-7">
          Use our n8n integration to wire up flows without writing a single line of code.
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        <div className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-8 transition-all duration-300 hover:border-emerald-500/30">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <Workflow className="h-6 w-6" />
          </div>

          <h3 className="text-xl font-semibold text-white">n8n Integration</h3>

          <p className="mt-3 flex-1 text-sm leading-7 text-white/55">
            Drag-and-drop WhatsApp nodes inside your n8n canvas. Trigger flows on incoming
            messages, send automated replies, broadcast to contact lists, and chain WhatsApp
            with hundreds of other apps — all without writing code.
          </p>

          <Link
            href={"/docs" as Route}
            className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/[0.12]"
          >
            View n8n Documentation
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
