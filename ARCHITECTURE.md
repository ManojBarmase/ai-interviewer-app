# Architecture Documentation — AI Interviewer App

This document provides a comprehensive technical breakdown of the architecture, design patterns, data flows, and security foundations implemented in the **AI Interviewer App**.

---

## 1. Enterprise Design Principles

The application is structured according to seven enterprise software architecture principles to ensure predictability, auditability, separation of concerns, and zero confidential data leakage:

1. **Server-Only Boundary Enforcement (`import 'server-only'`)**:
   All database clients, Prisma models, AI prompt generators, external SDK wrappers, and backend repositories explicitly import the `'server-only'` package at the top of the file. This creates an enforced build-time barrier preventing sensitive business logic or credentials from accidentally leaking into client-side JavaScript bundles.

2. **Layered Architecture (`Routes → Services → Repositories → Database`)**:
   The system maintains strict unidirectional dependency flow. Route handlers do not perform business operations or query the database directly. They delegate to business services, which in turn interface with isolated repositories. Repositories are the sole owners of Prisma queries.

3. **Repository Pattern for Data Access Abstraction**:
   Data access logic is completely abstracted behind static repository classes (`SessionRepository`, `ScorecardRepository`). This decouples data storage implementation details, query optimizations, soft-delete handling, and indexing constraints from domain business rules.

