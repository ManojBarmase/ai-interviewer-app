<div align="center">

# 🎯 AI Mock Interviewer

**Low-Latency Conversational AI SaaS for Technical & Behavioral Interviews**

[![CI Pipeline](https://github.com/ManojBarmase/ai-interviewer-app/actions/workflows/ci.yml/badge.svg)](https://github.com/ManojBarmase/ai-interviewer-app/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Live Production App →** [https://ai-interviewer-app-manoj.vercel.app](https://ai-interviewer-app-manoj.vercel.app)

*An enterprise-grade, full-stack AI interviewing platform. Upload your resume, configure your interview, and get context-aware real-time questions with automated performance analytics — all with **<400ms Time-to-First-Token (TTFT)** latency.*

</div>

---

## Table of Contents

1. [Why I Built This](#1-why-i-built-this)
2. [Live Demo & Features](#2-live-demo--features)
3. [Architecture Overview](#3-architecture-overview)
4. [Key Architectural Decisions (ADRs)](#4-key-architectural-decisions-adrs)
5. [Tech Stack](#5-tech-stack)
6. [Project Structure](#6-project-structure)
7. [Local Development Setup](#7-local-development-setup)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Database Management](#9-database-management)
10. [Testing](#10-testing)
11. [API Reference](#11-api-reference)
12. [Security Architecture](#12-security-architecture)
13. [CI/CD Pipeline](#13-cicd-pipeline)
14. [Deployment (Vercel)](#14-deployment-vercel)
15. [AI-Native Engineering: Human vs. AI Contributions](#15-ai-native-engineering-human-vs-ai-contributions)
16. [Known Limitations & Roadmap](#16-known-limitations--roadmap)
17. [Contributing](#17-contributing)

---

## 1. Why I Built This

Most AI mock interview tools fail in real-world usage for two core reasons:

1. **Unnatural Conversational Latency** — Standard LLM APIs average **2.5–4 seconds** to start streaming, breaking the psychological immersion of a live interview flow.
2. **Generic, Context-Blind Questioning** — Without structured resume parsing and strict schema enforcement, LLMs drift into textbook questions instead of probing a candidate's actual production claims.

This platform solves both by combining:

- **Server-side PDF resume ingestion** → structured candidate context injected into every prompt turn
- **Groq LPU ultra-low-latency inference** → `<400ms TTFT` for real-time follow-up probing
- **Zod-enforced evaluation schemas** → LLM output validated before reaching the UI
- **Distributed Upstash Redis rate-limiting** → global abuse prevention across all serverless instances

---

## 2. Live Demo & Features

| Feature | Details |
| :--- | :--- |
| 🔐 **Authentication** | Supabase Auth (email/password) + Guest Demo Mode |
| 📄 **Resume Upload & Parsing** | PDF ingestion (up to 5MB); digital text layer extraction via `pdf2json` with magic-byte validation |
| 🎙️ **Real-Time AI Interview** | Streaming SSE chat with Groq LPU; Web Speech API for voice input |
| 🧠 **Context-Aware Questions** | Resume text + role/stack/difficulty injected into every LLM turn |
| 📊 **Automated Scorecard** | Post-interview evaluation: skill scores (0–10), STAR analysis, hiring recommendation (`STRONG_YES` → `STRONG_NO`) |
| 📈 **Analytics Dashboard** | Interview heatmap, practice streaks, weekly goal tracker powered by Recharts |
| 🛡️ **Rate Limiting** | Sliding-window per-user rate limiter (Upstash Redis) across all serverless instances |
| 📦 **Interview Types** | TECHNICAL, BEHAVIOURAL, SYSTEM_DESIGN, HR, MIXED |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Client)                             │
│  React 19 + Next.js 16 App Router · Zustand State · Framer Motion   │
│  Web Speech API (Voice Input) · Recharts (Analytics)                │
└─────────────────────┬────────────────────────────────────────────────┘
                      │ HTTPS / SSE
┌─────────────────────▼────────────────────────────────────────────────┐
│                    PROXY (src/proxy.ts — Next.js 16)                 │
│  Route Protection · Supabase Session Refresh · Open Redirect Guard   │
└─────┬──────────────────────────────────┬────────────────────────────┘
      │                                  │
┌─────▼─────────┐               ┌────────▼──────────────────────────┐
│  API Routes   │               │  Server Actions / Server Components│
│  /api/        │               │  (Resume Parse, Scorecard Fetch)   │
│  interview/   │               └───────────────────────────────────┘
│  ├─ chat      │
│  ├─ evaluate  │
│  └─ session   │
└─────┬─────────┘
      │ Service Layer (server-only)
┌─────▼─────────────────────────────────────────────────────────────┐
│  Services                                                          │
│  ├─ ChatService        → Groq LPU streaming (SSE)                 │
│  ├─ EvaluationService  → Zod-validated scorecard generation        │
│  ├─ ResumeParserService→ PDF → structured candidate context        │
│  ├─ AnalyticsService   → Heatmap / streak / goal aggregation       │
│  └─ SessionService     → Session lifecycle management              │
└──────┬──────────────────────────────┬─────────────────────────────┘
       │ Repositories                 │ Integrations
┌──────▼──────────────┐   ┌──────────▼──────────────────────────────┐
│  Prisma ORM (v6)    │   │  Groq LPU SDK  · Upstash Redis          │
│  Supabase PostgreSQL│   │  (Rate Limiter · Cache)                 │
│  UUID PKs · Soft ∆  │   └─────────────────────────────────────────┘
│  Enums · Indexes    │
└─────────────────────┘
```

### Data Flow: Interview Turn

```
User speaks / types
  → Web Speech API transcribes
  → Zustand store appends message
  → POST /api/interview/chat (with full message history + candidateContext)
  → proxy.ts verifies Supabase session
  → Upstash rate-limit check (sliding window, per-userId)
  → ChatService builds Groq prompt (resume + role + difficulty injected)
  → Groq LPU streams tokens → SSE chunks → UI renders token-by-token (<400ms TTFT)
  → On session end → POST /api/interview/evaluate
  → EvaluationService → Groq → Zod validation → Prisma upsert Scorecard
  → Dashboard reads aggregated analytics
```

---

## 4. Key Architectural Decisions (ADRs)

### ADR-01: Groq LPU over Standard Gemini / OpenAI for Real-Time Turns

| | Detail |
| :--- | :--- |
| **Problem** | Standard LLM APIs averaged **2.2–3.5s TTFT**, breaking interview immersion |
| **Decision** | Groq LPU for conversational turns; Gemini retained for evaluation (larger context) |
| **Outcome** | `<400ms TTFT` — real-time follow-up probing feels instantaneous |
| **Trade-off** | Smaller Groq context window required resume text compaction into token-efficient summaries before injection |

### ADR-02: Upstash Redis over In-Memory Rate Limiting

| | Detail |
| :--- | :--- |
| **Problem** | In-memory `Map<string, number>` resets across Vercel cold starts and concurrent lambda instances |
| **Decision** | Sliding-window rate limiting via `@upstash/ratelimit` + Upstash Redis at the API boundary |
| **Outcome** | Global, stateless HTTP-based enforcement across all serverless invocations |
| **Trade-off** | ~5ms additional network hop per rate-limit check (acceptable vs. token-drain risk) |

### ADR-03: Prisma ORM + Supabase with Dual Connection URLs

| | Detail |
| :--- | :--- |
| **Problem** | Serverless functions exhaust PostgreSQL connection limits without pooling |
| **Decision** | `DATABASE_URL` (port 5432, direct) for Prisma CLI migrations; pooler URL (port 6543, pgbouncer) for app runtime |
| **Outcome** | Zero connection pool exhaustion under concurrent Vercel invocations |
| **Trade-off** | Requires managing two connection strings in environment config |

### ADR-04: Strict Zod Validation on All LLM Outputs

| | Detail |
| :--- | :--- |
| **Problem** | LLMs return malformed JSON, markdown fences, or hallucinated scorecard keys — crashing Recharts |
| **Decision** | Zod schemas enforce shape on both **incoming** client payloads and **outgoing** LLM evaluation results |
| **Outcome** | Deterministic typed error states returned to UI; no unhandled 500 crashes |
| **Trade-off** | Adds ~2ms validation overhead per evaluation response |

### ADR-05: `server-only` Guards on All Server Modules

| | Detail |
| :--- | :--- |
| **Problem** | Risk of accidentally importing server-side DB / AI logic into client bundles |
| **Decision** | `import 'server-only'` at the top of every service, repository, and DB module |
| **Outcome** | Build-time error if any server module leaks into client-side code |

---

## 5. Tech Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 16.x | SSR, API Routes, Server Components, Proxy |
| **UI Runtime** | React | 19.x | Client Components, Suspense, concurrent rendering |
| **Language** | TypeScript | 5.x (strict) | End-to-end type safety |
| **Styling** | Tailwind CSS | v4 | Utility-first styling |
| **Animation** | Framer Motion | 14.x | Interview UI micro-animations |
| **State** | Zustand | 5.x | Client-side interview session state |
| **Charts** | Recharts | 3.x | Analytics dashboard |
| **ORM** | Prisma | 6.x | Type-safe DB access + migrations |
| **Database** | Supabase (PostgreSQL) | — | Relational data + Auth |
| **Auth** | Supabase Auth + `@supabase/ssr` | — | SSR-safe session management |
| **AI Inference** | Groq SDK (LPU) | 1.x | <400ms streaming inference |
| **Validation** | Zod | 4.x | Schema enforcement on LLM output + API payloads |
| **Rate Limiting** | Upstash Redis + `@upstash/ratelimit` | — | Distributed sliding-window rate limiting |
| **PDF Parsing** | `pdf2json` | 4.x | Server-side resume text extraction |
| **Logging** | Pino | 10.x | Structured JSON logs with session context |
| **Unit Tests** | Vitest + jsdom | 5.x | Service-layer unit & integration tests |
| **E2E Tests** | Playwright | 1.x | Browser-level interview flow tests |
| **CI/CD** | GitHub Actions + Vercel | — | Automated quality gate + deployment |

---

## 6. Project Structure

```
ai-interviewer-app/
├── .github/
│   └── workflows/
│       └── ci.yml                    # Enterprise CI: type-check → lint → test → build
├── e2e/
│   └── interview-flow.spec.ts        # Playwright E2E: full interview session
├── prisma/
│   ├── schema.prisma                 # DB schema: UUID PKs, soft deletes, enums, indexes
│   └── migrations/                   # Version-controlled migration history (never use db push)
├── scripts/
│   ├── test_db.js                    # DB connectivity smoke test
│   └── test_groq.js                  # Groq API connectivity smoke test
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/
│   │   │   └── interview/
│   │   │       ├── chat/route.ts     # POST: streaming SSE interview turns
│   │   │       ├── evaluate/route.ts # POST: post-interview scorecard generation
│   │   │       └── session/route.ts  # POST/GET: session lifecycle
│   │   ├── auth/                     # Supabase Auth callback route
│   │   ├── dashboard/                # Analytics dashboard (Server Component)
│   │   ├── interview/                # Interview room (Client Component)
│   │   ├── login/                    # Auth page
│   │   ├── global-error.tsx          # Global error boundary
│   │   └── not-found.tsx             # Custom 404
│   ├── components/
│   │   ├── layouts/                  # Shared layout wrappers
│   │   └── ui/                       # Reusable UI primitives
│   ├── features/                     # Feature-sliced architecture
│   │   ├── auth/                     # Auth components (login form, etc.)
│   │   ├── dashboard/                # Dashboard widgets
│   │   ├── interview/
│   │   │   ├── components/
│   │   │   │   ├── ActiveRoom/       # Live interview UI (chat, voice, SSE)
│   │   │   │   └── WaitingRoom/      # Pre-interview setup & resume upload
│   │   │   ├── store/
│   │   │   │   └── useInterviewStore.ts  # Zustand: full interview session state
│   │   │   └── constants/            # Interview type configs, defaults
│   │   ├── scorecard/                # Post-interview scorecard display
│   │   └── setup/                    # Interview configuration form
│   ├── lib/
│   │   ├── config/                   # App-wide config constants
│   │   ├── constants/                # Shared enum-like constants
│   │   ├── logger.ts                 # Pino structured logger + session child logger
│   │   ├── supabase/                 # Supabase client factories (browser/server)
│   │   └── validations/
│   │       └── evaluation.ts         # Zod schema for LLM scorecard output
│   ├── server/                       # server-only modules (build-time guarded)
│   │   ├── db/
│   │   │   └── prisma.ts             # Prisma singleton with globalThis HMR caching
│   │   ├── errors/
│   │   │   └── AppError.ts           # Typed error hierarchy (AppError, ValidationError, etc.)
│   │   ├── integrations/
│   │   │   ├── ai/
│   │   │   │   ├── groq.client.ts    # Groq SDK client factory
│   │   │   │   └── evaluation.prompt.ts  # Structured evaluation prompt builder
│   │   │   └── cache/
│   │   │       └── ratelimit.ts      # Upstash sliding-window rate limiter
│   │   ├── repositories/
│   │   │   ├── scorecard.repository.ts  # Prisma scorecard read/write
│   │   │   └── session.repository.ts    # Prisma session CRUD
│   │   ├── services/
│   │   │   ├── chat.service.ts       # Groq LPU streaming + SSE response builder
│   │   │   ├── evaluation.service.ts # LLM evaluation → Zod → Prisma persist
│   │   │   ├── resume-parser.service.ts # PDF validation + pdf2json extraction
│   │   │   ├── analytics.service.ts  # Heatmap, streak, weekly goal aggregation
│   │   │   └── session.service.ts    # Session lifecycle helpers
│   │   └── utils/                    # Server utility functions
│   ├── types/
│   │   ├── api.ts                    # API request/response types
│   │   ├── common.ts                 # Shared domain types
│   │   └── index.ts
│   └── proxy.ts                      # Next.js 16 Proxy (renamed from middleware.ts)
├── .env                              # Prisma CLI env (DATABASE_URL direct connection)
├── .env.local                        # App runtime env (never commit — in .gitignore)
├── .npmrc                            # legacy-peer-deps=true for deterministic installs
├── next.config.ts                    # Security headers, strict TS, console stripping
├── prisma/schema.prisma              # Database schema
├── tsconfig.json                     # Strict TypeScript config
└── vitest.config.ts                  # Unit test config with coverage thresholds
```

---

## 7. Local Development Setup

> **Prerequisites:** Node.js 20+, npm 10+, Git

### Step 1 — Clone the Repository

```bash
git clone https://github.com/ManojBarmase/ai-interviewer-app.git
cd ai-interviewer-app
```

### Step 2 — Install Dependencies

```bash
npm install --legacy-peer-deps
```

> This also automatically runs `prisma generate` via the `postinstall` script in `package.json`.

### Step 3 — Configure Environment Variables

Create your local env file and fill in your secrets (see [Section 8](#8-environment-variables-reference) for the full reference):

```bash
# Copy the example template
cp .env.local.example .env.local
```

Also update `.env` with your `DATABASE_URL` (direct port 5432 connection) for Prisma CLI commands.

### Step 4 — Apply Database Migrations

```bash
# Apply all existing migrations to your target database
npx prisma migrate deploy
```

> ⚠️ **Never run `npx prisma db push`** on this project. Migration history exists in `prisma/migrations/`. See [Section 9](#9-database-management) for the full explanation.

### Step 5 — Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 6 — (Optional) Verify Connectivity

```bash
# Test database connection
node scripts/test_db.js

# Test Groq API connection
node scripts/test_groq.js
```

---

## 8. Environment Variables Reference

> **Security:** Never commit `.env.local` to version control. It is listed in `.gitignore`.

### `.env.local` — App Runtime Variables

| Variable | Required | Description | Where to Get |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | ✅ | Base URL (`http://localhost:3000` locally, Vercel URL in prod) | Self-defined |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase public anon key | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable key | Supabase Dashboard → Settings → API |
| `DATABASE_URL` | ✅ | PostgreSQL **pooler** URL (port 6543, pgbouncer) for app runtime | Supabase → Settings → Database → Transaction pooler |
| `KV_REST_API_URL` | ✅ | Upstash Redis REST API URL | [Upstash Console](https://console.upstash.com/) |
| `KV_REST_API_TOKEN` | ✅ | Upstash Redis REST API token | [Upstash Console](https://console.upstash.com/) |
| `GROQ_API_KEY` | ✅ | Groq LPU API key | [Groq Console](https://console.groq.com/) |

### `.env` — Prisma CLI Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | ✅ | PostgreSQL **direct** connection URL (port 5432) for Prisma CLI migrations only |

### Why Two DATABASE_URLs?

| | Port | Used By | Why |
| :--- | :--- | :--- | :--- |
| **Direct** | 5432 | Prisma CLI (`migrate`, `generate`) | CLI needs persistent connections; PgBouncer transaction mode breaks them |
| **Pooler** | 6543 | Next.js runtime (app requests) | Serverless functions share pooled connections, preventing PostgreSQL exhaustion |

### `.env.local.example` Template

```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Database — Pooler URL for app runtime (port 6543)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Upstash Redis
KV_REST_API_URL=https://your-upstash-url.upstash.io
KV_REST_API_TOKEN=your-upstash-token

# Groq
GROQ_API_KEY=gsk_...
```

---

## 9. Database Management

This project uses **Prisma Migrate** — a version-controlled, code-reviewed migration workflow. All schema changes produce SQL files tracked in `prisma/migrations/`.

### Command Reference

| Scenario | Command | When to Use |
| :--- | :--- | :--- |
| Apply existing migrations to a fresh DB | `npx prisma migrate deploy` | Initial local setup, CI/CD, production deploys |
| Create a new migration after schema changes | `npx prisma migrate dev --name <description>` | Local development after editing `schema.prisma` |
| Regenerate Prisma Client types only | `npx prisma generate` | After schema edits (auto-runs on `npm install`) |
| Check pending migration status | `npx prisma migrate status` | Verify what's pending before a deploy |
| Visual DB browser (local only) | `npx prisma studio` | Local data inspection |

### ⚠️ NEVER Use `npx prisma db push`

`db push` is for throwaway prototyping only. On this project it will:

- Bypass the migration audit trail (no SQL file created)
- Create schema drift — breaking future `prisma migrate` commands with "Database out of sync" errors
- Risk **silent data loss** on column renames (drop + recreate, not rename)
- Violate compliance requirements (SOC2, audit logging)

### Schema Design Highlights

| Design Choice | Rationale |
| :--- | :--- |
| **UUID primary keys** | Globally unique; prevents sequential ID enumeration in APIs |
| **Soft deletes** (`isDeleted`, `deletedAt`) | Data retention compliance on all entities |
| **Typed DB enums** (`UserRole`, `SessionStatus`, etc.) | DB rejects invalid values at the constraint level |
| **Tuned composite indexes** | No redundant boolean or `@unique`-duplicate indexes |
| **Foreign key constraints** | All relations enforce referential integrity at the DB level |

### Entity Relationship Summary

```
User ──< Session ──< InterviewTranscript
User ──< Scorecard
Session ──< Scorecard
```

---

## 10. Testing

### Unit & Integration Tests (Vitest)

```bash
npm run test            # Run once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report (HTML + JSON + text)
```

**Coverage Thresholds** (enforced in `vitest.config.ts` — build fails if not met):

| Metric | Threshold |
| :--- | :--- |
| Lines | 80% |
| Functions | 80% |
| Branches | 70% |
| Statements | 80% |

**Covered Modules:**
- `EvaluationService` — LLM output parsing, Zod validation, transcript extraction, error boundaries
- `useInterviewStore` — Zustand state machine transitions for the full interview session lifecycle

### E2E Tests (Playwright)

```bash
npm run test:e2e   # Requires app running on localhost:3000
```

Covers the end-to-end browser interview flow (`e2e/interview-flow.spec.ts`).

### Full Quality Gate

Run this before every Pull Request:

```bash
npm run validate
# Executes: type-check → lint (0 warnings) → unit tests → format check
```

---

## 11. API Reference

All endpoints under `/api/interview/` require authentication. Rate limiting is applied per `userId` via Upstash sliding-window.

### `POST /api/interview/chat`

Streams AI interviewer responses as Server-Sent Events (SSE).

**Auth:** Supabase session cookie OR `demo_candidate_session=true` cookie

**Request Body:**
```json
{
  "sessionId": "uuid",
  "messages": [{ "role": "user", "content": "Tell me about a challenging project." }],
  "interviewType": "TECHNICAL",
  "candidateContext": {
    "role": "Senior Frontend Engineer",
    "experience": "5 years",
    "difficulty": "Hard",
    "techStack": ["React", "TypeScript", "Node.js"],
    "resumeText": "...",
    "numQuestions": 10,
    "allowFollowUps": true
  }
}
```

**Success Response:** `text/event-stream`
```
data: {"type":"chunk","text":"Tell me about..."}
data: {"type":"done"}
```

**Error Responses:**

| Status | Code | Cause |
| :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | Missing or invalid session |
| `429` | `RATE_LIMITED` | Upstash limit exceeded |
| `400` | `BAD_REQUEST` | Invalid request body |

---

### `POST /api/interview/evaluate`

Generates a Zod-validated scorecard after an interview session ends.

**Auth:** Required

**Request Body:**
```json
{
  "sessionId": "uuid",
  "transcript": "Full interview transcript...",
  "turns": [],
  "candidateContext": { "role": "...", "techStack": [] },
  "startedAt": "2026-10-24T10:00:00Z",
  "endedAt": "2026-10-24T10:30:00Z",
  "durationSeconds": 1800
}
```

**Success Response:** `200 OK`
```json
{
  "id": "scorecard-uuid",
  "overallScore": 8,
  "hiringRecommendation": "YES",
  "summary": "Strong candidate with deep React expertise...",
  "skillScores": { "problemSolving": 8, "communication": 9 },
  "starAnalysis": { "situation": "...", "task": "...", "action": "...", "result": "..." }
}
```

---

### `POST /api/parse-resume`

Parses a PDF resume and returns structured text for injection into interview prompts.

**Auth:** Required

**Request:** `multipart/form-data` with `file` field (PDF, max 5MB)

**Success Response:** `200 OK`
```json
{
  "text": "Extracted resume text...",
  "characterCount": 3200,
  "bytesParsed": 45000
}
```

**Error Responses:**

| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | No file or empty file |
| `413` | `PAYLOAD_TOO_LARGE` | File exceeds 5MB |
| `422` | `VALIDATION_ERROR` | Non-PDF MIME type |

---

## 12. Security Architecture

Security is layered across 7 levels. No single point of trust.

| Layer | Where | What It Does |
| :--- | :--- | :--- |
| **1. Proxy** | `src/proxy.ts` | JWT re-validation via `getUser()`, open-redirect guard, API 401 JSON for unauthenticated requests |
| **2. Route Auth** | Each API route handler | Independent session verification — proxy is first line, not only line |
| **3. HTTP Headers** | `next.config.ts` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Referrer-Policy` |
| **4. Rate Limiting** | Upstash Redis | Sliding-window per-user limit on `/api/interview/chat`; global across all serverless instances |
| **5. Input Validation** | Zod | All incoming client payloads and outgoing LLM responses validated against strict schemas |
| **6. `server-only` Guards** | All server modules | Build-time error if DB/AI modules leak into client bundles |
| **7. Console Stripping** | `next.config.ts` | All `console.log` removed in production; `warn`/`error` retained for observability |

---

## 13. CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

Runs automatically on every push to `main`/`master` and every Pull Request. Concurrent duplicate runs are cancelled.

```
npm ci --legacy-peer-deps
  → npx prisma generate
    → npm run type-check  (tsc --noEmit, zero errors)
      → npm run lint       (ESLint, zero warnings)
        → npm run test     (Vitest, coverage thresholds enforced)
          → npm run build  (next build, production bundle)
```

All steps must pass. ESLint is configured at `--max-warnings=0` — any warning is a CI failure.

---

## 14. Deployment (Vercel)

### Required Environment Variables

Set all variables from [Section 8](#8-environment-variables-reference) in your Vercel project (Settings → Environment Variables), scoped to **Production** and **Preview**.

> **Critical:** Use the **pooler URL** (port 6543) for `DATABASE_URL` in Vercel — not the direct connection URL.

### Pre-Deploy Checklist

- [ ] All environment variables set in Vercel dashboard
- [ ] `DATABASE_URL` is the **pooler URL** (port 6543) in Vercel
- [ ] `npx prisma migrate deploy` run against the production database before first deploy
- [ ] Supabase Auth → URL Configuration → Vercel domain added to `Allowed Redirect URLs`
- [ ] Upstash Redis plan supports expected request volume

### Database Migrations in Production

**Never run migrations inside the Vercel build step.** Always run manually before deploying schema-changing code:

```bash
# Run against production DB using the direct URL
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

---

## 15. AI-Native Engineering: Human vs. AI Contributions

This repository uses structured context files ([`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md)) to accelerate development with AI coding tools while applying strict human verification at every critical decision point.

### What AI Generated → What Was Rejected & Rewritten

1. **Rate-Limiting Architecture**
   - *AI Produced:* In-memory `Map<string, number>` rate limiter inside the Next.js route handler
   - *Human Rejection:* In-memory state resets across Vercel cold starts and concurrent lambdas. Replaced with distributed `@upstash/ratelimit` backed by Upstash Redis

2. **LLM Response Parsing & Error Boundaries**
   - *AI Produced:* Direct `JSON.parse(llmResponse)` calls, assuming the LLM would always obey the system prompt format
   - *Human Rejection:* Markdown code fences, truncated tokens, and hallucinated keys caused unhandled 500 crashes. Rewrote with markdown-stripping, strict Zod schema validation, and typed error states returned to the UI

3. **Next.js 16 / React 19 Type Compatibility**
   - *AI Produced:* Legacy Next.js 14 `LayoutProps` typing and conflicting peer dependencies breaking Vercel CI (`ERESOLVE`)
   - *Human Rejection:* Updated all layout/metadata signatures to Next.js 16 async params/types ([`b160d67`](https://github.com/ManojBarmase/ai-interviewer-app/commit/b160d67)) and configured `.npmrc` (`legacy-peer-deps=true`)

4. **Prisma Schema Design**
   - *AI Produced:* String fields for roles, no enums, redundant `@@index([isDeleted])` and `@@index([email])` alongside `@unique`
   - *Human Rejection:* Boolean-column indexes have near-zero selectivity; `@unique` already creates a B-tree index. Replaced with typed DB enums and tuned composite indexes

---

## 16. Known Limitations & Roadmap

### Current Limitations

| Limitation | Impact | Workaround |
| :--- | :--- | :--- |
| **Scanned / Image-Only PDFs** | Resumes with no digital text layer fail extraction | Candidate manually pastes resume text |
| **Single Resume Per Session** | One PDF per interview session | Re-upload on new session |
| **No Full-Duplex Audio Barge-In** | Cannot interrupt AI mid-response in native WebRTC | Text input always available as fallback |
| **No SSO / OAuth** | Email/password only via Supabase | — |

### Planned Roadmap

- [ ] **OCR Fallback** — Tesseract.js pipeline for scanned PDF resumes
- [ ] **GitHub Portfolio Ingestion** — Live repo analysis cross-referenced during interview
- [ ] **Multi-Language Support** — i18n for non-English interview modes
- [ ] **WebRTC Full-Duplex Audio** — Barge-in interruption for native voice interviews
- [ ] **Interviewer / HR Dashboard** — Admin panel for reviewing candidate scorecards
- [ ] **Custom Question Bank** — Per-role/company question template editor

---

## 17. Contributing

### Workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes following the code standards below.

3. Run the full quality gate before pushing:
   ```bash
   npm run validate
   # Must pass: type-check, lint (0 warnings), unit tests, format check
   ```

4. For database schema changes, create a migration:
   ```bash
   npx prisma migrate dev --name describe_your_change
   # Commit the generated migration file alongside your schema changes
   ```

5. Submit a Pull Request to `main`. CI runs automatically.

### Code Standards

- **TypeScript strict mode** enforced — no `any`, no unused variables/parameters
- **ESLint zero-warnings** — all warnings are errors in CI
- **Prettier** formatting — run `npm run format` before committing
- **`server-only`** required at the top of every new server module
- **Zod schemas** required for all new API endpoint inputs and outputs
- **Structured logging** via `logger` / `createSessionLogger()` — no raw `console.log`
- **`AppError` subclasses** for all thrown errors in services/repositories

### Branch Naming

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Feature | `feat/short-description` | `feat/ocr-resume-fallback` |
| Bug Fix | `fix/short-description` | `fix/rate-limit-edge-case` |
| Migration | `db/migration-description` | `db/add-question-bank-table` |
| Docs | `docs/short-description` | `docs/api-reference-update` |

---

<div align="center">

Built with precision by **[Manoj Barmase](https://github.com/ManojBarmase)**

*Questions? Open an [issue](https://github.com/ManojBarmase/ai-interviewer-app/issues) or start a [discussion](https://github.com/ManojBarmase/ai-interviewer-app/discussions).*

</div>
