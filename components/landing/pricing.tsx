"use client";

import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Shield, Sparkles, Zap } from "lucide-react";
import { buildBuyPlanWhatsAppUrl, buildGenericContactWhatsAppUrl } from "@/lib/contact-admin";

type Plan = {
  name: string;
  price: number;
  duration: string;
  durationShort: string;
  sessions: string;
  perMonth?: string;
  features: string[];
  badge?: string;
  popular?: boolean;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: 299,
    duration: "1 month",
    durationShort: "/month",
    sessions: "1 WhatsApp connection",
    features: [
      "1 WhatsApp session",
      "Full REST API access",
      "Real-time webhooks",
      "Text & media messaging",
      "Contact management",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: 399,
    duration: "2 months",
    durationShort: "/2 months",
    sessions: "3 WhatsApp connections",
    perMonth: "৳200/mo",
    popular: true,
    badge: "Most Popular",
    features: [
      "3 WhatsApp sessions",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "Priority email support",
    ],
  },
  {
    name: "Annual",
    price: 1000,
    duration: "1 year",
    durationShort: "/year",
    sessions: "3 WhatsApp connections",
    perMonth: "৳84/mo",
    badge: "Best Value",
    features: [
      "3 WhatsApp sessions",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "Priority email support",
    ],
  },
  {
    name: "Unlimited",
    price: 600,
    duration: "1 month",
    durationShort: "/month",
    sessions: "Unlimited connections",
    highlight: true,
    badge: "Power User",
    features: [
      "Unlimited WhatsApp sessions",
      "Unlimited messages",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "MCP server integration",
      "Premium support",
    ],
  },
];

const TRIAL_FEATURES = [
  "1 WhatsApp session",
  "Full REST API access",
  "Real-time webhooks",
  "Send text & media",
  "No credit card needed",
];

export function PricingSection() {
  return (
    <section className="border-y border-white/[0.05] bg-white/[0.01]" id="pricing">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 py-24">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase text-emerald-400 mb-4">
            3-day free trial · Cancel anytime
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-white">
            Simple Transparent Pricing
          </h2>
          <p className="mt-4 text-sm text-white/40">
            Made for Bangladesh — pay in BDT, get full WhatsApp API access
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Free Trial Card */}
          <div className="relative flex flex-col rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-400/[0.08] to-transparent p-6 shadow-[0_0_60px_rgba(251,191,36,0.08)] transition-all duration-300">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="rounded-full bg-amber-400 px-3 py-0.5 text-[11px] font-bold text-black shadow-[0_0_20px_rgba(251,191,36,0.4)]">
                Try Free
              </span>
            </div>

            <h3 className="text-base font-semibold text-white">Free Trial</h3>

            <div className="mt-4 flex items-end gap-1">
              <span className="text-4xl font-extrabold tracking-tight text-white">৳0</span>
              <span className="mb-1 text-sm text-white/40">/3 days</span>
            </div>
            <p className="mt-1 text-xs text-amber-300">No credit card needed</p>

            <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs">
              <span className="font-semibold text-white">1 WhatsApp connection</span>
            </div>

            <ul className="mt-5 flex-1 space-y-2.5">
              {TRIAL_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-[13px] text-white/50"
                >
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-semibold text-black transition-all duration-300 hover:bg-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.3)] hover:shadow-[0_0_44px_rgba(251,191,36,0.45)]"
            >
              <Zap className="h-4 w-4" />
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-2 text-center text-[11px] text-white/40">
              Account is created instantly
            </p>
          </div>

          {/* Paid Plans */}
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-300 ${
                plan.popular
                  ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.08] to-transparent shadow-[0_0_60px_rgba(52,211,153,0.1)]"
                  : plan.highlight
                    ? "border-cyan-500/40 bg-gradient-to-b from-cyan-500/[0.08] to-transparent shadow-[0_0_60px_rgba(34,211,238,0.1)]"
                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"
              }`}
            >
              {plan.badge && (
                <>
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent ${
                      plan.popular
                        ? "via-emerald-500/50"
                        : plan.highlight
                          ? "via-cyan-500/50"
                          : "via-white/30"
                    } to-transparent`}
                  />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span
                      className={`rounded-full px-3 py-0.5 text-[11px] font-bold shadow-lg ${
                        plan.popular
                          ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                          : plan.highlight
                            ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                            : "bg-white/10 text-white"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                </>
              )}

              <h3 className="text-base font-semibold text-white">{plan.name}</h3>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-white">
                  ৳{plan.price.toLocaleString("en-US")}
                </span>
                <span className="mb-1 text-sm text-white/40">{plan.durationShort}</span>
              </div>
              {plan.perMonth && (
                <p className="mt-1 text-xs text-emerald-400">
                  Effective {plan.perMonth}
                </p>
              )}

              <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs">
                <span className="font-semibold text-white">{plan.sessions}</span>
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-[13px] text-white/50"
                  >
                    <Check
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        plan.highlight ? "text-cyan-400" : "text-emerald-400"
                      }`}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={buildBuyPlanWhatsAppUrl({
                  name: plan.name,
                  price: `৳${plan.price.toLocaleString("en-US")}`,
                  duration: plan.durationShort,
                  sessions: plan.sessions
                })}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-300 ${
                  plan.popular
                    ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_28px_rgba(52,211,153,0.3)] hover:shadow-[0_0_44px_rgba(52,211,153,0.45)]"
                    : plan.highlight
                      ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_28px_rgba(34,211,238,0.3)] hover:shadow-[0_0_44px_rgba(34,211,238,0.45)]"
                      : "border border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/[0.15] hover:text-white"
                }`}
              >
                {plan.highlight ? (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Buy via WhatsApp
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" />
                    Buy via WhatsApp
                  </>
                )}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-7 py-5">
          <div>
            <p className="text-sm font-semibold text-white">Need a custom plan?</p>
            <p className="mt-0.5 text-sm text-white/40">
              Enterprise teams, agencies, and resellers — let&apos;s talk.
            </p>
          </div>
          <a
            href={buildGenericContactWhatsAppUrl(
              "I need a custom enterprise plan. Please share details."
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:border-emerald-500/50 hover:bg-emerald-500/[0.12]"
          >
            Contact via WhatsApp →
          </a>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/25">
          <Shield className="h-3.5 w-3.5" />
          Secure payments · bKash, Nagad, Rocket, Card supported
        </div>
      </div>
    </section>
  );
}