4. **Domain Error Hierarchy (`AppError` & Subclasses)**:
   The application avoids throwing untyped, generic errors. Instead, it utilizes a standardized `AppError` base class with specialized domain exceptions (`ValidationError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `RateLimitError`, `ExternalServiceError`). Every error carries an HTTP status code, machine-readable error code, and optional structured metadata.

5. **Centralized Error Handling (`handleApiError`)**:
   API route handlers route exceptions through a centralized error handler (`src/server/utils/api-response.ts`). This utility automatically determines the error type, formats standardized JSON failure envelopes, triggers Sentry exception tracking for unhandled failures, and logs structured diagnostic events through Pino without exposing internal stack traces in production.

6. **Structured Logging with Context (Pino Child Loggers)**:
   All server operations log structured JSON events via Pino. Child loggers created through `createSessionLogger(sessionId, context)` attach correlation IDs (`sessionId`, `userId`, `route`) to every log entry across the lifecycle of an interview turn or evaluation. Sensitive fields (passwords, tokens, PII, API keys) are masked at the logger engine level.

7. **Fail-Fast Environment Validation**:
   The application eliminates runtime configuration bugs through an immutable environment validation module (`src/lib/config/env.ts`). On server boot or build initialization, all mandatory environment variables (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `GROQ_API_KEY`, etc.) are validated, failing immediately with descriptive error messages if any are missing.

---

## 2. Layer Descriptions

### `src/app/api/` — Thin Route Handlers
This layer exposes Next.js App Router API route handlers (`route.ts`). Route handlers contain no domain business logic. Their responsibility is strictly limited to extracting incoming HTTP requests, authenticating callers via proxy tokens or session context, parsing and validating incoming payloads with Zod schemas, delegating to the appropriate service method, and serializing responses using standard helpers (`ok()`, `fail()`, or streaming SSE responses).

### `src/server/services/` — Business Logic Layer
The core business logic layer encapsulates all domain rules and workflows (such as `ChatService`, `EvaluationService`, `ResumeParserService`, `SessionService`, and `AnalyticsService`). Services do not execute direct database SQL queries; they communicate with repositories for persistence. Services are responsible for building system prompts, managing token streaming budgets, orchestrating multi-step scoring logic, validating external API contracts, and throwing typed `AppError` exceptions.

### `src/server/repositories/` — Data Access Layer
The repository layer (`SessionRepository`, `ScorecardRepository`) manages all persistence interactions with Prisma ORM. Repositories encapsulate complex database query logic, apply pagination, enforce soft-delete filters (`isDeleted: false`), execute transactions, and optimize composite index usage. No UI components or route handlers may invoke repositories directly.

### `src/server/integrations/` — Third-Party Service Clients
This layer isolates third-party external integrations and cloud services. It contains the Groq AI SDK client factory (`groq.client.ts`), prompt builders (`evaluation.prompt.ts`), and the Upstash Redis distributed sliding-window rate limiter (`ratelimit.ts`). It handles network connection timeouts, SDK instantiation with connection pooling, and external service communication errors.

### `src/features/` — Client-Side Feature Modules
Organized using a feature-sliced structure (`auth`, `dashboard`, `interview`, `scorecard`, `setup`), this layer contains React 19 UI components, interactive client hooks, and Zustand state machines. State management for active interviews (`useInterviewStore.ts`) maintains conversation messages, audio recording status, time tracking, and token streaming state in client memory.

### `src/lib/` — Shared Utilities & Cross-Cutting Concerns
Shared foundation utilities accessible across layers. This includes the Pino structured logger (`logger.ts`), environment validation schema (`config/env.ts`), domain constants and role definitions (`constants/index.ts`), Supabase SSR browser and server client factories (`supabase/`), and shared validation schemas (`validations/`).

### `src/proxy.ts` — Authentication Middleware & Route Protection
The Next.js 16 route proxy (renamed from `middleware.ts` per Next.js 16 conventions). Operating on the Node.js runtime, it inspects every matched incoming request, refreshes Supabase auth cookies via `getUser()`, guards against open-redirect vulnerabilities, validates guest demo sessions, and enforces access control by issuing 401 JSON responses for API routes or redirecting browser requests to `/login`.

---

## 3. Data Flow Diagrams

### Interview Chat Flow (Low-Latency Streaming SSE)

```
[Candidate Browser]
       │
       │ 1. User speaks / submits message (Web Speech API or typed input)
       ▼
[Zustand Store: useInterviewStore]
       │
       │ 2. Appends user message to state & triggers POST /api/interview/chat
       ▼
[Next.js 16 Proxy: src/proxy.ts]
       │
       │ 3. Verifies Supabase JWT or validates 24h demo session cookie
       ▼
[Route Handler: src/app/api/interview/chat/route.ts]
       │
       │ 4. Rate-limit check via Upstash Redis (sliding window per userId)
       │ 5. Validates payload via Zod & sanitizes against prompt injection
       ▼
[ChatService: src/server/services/chat.service.ts]
       │
       │ 6. Injects candidate resume summary, role, tech stack, and difficulty
       │ 7. Calls Groq LPU SDK (model: qwen/qwen3.8-27b) with stream: true
       ▼
[Groq AI LPU Cloud]
       │
       │ 8. Streams response tokens (<400ms Time-to-First-Token)
       ▼
[ReadableStream / SSE Transform]
       │
       │ 9. Emits text/event-stream chunks (`data: {"type":"chunk","text":"..."}`)
       ▼
[Client Browser UI]
       │
      10. Renders interviewer speech token-by-token with audio playback
```

---

### Evaluation & Scorecard Flow

```
[Candidate Browser]
       │
       │ 1. Candidate ends interview → triggers POST /api/interview/evaluate
       ▼
[Route Handler: src/app/api/interview/evaluate/route.ts]
       │
       │ 2. Authenticates user & parses session transcript payload
       ▼
[EvaluationService: src/server/services/evaluation.service.ts]
       │
       │ 3. Compiles structured evaluation prompt with full transcript & STAR guidelines
       │ 4. Sends prompt to Groq AI requesting structured JSON response
       ▼
[Groq AI Inference Engine]
       │
       │ 5. Returns raw JSON containing scorecard dimensions & narrative feedback
       ▼
[Evaluation Schema Validator: src/lib/validations/evaluation.ts]
       │
       │ 6. Strips markdown fences, parses JSON, and validates with Zod
       ▼
[ScorecardRepository: src/server/repositories/scorecard.repository.ts]
       │
       │ 7. Persists scorecard record with numeric scores & JSON breakdown
       ▼
[Prisma ORM 6.x]
       │
       │ 8. Executes parameterized INSERT into PostgreSQL
       ▼
[Supabase PostgreSQL Database]
       │
       │ 9. Scorecard committed; Session status marked COMPLETED
       ▼
[Response to Client]
      10. Returns validated scorecard object; UI renders analytics & radar chart
```

---

## 4. Database Schema Overview

The relational database layer is hosted on PostgreSQL via Supabase and managed using Prisma ORM migrations. All tables enforce four primary enterprise conventions:
- **UUID Primary Keys (`@db.Uuid`)**: Eliminates ID enumeration attacks and facilitates distributed creation.
- **Soft Deletes (`isDeleted Boolean`, `deletedAt DateTime?`)**: Ensures compliance with data retention and recovery policies.
- **Strict Postgres Enums**: Rejects unauthorized values at the database constraint level (`UserRole`, `SessionStatus`, `InterviewType`, `TranscriptStatus`, `HiringRecommendation`).
- **Composite Indexes**: Tailored for paginated multi-tenant queries (e.g., `[userId, isDeleted, createdAt]`).

### The 4 Core Entities

```
 ┌──────────────────────┐               ┌────────────────────────┐
 │        User          │ 1           * │        Session         │
 │──────────────────────│───────────────│────────────────────────│
 │ id: UUID (PK)        │               │ id: UUID (PK)          │
 │ email: String (UQ)   │               │ userId: UUID (FK)      │
 │ role: UserRole       │               │ interviewType: Enum    │
 │ name: String         │               │ status: SessionStatus  │
 │ isDeleted: Boolean   │               │ durationSeconds: Int   │
 └──────────────────────┘               └────────────────────────┘
            │ 1                                      │ 1
            │                                        │
            │ *                                      │ 1
 ┌──────────▼───────────┐               ┌────────────▼───────────┐
 │ InterviewTranscript  │ *           1 │       Scorecard        │
 │──────────────────────│───────────────│────────────────────────│
 │ id: UUID (PK)        │               │ id: UUID (PK)          │
 │ sessionId: UUID (FK) │               │ sessionId: UUID (FK,UQ)│
 │ userId: UUID (FK)    │               │ userId: UUID (FK)      │
 │ chunkIndex: Int      │               │ overallScore: Decimal  │
 │ audioStoragePath: Str│               │ technicalScore: Decimal│
 │ rawText: Text        │               │ communicationScore: Dec│
 │ confidenceScore: Dec │               │ recommendation: Enum   │
 └──────────────────────┘               └────────────────────────┘
```

1. **`User` (`users`)**:
   Represents candidates, interviewers, and platform administrators. Links to sessions, transcripts, and scorecards. Includes role-based access control flags.

2. **`Session` (`sessions`)**:
   Tracks individual interview engagements. Stores interview type (`TECHNICAL`, `BEHAVIOURAL`, `SYSTEM_DESIGN`, `HR`, `MIXED`), status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `EXPIRED`), scheduling timestamps, and total duration.

3. **`InterviewTranscript` (`interview_transcripts`)**:
   Stores sequential audio and text chunks for each turn within a session. Captures raw STT output, cleaned text, audio storage paths in Supabase Storage, sample rates, confidence scores, and speaker diarization metadata.

4. **`Scorecard` (`scorecards`)**:
   Maintains a 1-to-1 relationship with `Session`. Records evaluation dimension scores on a 0.0–10.0 scale (`technicalScore`, `communicationScore`, `problemSolvingScore`, `cultureFitScore`, `overallScore`), AI-generated strengths and weaknesses, detailed narrative feedback, and hiring recommendations (`STRONG_YES` through `STRONG_NO`).

---

## 5. Authentication Strategy

The platform employs a dual authentication model designed for both production security and friction-free user demonstrations:

### Supabase SSR Authentication (Production)
- **Cookie-Based Sessions**: Leverages `@supabase/ssr` to manage `access_token` and `refresh_token` cookies securely with `httpOnly`, `secure`, and `sameSite: 'lax'` attributes.
- **Stateless Validation via `getUser()`**: In accordance with Supabase and Next.js security best practices, the proxy and API routes call `supabase.auth.getUser()`, which validates the JWT directly against the Supabase auth service, guaranteeing revoked or tampered tokens are rejected.
- **Cache Invalidation**: Every session refresh applies `Cache-Control: private, no-store` headers to ensure edge caches never cache authenticated user payloads.

### Demo Session Pattern (Guest Access)
- **Feature Flagged**: Activated only when `DEMO_MODE_ENABLED=true` in server environment configuration.
- **Cookie Identification**: Issues a specialized `demo_candidate_session=true` cookie accompanied by a `demo_session_created_at` timestamp.
- **24-Hour Expiration & Self-Healing**: Automatically expires after 24 hours. The proxy auto-detects and clears stale demo cookies, redirecting candidates to renewal.
- **Fixed Identity Context**: Bound to a canonical `DEMO_USER_ID` (`00000000-0000-0000-0000-000000000001`), allowing guests to experience the complete live interview and scoring pipeline without database corruption.

---

## 6. AI Integration Architecture

### Ultra-Low Latency Inference with Groq LPU
Conversational interviews demand realistic human pacing. Standard cloud LLM endpoints exhibit latencies of 2.5–4.0 seconds, which disrupts dialogue. The AI Interviewer App integrates Groq's Language Processing Units (LPUs) using the `qwen/qwen3.8-27b` model to achieve `<400ms Time-to-First-Token (TTFT)`.

### Streaming Chat Architecture
- Route: `POST /api/interview/chat`
- The `ChatService` assembles conversation history and applies system instructions detailing interviewer persona, pacing, and probing depth.
- Injects resume text and interview configuration into the system context.
- Sanitizes incoming user messages against adversarial prompt injections (`ignore previous instructions`, delimiter attacks, system role overrides).
- Leverages Server-Sent Events (SSE) to push token deltas to the client immediately upon generation by the LPU.

### Structured Post-Interview Evaluation
- Route: `POST /api/interview/evaluate`
- The `EvaluationService` submits the complete dialogue transcript, candidate context, and STAR rubric criteria to Groq.
- The model is instructed to output a structured JSON evaluation document.
- The raw response passes through a sanitization step that removes any unexpected markdown code fences (` ```json `), followed by rigorous schema validation with Zod (`src/lib/validations/evaluation.ts`).
- If parsing or validation fails, structured errors are returned without crashing the service, ensuring reliable persistence in `ScorecardRepository`.

