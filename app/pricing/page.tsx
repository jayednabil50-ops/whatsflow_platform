import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { Nav } from "@/components/nav";
import { buildBuyPlanWhatsAppUrl } from "@/lib/contact-admin";
import { pricingPlans } from "@/lib/mocks/data";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#08090C] page-noise">
      <Nav />
      <main className="mx-auto max-w-6xl px-5 py-20 sm:px-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-1.5 text-xs font-medium text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Made for Bangladesh
          </div>
          <h1 className="mt-7 text-5xl font-bold tracking-[-0.03em] text-white sm:text-6xl">
            Pricing that makes sense in BDT.
          </h1>
          <p className="mt-5 mx-auto max-w-2xl text-lg leading-8 text-white/35">
            Start with a free 3-day trial. Pay in Taka. Cancel anytime. Choose the plan that fits — from a single connection to unlimited everything.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Free Trial Card */}
          <div className="relative flex flex-col rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-400/[0.08] to-transparent p-7 shadow-[0_0_64px_rgba(251,191,36,0.08)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="rounded-full bg-amber-400 px-3 py-0.5 text-[11px] font-bold text-black shadow-[0_0_20px_rgba(251,191,36,0.4)]">
                Try Free
              </span>
            </div>

            <h2 className="text-xl font-bold text-white">Free Trial</h2>

            <div className="mt-5 flex items-end gap-1.5">
              <p className="text-4xl font-extrabold tracking-tight text-white">৳0</p>
              <span className="mb-1 text-sm text-white/40">/3 days</span>
            </div>

            <p className="mt-2 text-xs font-medium text-amber-300">
              1 WhatsApp connection
            </p>

            <p className="mt-4 text-sm leading-6 text-white/40">
              Try the platform free for 3 days. Account is created instantly — no credit card needed.
            </p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {[
                "1 WhatsApp session",
                "Full REST API access",
                "Real-time webhooks",
                "Send text & media",
                "Auto-login after signup"
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-[13px] text-white/55"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="focus-ring group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition-all duration-300 hover:bg-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.25)] hover:shadow-[0_0_40px_rgba(251,191,36,0.4)]"
            >
              <Zap className="h-4 w-4" />
              Start Free Trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {pricingPlans.map((plan) => {
            const isPopular = "popular" in plan && plan.popular;
            const isHighlight = "highlight" in plan && plan.highlight;
            const badge = "badge" in plan ? plan.badge : undefined;

            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
                  isPopular
                    ? "border-emerald-400/40 bg-gradient-to-b from-emerald-400/[0.08] to-transparent shadow-[0_0_64px_rgba(52,211,153,0.1)]"
                    : isHighlight
                      ? "border-cyan-400/40 bg-gradient-to-b from-cyan-400/[0.08] to-transparent shadow-[0_0_64px_rgba(34,211,238,0.1)]"
                      : "border-white/[0.07] bg-white/[0.02]"
                }`}
              >
                {(isPopular || isHighlight || badge) && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span
                      className={`rounded-full px-3 py-0.5 text-[11px] font-bold ${
                        isPopular
                          ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                          : isHighlight
                            ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                            : "bg-white/10 text-white"
                      }`}
                    >
                      {isPopular ? "Most Popular" : isHighlight ? "Power User" : badge}
                    </span>
                  </div>
                )}

                <h2 className="text-xl font-bold text-white">{plan.name}</h2>

                <div className="mt-5 flex items-end gap-1.5">
                  <p className="text-4xl font-extrabold tracking-tight text-white">
                    {plan.price}
                  </p>
                  <span className="mb-1 text-sm text-white/40">{plan.duration}</span>
                </div>

                <p className="mt-2 text-xs font-medium text-emerald-400">
                  {plan.sessions}
                </p>

                <p className="mt-4 text-sm leading-6 text-white/40">
                  {plan.description}
                </p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-[13px] text-white/55"
                    >
                      <CheckCircle2
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          isHighlight ? "text-cyan-400" : "text-emerald-400"
                        }`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href={buildBuyPlanWhatsAppUrl({
                    name: plan.name,
                    price: plan.price,
                    duration: plan.duration,
                    sessions: plan.sessions
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`focus-ring group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-300 ${
                    isPopular
                      ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.25)] hover:shadow-[0_0_40px_rgba(52,211,153,0.4)]"
                      : isHighlight
                        ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_40px_rgba(34,211,238,0.4)]"
                        : "border border-white/[0.08] bg-white/[0.03] text-white/80 hover:border-white/[0.15] hover:text-white"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" />
                  Buy via WhatsApp
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm text-white/30">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" /> 3-day free trial
          </span>
          <span className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-emerald-400" /> No per-message fee
          </span>
          <span className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-emerald-400" /> End-to-end encrypted
          </span>
        </div>

        <section className="mt-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
          <div className="grid gap-8 lg:grid-cols-[0.5fr_1fr] lg:items-center">
            <div>
              <ShieldCheck className="h-10 w-10 text-emerald-400" />
              <h2 className="mt-5 text-2xl font-bold text-white">
                Safety is included for everyone.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/35">
                Account protection features are not locked behind a paywall.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Queue pacing", "Spread traffic instead of sending bursts."],
                ["Endpoint caps", "High-risk actions are labeled and limited."],
                ["Consent-first", "Avoid spammy product promises and risky workflows."]
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-white/35">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
