/**
 * Prisma Client — Singleton for Next.js
 *
 * ─── Why a singleton? (hot-reload problem) ───────────────────────────────────
 * `next dev` uses Turbopack's module hot-reload (Fast Refresh). On every file
 * save, changed modules are re-evaluated. Without a singleton, each re-eval
 * calls `new PrismaClient()`, which opens a new TCP connection pool to the DB.
 * After a few reloads the pool is exhausted and queries start timing out.
 *
 * The fix: store the client on `globalThis`. Unlike module-level variables,
 * `globalThis` survives hot-reload — a new PrismaClient is only created when
 * one doesn't already exist there.
 *
 * ─── Why only in development? ────────────────────────────────────────────────
 * In production (Node.js server / serverless function) the module is loaded
 * once per process/invocation and never hot-reloaded. Writing to `globalThis`
 * in production would hold the client alive across invocations on platforms
 * that reuse the Node.js process (e.g. long-running containers), which is
 * actually what we want — but it also prevents garbage-collection if the
 * connection is idle. In practice, most deployment platforms (Vercel, Fly.io)
 * recycle workers frequently enough that this is a non-issue, so we keep the
 * guard to `!== "production"` for clarity and to match Next.js convention.
 *
 * ─── Serverless / edge deployment considerations ─────────────────────────────
 * Prisma's generated client uses Node.js built-ins (`node:path`, `node:process`,
 * native `.node` query-engine binary) and therefore cannot run in the Edge
 * Runtime. Use it only in Node.js Server Components, Route Handlers, and
 * Server Actions — never in `"use client"` files or Edge routes.
 *
 * For serverless environments (Vercel Serverless Functions, AWS Lambda) where
 * each invocation may spin up a fresh process, connection exhaustion is handled
 * at the infrastructure level by the Supabase Transaction Pooler (PgBouncer):
 *   DATABASE_URL in .env.local → port 6543, ?pgbouncer=true
 * PgBouncer multiplexes many short-lived serverless connections onto a small
 * number of real Postgres connections, so each function invocation doesn't
 * permanently hold a connection open.
 *
 * ─── Log levels ──────────────────────────────────────────────────────────────
 * Development: query + warn + error  → full visibility into generated SQL
 * Production:  error only            → avoid leaking query internals to logs
 *
 * ─── Error format ────────────────────────────────────────────────────────────
 * "colorless" in production: avoids ANSI escape codes in structured log
 * aggregators (Datadog, CloudWatch, Grafana Loki) that don't strip color codes.
 *
 * ─── References ──────────────────────────────────────────────────────────────
 * • Next.js local-development guide:
 *     node_modules/next/dist/docs/01-app/02-guides/local-development.md
 * • Supabase + Prisma connection pooling:
 *     https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
 * • Prisma best practices for Next.js:
 *     https://www.prisma.io/docs/guides/nextjs
 */

import { PrismaClient } from "../../generated/prisma/client";
import type { Prisma } from "../../generated/prisma/client";

// ── Type augmentation for globalThis ─────────────────────────────────────────
// Declaring a typed property on globalThis avoids unsafe `any` casts and gives
// IDE autocomplete on the global prisma reference.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// ── Log configuration ─────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";

/**
 * In development, emit every query to the console so you can inspect the
 * generated SQL and spot N+1 problems early.
 *
 * LogDefinition (object form) is used instead of the shorthand string so we
 * can route `query` events to `stdout` and keep `error`/`warn` on `stderr`
 * (the default). Both forms are valid per the Prisma LogLevel | LogDefinition
 * union type — we use the object form for explicitness.
 */
const logConfig: Prisma.LogLevel[] = isDev
  ? ["query", "warn", "error"]
  : ["error"];

// ── Client factory ────────────────────────────────────────────────────────────
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: logConfig,

    /**
     * "colorless" strips ANSI color codes from error messages.
     *
     * "pretty" (default) is readable in a terminal but emits escape sequences
     * that appear as garbage in structured log aggregators. Switch to "minimal"
     * if you want machine-parseable single-line errors.
     */
    errorFormat: isDev ? "pretty" : "colorless",
  });
}

// ── Singleton export ──────────────────────────────────────────────────────────
/**
 * The application-wide Prisma client.
 *
 * @example Server Component
 * ```ts
 * import { prisma } from "@/lib/prisma";
 * const users = await prisma.user.findMany({ where: { isDeleted: false } });
 * ```
 *
 * @example Route Handler
 * ```ts
 * import { prisma } from "@/lib/prisma";
 * export async function GET() {
 *   const sessions = await prisma.session.findMany();
 *   return Response.json(sessions);
 * }
 * ```
 */
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

// Attach to globalThis in non-production environments so the instance survives
// hot-module replacement without opening a new DB connection pool each time.
if (!isDev) {
  // In production we do NOT store on globalThis — the module is evaluated once
  // per process lifetime and `prisma` above is already the singleton for this
  // process. Storing it would only cause confusion.
} else {
  globalThis.__prisma = prisma;
}