---

## 7. Database Migration & Seeding Strategy

To ensure zero downtime, deterministic deployments, and rapid local or staging onboarding, the application enforces a dual migration and seeding lifecycle managed by Prisma ORM and TypeScript.

### 7.1. Database Migration Lifecycle

The application distinguishes strictly between schema development and production releases:

1. **Local Schema Development (`prisma migrate dev`)**:
   - Used exclusively during local feature engineering.
   - Generates sequential, version-controlled SQL migration scripts in `prisma/migrations/`.
   - Automatically synchronizes Prisma Client types via `prisma generate`.

2. **Automated CI/CD & Production Releases (`prisma migrate deploy` / `npm run db:migrate`)**:
   - Executed during production build and continuous deployment pipelines (e.g., GitHub Actions, Vercel Build Step).
   - Never regenerates migrations or prompt for interactive input.
   - Applies pending migration files in transactional batches against the Supabase database.
   - Strictly enforces backwards compatibility: breaking column renames or table drops must be phased over multiple releases (expand-contract pattern) to prevent disruptions to active serverless instances.

3. **PgBouncer & Connection Pooling in Production**:
   - Serverless invocations connect via the Supabase PgBouncer transaction pooler (port 6543) with `?pgbouncer=true&connection_limit=1`.
   - Direct migrations and schema operations (`prisma migrate deploy`, `db push`) bypass PgBouncer and connect via direct session mode (port 5432) to support transactional DDL locks (`advisory_lock`).

