# WhatsFlow Production Deployment Guide

আপনার platform deploy করার জন্য complete guide। **Vercel কাজ করবে না** — Baileys persistent WebSocket চালায়, তাই serverless এ চলবে না।

---

## 🎯 কোন hosting বেছে নেবেন?

| Platform | Cost | Setup Time | Best For |
|---|---|---|---|
| **Railway** | $5/mo credit (free trial) | 5 min | দ্রুত শুরু, auto-deploy |
| **Render** | Free tier আছে (sleeps) / $7/mo | 5 min | Singapore region |
| **Fly.io** | $0–5/mo | 10 min | Global edge, persistent volumes |
| **Hetzner VPS** | €4/mo | 20 min | Best long-term value |
| **DigitalOcean** | $6/mo droplet | 20 min | Reliable, well-known |

---

## ✅ Pre-deploy checklist

1. **Supabase project ready**
   - Project create করেছেন
   - সব 9টা migration apply করেছেন (`supabase/migrations/*.sql`)
   - Service role key copy করেছেন

2. **Environment variables প্রস্তুত** (`.env.production.example` দেখুন)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (HTTPS domain)
   - `WHATSFLOW_OWNER_EMAILS` (e.g. `jayednabil50@gmail.com`)
   - `WHATSFLOW_ADMIN_EMAIL` + `WHATSFLOW_ADMIN_PASSWORD` (for one-time bootstrap)
   - `NEXT_PUBLIC_ADMIN_WHATSAPP` (your WhatsApp number for "Buy via WhatsApp" buttons, digits only e.g. `8801712345678`)
   - `WHATSFLOW_WORKER_SECRET` (64+ char random — `openssl rand -hex 32`)

3. **Domain ready** (HTTPS required webhook এর জন্য)

---

## 🚀 Option A: Railway (Recommended for fast launch)

### Setup

```bash
# 1. CLI install
npm i -g @railway/cli

# 2. Login
railway login

# 3. Link project (project create করার পর)
railway link

# 4. সব env variables set করুন
railway variables set NEXT_PUBLIC_SUPABASE_URL="..."
railway variables set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="..."
railway variables set SUPABASE_SERVICE_ROLE_KEY="..."
railway variables set NEXT_PUBLIC_APP_URL="https://your-app.up.railway.app"
railway variables set WHATSFLOW_OWNER_EMAILS="you@example.com"
railway variables set WHATSFLOW_WORKER_SECRET="$(openssl rand -hex 32)"

# 5. Deploy
railway up
```

`railway.toml` already configured — automatically Nixpacks build করবে।

### Important
- Free tier এ persistent disk নেই, তাই Supabase auth-state persistence (`supabase-auth-state.ts`) কাজে লাগবে
- Custom domain যোগ করুন Railway dashboard থেকে

---

## 🚀 Option B: Render

### Setup

1. https://dashboard.render.com → New → Blueprint
2. Connect your GitHub repo
3. Render automatically `render.yaml` detect করবে
4. সব env variables Dashboard থেকে fill করুন
5. Deploy click করুন

### Notes
- Free tier 15 min idle এর পর sleep করে যায় — paid plan ($7/mo) recommended
- Singapore region (`render.yaml` এ already set)
- Health check: `/api/health`

---

## 🚀 Option C: Docker + VPS (Hetzner / DigitalOcean / যেকোন VPS)

### Setup on VPS (Ubuntu 22.04)

```bash
# 1. Docker install
curl -fsSL https://get.docker.com | sh

# 2. Repo clone
git clone https://github.com/YOUR_USERNAME/whatsflow.git
cd whatsflow

# 3. Production env file create
cp .env.production.example .env.production
nano .env.production   # সব values fill করুন

# 4. Build & run
docker build -t whatsflow .
docker run -d \
  --name whatsflow \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  -v whatsflow_sessions:/app/sessions \
  whatsflow

# 5. Reverse proxy (Caddy — auto-HTTPS)
sudo apt install caddy
sudo nano /etc/caddy/Caddyfile
```

**Caddyfile:**
```
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

ব্যাস — আপনার platform `https://your-domain.com` এ চলবে।

---

## 🚀 Option D: Fly.io

