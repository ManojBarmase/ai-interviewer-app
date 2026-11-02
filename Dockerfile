# ==============================================================================
# Enterprise Multi-Stage Dockerfile for AI Interviewer Platform
# Target Architecture: Node.js 22 (LTS) on Alpine Linux
# Output Mode: Next.js Standalone Runner with Non-Root Security Context
# ==============================================================================

# ── Stage 1: Base Alpine Image ────────────────────────────────────────────────
FROM node:22-alpine AS base

# Install libc6-compat and openssl for Prisma query engine compatibility on Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ── Stage 2: Dependencies Cache Layer ─────────────────────────────────────────
FROM base AS deps

# Copy dependency manifests
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install exact production and development dependencies with clean cache
RUN npm ci --legacy-peer-deps

# ── Stage 3: Application Builder ──────────────────────────────────────────────
FROM base AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client for the current target platform
RUN npx prisma generate

# Disable Next.js telemetry during container build step
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js with standalone output
RUN npm run build

# ── Stage 4: Production Runner ────────────────────────────────────────────────
FROM base AS runner

WORKDIR /app

# Production execution environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Establish unprivileged system user & group (CIS Benchmark & Kubernetes Security Context)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and compiled standalone server bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Container liveness healthcheck against lightweight live probe
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health/live || exit 1

# Launch the standalone Next.js server
CMD ["node", "server.js"]