### 7.2. Reproducible Database Seeding (`prisma/seed.ts`)

The database seeding pipeline (`npx prisma db seed` / `npm run db:seed`) provides a deterministic, automated way to populate environments with production-shaped test data for developer onboarding, end-to-end testing, and staging demonstrations.

#### Architecture & Configuration
- **Execution Engine**: Configured in `package.json` via `"prisma": { "seed": "tsx prisma/seed.ts" }`, executing modern TypeScript natively via `tsx` without precompilation overhead.
- **Idempotency Guarantee**: Every record utilizes deterministic UUID primary keys or unique constraint lookups (`prisma.<model>.upsert`). Re-running the seed script is guaranteed to be non-destructive and side-effect free, safely updating existing entities rather than duplicating rows or violating unique constraints.
- **Connection Safety**: Prisma client lifecycle is safely wrapped in `.then()` and `.catch()` blocks with guaranteed `prisma.$disconnect()` calls to eliminate hung database connections or PgBouncer pool starvation.

#### Seeded Datasets
The seed pipeline establishes complete, multi-tiered domain data:

| Entity Type | Record Identifier / Title | Role / Type | Primary Signal / Characteristics |
|---|---|---|---|
| **User** | `demo@ai-interviewer.local` | `CANDIDATE` | Demo applicant for mock sessions and UI tests |
| **User** | `interviewer@ai-interviewer.local` | `INTERVIEWER` | Senior Staff interviewer persona assigned to evaluations |
| **User** | `admin@ai-interviewer.local` | `ADMIN` | Platform administrator with full audit permissions |
| **Session & Scorecard** | Senior Frontend Architecture & React 19 Performance | `TECHNICAL` | Score: **8.9 / 10** (`STRONG_YES`) — Mastery over React 19 RSC, INP profiling, and streaming SSR |
| **Session & Scorecard** | Real-Time Collaborative Document Canvas Engine | `SYSTEM_DESIGN` | Score: **7.5 / 10** (`YES`) — CRDT state synchronization, WebSocket clustering, Redis Pub/Sub |
| **Session & Scorecard** | Leadership, Prioritization & Conflict Resolution | `BEHAVIOURAL` | Score: **6.4 / 10** (`NEUTRAL`) — Commercial compromise negotiation, STAR framework development |

Each seeded session is populated with multi-turn `InterviewTranscript` chunks containing confidence scores, speaker diarization metadata, and full STAR dimension breakdowns (`dimensionBreakdown` JSON and numeric rating vectors).

