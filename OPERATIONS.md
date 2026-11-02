# Enterprise SRE Operations Runbook & Disaster Recovery

This operations manual defines standard operating procedures (SOPs), incident severity tiers, and actionable recovery runbooks for Site Reliability Engineers (SREs), DevOps engineers, and on-call developers supporting the **AI Interviewer** platform.

---

## 1. Incident Classification & Escalation Matrix

| Severity | Definition | Target MTTD (Detection) | Target MTTR (Resolution) | Escalation Channel |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core application down; PostgreSQL unreachable or corrupt; complete interview flow blocked. | < 5 minutes | < 30 minutes | PagerDuty On-Call + Lead Architect ([@ManojBarmase](https://github.com/ManojBarmase)) |
| **SEV-2 (High)** | Upstream AI engine (Groq) down; Redis rate limiter outage; evaluation scoring delayed. | < 15 minutes | < 2 hours | Slack `#sre-incidents` + Engineering On-Call |
| **SEV-3 (Medium)** | Degraded performance; non-blocking resume parsing failure; isolated user authentication errors. | < 1 hour | < 8 hours | Jira High Priority Ticket |
| **SEV-4 (Low)** | Minor cosmetic UI telemetry discrepancy, non-impacting background job error. | < 24 hours | Next Release | Regular Sprint Backlog |

---

## 2. Infrastructure & Service Dependency Map

```mermaid
graph TD
    Client[Candidate & Interviewer Clients] --> Ingress[Kubernetes / Vercel Ingress]
    Ingress --> Proxy[Next.js App & Auth Proxy /src/proxy.ts]
    
    subgraph State & Cache Tier
        Proxy -->|Session Auth| SupabaseAuth[Supabase Auth GoTrue]
        Proxy -->|Rate Limits & Idempotency| UpstashRedis[Upstash Redis / Vercel KV]
        Proxy -->|Transaction Pooler port 6543| PgBouncer[Supabase PgBouncer Pooler]
        PgBouncer --> Postgres[(PostgreSQL Primary DB)]
    end

    subgraph Intelligence Tier
        Proxy -->|Chat & Evaluation Inference| GroqAI[Groq Cloud LLM Engine]
    end

    subgraph Observability
        Proxy -.-> Sentry[Sentry Error Tracking]
        Proxy -.-> HealthEndpoint[/api/health & /api/health/ready]
    end
```

---

## 3. Incident Runbook 1: Groq AI Outage & Rate-Limit Failover

### Symptoms & Detection
- Alert: `GroqAIInferenceFailureRate > 5%` in Sentry.
- Endpoint `/api/health` reports `"status": "degraded"` with `services.groq.status: "error"`.
- Candidate evaluations fail with HTTP 502/504 or error message: `Groq AI evaluation failed: 429 Rate limit exceeded`.

### Architecture & Graceful Degradation
The application implements resilient isolation around AI inference:
1. **Evaluation Decoupling**: If Groq fails during `/api/interview/evaluate`, interview session transcripts remain securely saved in PostgreSQL. The evaluation failure flag `isAiDegraded: true` is set, allowing candidate transcripts to be re-evaluated asynchronously once Groq recovers.
2. **Deterministic Timeouts**: Calls to Groq are hard-capped at 60 seconds (`timeoutMs = 60000`) preventing server thread locking.

### SRE Action Steps

1. **Verify Groq Status Page**: Check [https://status.groq.com](https://status.groq.com).
2. **Inspect Current Rate Limit Headers**:
   ```bash
   curl -i -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
   ```
   Check `x-ratelimit-remaining-tokens` and `retry-after` in response headers.
3. **Execute Emergency Model Failover**:
   If the default evaluation model `qwen/qwen3.8-27b` is experiencing regional capacity constraints, update the model parameter in `src/server/integrations/ai/groq.client.ts` to fallback versatile models:
   ```ts
   // Fallback models in priority order:
   // 1. 'llama-3.3-70b-versatile'
   // 2. 'llama-3.1-8b-instant'
   ```
4. **Rotate to Backup Secondary API Key**:
   If team rate-limit tier is exhausted, rotate `GROQ_API_KEY` in environment secrets:
   ```bash
   # Kubernetes secret update
   kubectl create secret generic app-secrets --from-literal=GROQ_API_KEY=gsk_backup_key_... --dry-run=client -o yaml | kubectl apply -f -
   kubectl rollout restart deployment/ai-interviewer
   ```

---

## 4. Incident Runbook 2: PostgreSQL Connection Pool Exhaustion

### Symptoms & Detection
- Alert: `DatabaseConnectionTimeout` or Prisma Error `P2024: Timed out fetching a connection from the pool`.
- Endpoint `/api/health/ready` returns **HTTP 503 Service Unavailable** with `"services.database.status": "error"`.
- Kubernetes readiness probe removes pods from traffic rotation.

### Root Causes
- Micro-containers connecting directly to PostgreSQL port `5432` instead of Supabase PgBouncer transaction pooler port `6543`.
- Missing connection limit parameter: `?pgbouncer=true&connection_limit=1`.
- Long-running unindexed queries holding connection slots open.

### SRE Action Steps

1. **Verify Connection String Configuration**:
   Ensure `DATABASE_URL` strictly points to port `6543` and includes transaction pooling flags:
   ```env
   # CORRECT (Transaction Pooler Mode):
   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
   
   # INCORRECT (Direct Connection - exhausts pool):
   DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
   ```

2. **Inspect & Terminate Rogue Connections**:
   Log into the Supabase SQL console or run via `psql`:
   ```sql
   -- View active connections and query runtimes
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC;

   -- Terminate hung connections older than 5 minutes
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
     AND pid <> pg_backend_pid();
   ```

3. **Verify Pool Health with In-Process Probe**:
   ```bash
   npm run health-check
   ```

---

## 5. Incident Runbook 3: Redis / Upstash Cache Outage

### Symptoms & Detection
- Alert: `UpstashClusterUnreachable` or Redis socket timeout in logs.
- Endpoint `/api/health` indicates `services.cache.status: "error"`.
- Rate limiting log message: `Rate limiter unavailable — failing open`.

### Built-in Fault Tolerance (Fail-Open Architecture)
1. **Rate Limiting Fail-Open**: In accordance with enterprise SLA principles, an Upstash outage **never** blocks candidate interview responses. `src/server/utils/apply-rate-limit.ts` catches Redis connection exceptions and fails open with structured warning telemetry (`logger.warn({ tier, route }, 'Rate limiter unavailable — failing open')`).
2. **In-Memory Idempotency Fallback**: `src/server/utils/idempotency.ts` detects Redis unavailability and automatically routes lock acquisition to an in-memory `Map` store with local TTL expiration.

### SRE Action Steps

1. **Verify Upstash Status**: Check [https://status.upstash.com](https://status.upstash.com).
2. **Ping Redis Endpoint Directly**:
   ```bash
   curl -s -H "Authorization: Bearer $KV_REST_API_TOKEN" "$KV_REST_API_URL/ping"
   # Expected response: {"result":"PONG"}
   ```
3. **If Token Revoked or Expired**:
   Generate fresh REST credentials from the Upstash console and update `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. **Monitor Concurrency Spikes**:
   During the fail-open window, monitor ingress request volume via load balancer metrics to ensure no bot DDoS traffic is exploiting the bypassed rate limits.

---

## 6. Incident Runbook 4: Database Migration Rollback Procedure

When a Prisma schema migration introduces breaking changes or fails mid-deployment:

### Scenario A: Migration Failed Mid-Execution (`failed` migration lock in `_prisma_migrations`)

1. **Check Migration Status**:
   ```bash
   npx prisma migrate status
   ```
2. **Inspect the Failed Migration**:
   Connect to the database and inspect `_prisma_migrations` table:
   ```sql
   SELECT id, migration_name, started_at, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
   ```
3. **Manually Revert Applied Changes**:
   Execute the manual inverse SQL statements (e.g., `DROP TABLE IF EXISTS ...`, `DROP COLUMN IF EXISTS ...`) using the down-migration script corresponding to that migration.
4. **Mark Migration as Rolled Back in Prisma History**:
   ```bash
   npx prisma migrate resolve --rolled-back "20261027_migration_name"
   ```
5. **Re-Verify Migration State**:
   ```bash
   npx prisma migrate status
   # Expected: "Database schema is up to date!"
   ```

### Scenario B: Production Emergency Schema Rollback

If a migration was successfully applied but introduces severe application regression:

1. **Isolate Traffic (Readiness Failure)**:
   Point traffic to the previous blue/green deployment release.
2. **Generate Inverse Down Migration**:
   Review the SQL in `prisma/migrations/<migration_folder>/migration.sql` and author an inverse script `down.sql`.
3. **Apply the Down Script**:
   ```bash
   psql "$DATABASE_URL" -f down.sql
   ```
4. **Synchronize Prisma History**:
   ```bash
   npx prisma migrate resolve --rolled-back "<migration_name>"
   ```
5. **Deploy Rollback Application Build**:
   Revert the Git commit that introduced the breaking schema and trigger the CI/CD deployment pipeline.

---

## 7. Telemetry & Probe Reference

| Endpoint | Probe Target | Expected Status | SRE Action on Failure |
| :--- | :--- | :--- | :--- |
| **`GET /api/health`** | Deep diagnostics (DB, Redis, Groq, Auth, System Telemetry) | `200 OK` (ok / degraded) | Inspect `services` object; check failing service runbook. |
| **`GET /api/health/ready`** | Stateful dependencies (Postgres + Redis) | `200 OK` (ready) | Service will not receive ingress traffic. Check DB and Redis. |
| **`GET /api/health/live`** | Node.js process responsiveness | `200 OK` (ok) | Kubernetes will restart container if unresponsive for 3 retries. |

### Running Local/CLI Telemetry Diagnostics
```bash
# Direct in-process or HTTP CLI probe runner
npm run health-check
```