```bash
# 1. CLI install
curl -L https://fly.io/install.sh | sh

# 2. Login & launch
fly auth login
fly launch --no-deploy

# 3. Persistent volume create (sessions এর জন্য)
fly volumes create whatsflow_sessions --size 1 --region sin

# 4. Set secrets
fly secrets set \
  NEXT_PUBLIC_SUPABASE_URL="..." \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="..." \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  NEXT_PUBLIC_APP_URL="https://your-app.fly.dev" \
  WHATSFLOW_OWNER_EMAILS="you@example.com" \
  WHATSFLOW_WORKER_SECRET="$(openssl rand -hex 32)"

# 5. Deploy
fly deploy
```

---

## 🔐 Post-deploy

1. **Test health endpoint:** `curl https://your-domain.com/api/health` → `{"status":"ok"}`
2. **Bootstrap admin user** — Render Shell বা locally (env এ pointing to production Supabase):
   ```bash
   npm run setup:admin
   ```
   এটা `WHATSFLOW_ADMIN_EMAIL` + `WHATSFLOW_ADMIN_PASSWORD` দিয়ে Supabase Auth এ owner account create করবে।
3. **Login** with admin email + password → `/app/admin` panel এ যান → full owner access থাকা উচিত
4. **First session create** → QR scan → connect verify করুন
5. **Send test message** (text + image + sticker) — সব 3 verify করুন

### Admin Panel Controls

`/app/admin` page এ যেকোন user এর জন্য:

- **Extend trial** — custom দিন (default 2)
- **Grant subscription** — plan বেছে নিন (Starter/Pro/Annual/Unlimited) + custom duration (default plan অনুযায়ী)
- **Expire access** — তাৎক্ষণিক revoke (সব live WhatsApp socket disconnect)
- **Delete user** — full purge (irreversible)

Plan → session limit mapping:
- Starter: 1 WhatsApp session
- Pro: 3 sessions
- Annual: 3 sessions
- Unlimited: ∞

### "Buy via WhatsApp" Flow

User pricing page এ "Buy via WhatsApp" click করলে — pre-filled message সহ `wa.me/<NEXT_PUBLIC_ADMIN_WHATSAPP>` এ redirect হবে। আপনি messages WhatsApp এ পাবেন, payment নেবেন, তারপর admin panel থেকে manually plan grant করবেন।

---

## 🐛 Troubleshooting

### QR code দেখা যাচ্ছে না
- Worker process running কিনা চেক — logs এ `[render-start] Worker is ready on port 3101` দেখা উচিত
- `WHATSFLOW_WORKER_SECRET` set আছে কিনা confirm করুন

### Session disconnect হয়ে যাচ্ছে
- Supabase auth-state persistence কাজ করছে কিনা — check `whatsapp_session_credentials` table
- Memory limit বাড়ান (Railway/Render এ minimum 1GB recommended)

### Webhook deliver হচ্ছে না
- HTTPS URL ব্যবহার করেছেন কিনা confirm করুন (localhost ছাড়া HTTP allowed না)
- `webhook_deliveries` table এ status check করুন

### Build fail হচ্ছে
- Node.js version ≥22 কিনা confirm করুন
- `npm ci` এর পর `npm run build` locally চালিয়ে দেখুন

---

## 📊 Recommended Production Stack

```
┌─────────────────────────────────────────┐
│ Custom Domain (Cloudflare DNS)          │
└────────────────┬────────────────────────┘
                 │ HTTPS
        ┌────────▼────────┐
        │ Railway / VPS   │
        │  ┌───────────┐  │
        │  │ Next.js   │  │  ← User-facing
        │  └─────┬─────┘  │
        │        │ HTTP   │
        │  ┌─────▼─────┐  │
        │  │ Worker    │  │  ← Baileys + WhatsApp
        │  └───────────┘  │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │ Supabase Cloud  │  ← DB + Auth + RLS
        └─────────────────┘
```

---

## 💰 Cost Estimate (1000 active sessions)

| Component | Monthly Cost |
|---|---|
| Hetzner CPX21 VPS (3 vCPU, 4GB RAM) | €8 |
| Supabase Pro | $25 |
| Cloudflare DNS | Free |
| **Total** | **~$35/mo** |

(Railway/Render এ একই scale এ $50–80/mo লাগবে।)
