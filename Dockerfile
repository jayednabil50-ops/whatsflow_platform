# syntax=docker/dockerfile:1.6
# ---------- Stage 1: dependencies ----------
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: build ----------
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SESSIONS_DIR=/app/sessions

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 whatsflow \
    && useradd --system --uid 1001 --gid whatsflow whatsflow

COPY --from=builder --chown=whatsflow:whatsflow /app/.next ./.next
COPY --from=builder --chown=whatsflow:whatsflow /app/public ./public
COPY --from=builder --chown=whatsflow:whatsflow /app/node_modules ./node_modules
COPY --from=builder --chown=whatsflow:whatsflow /app/package.json ./package.json
COPY --from=builder --chown=whatsflow:whatsflow /app/scripts ./scripts
COPY --from=builder --chown=whatsflow:whatsflow /app/lib ./lib
COPY --from=builder --chown=whatsflow:whatsflow /app/app ./app
COPY --from=builder --chown=whatsflow:whatsflow /app/components ./components
COPY --from=builder --chown=whatsflow:whatsflow /app/middleware.ts ./middleware.ts
COPY --from=builder --chown=whatsflow:whatsflow /app/instrumentation.ts ./instrumentation.ts
COPY --from=builder --chown=whatsflow:whatsflow /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=whatsflow:whatsflow /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/sessions && chown -R whatsflow:whatsflow /app/sessions

USER whatsflow
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/render-start.js"]
