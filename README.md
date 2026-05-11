# WhatsFlow (Phase 1)

Developer-first WhatsApp automation platform scaffold built with Next.js 15 + Supabase.

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.local.example .env.local`
3. Start dev server:
   - `npm run dev`
4. Apply Supabase migration:
   - `supabase migration up`

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_AXIOM_TOKEN`

## Brand Rename

Update constants in `lib/brand.ts`:

- `BRAND`
- `BRAND_DOMAIN`
- `BRAND_ACCENT_COLOR`

## What Phase 1 Includes

- Marketing pages: `/`, `/pricing`, `/docs`, `/blog`, `/login`, `/register`
- Auth-gated app shell: `/app` plus sessions, logs, API keys, webhooks, usage, billing, settings
- Reusable components for status dots, copy actions, reveal-once values, code blocks, tables, empty states
- Supabase SQL migration with RLS policies and auth user profile trigger
- Mocked data in `lib/mocks/data.ts` so dashboard renders without backend workers

## Phase 2 Roadmap (next)

- Baileys session worker with QR and reconnect lifecycle
- Redis/BullMQ job queues for send and webhook pipelines
- Behavior profile simulator runtime (delays, warm-up ramps, quiet hours)
- Proxy testing and per-session SOCKS5 routing
- Real-time logs streaming from worker to dashboard
