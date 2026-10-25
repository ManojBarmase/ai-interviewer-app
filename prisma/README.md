# Prisma Database & Migration Guide

This document describes database workflow conventions, migration lifecycle management, and querying standards for the AI Interviewer App using PostgreSQL (Supabase) and Prisma ORM.

---

## 1. Development Migrations

When modifying `prisma/schema.prisma` in your local development environment:

```bash
npx prisma migrate dev --name <description>
```

**Example:**
```bash
npx prisma migrate dev --name add_session_feedback_field
```

**What this does:**
1. Compares your `schema.prisma` to existing migrations.
2. Generates a new SQL migration file under `prisma/migrations/<timestamp>_<description>/migration.sql`.
3. Applies the migration to your development database.
4. Regenerates the Prisma Client (`@prisma/client`) with updated TypeScript typings.

---

## 2. Production Migrations

To apply pending database migrations in staging, CI/CD, or production:

```bash
npx prisma migrate deploy
```

**Key properties:**
- Non-interactive and safe for deployment pipelines.
- Applies all migrations that have not yet been executed against the target database.
- Does not generate new migration files or reset existing data.
- Never runs during `next build`; execute it in a deployment hook, CI release job, or container entrypoint prior to serving traffic.

---

## 3. Reset Development Database

If your local development database falls into an inconsistent state or you need a clean slate:

```bash
npx prisma migrate reset
```

**What this does:**
1. Drops the current development database/schema.
2. Re-creates the database from scratch.
3. Applies all migration files in order.
4. Executes seed scripts (if configured) and regenerates Prisma Client.

> **Note:** Only use this command locally or on isolated ephemeral staging environments.

---

## 4. Viewing Database in Prisma Studio

To inspect, query, and manage database records through an interactive browser UI:

```bash
npx prisma studio
```

By default, Prisma Studio launches at `http://localhost:5555`. It allows you to:
- Inspect tables, rows, relationships, and metadata.
- Safely test data filtering and sorting.
- Validate that soft-deleted records have `isDeleted: true` and `deletedAt` set.

---

## 5. Soft-Delete Convention

This project adheres to a strict **soft-delete** convention across core business models (e.g., `User`, `Session`, `Scorecard`) to prevent irreversible data loss and maintain historical auditability.

### Schema Fields
Every soft-deletable model includes:
```prisma
isDeleted Boolean   @default(false) @map("is_deleted")
deletedAt DateTime? @map("deleted_at")
```

### Querying Rules
1. **Reads / Listing Queries:** Always filter out soft-deleted records unless explicitly auditing:
   ```typescript
   const sessions = await prisma.session.findMany({
     where: {
       userId,
       isDeleted: false,
     },
   });
   ```
2. **Deletions:** Never call `prisma.<model>.delete()` directly in user-facing endpoints. Instead, update the soft-delete metadata:
   ```typescript
   await prisma.session.update({
     where: { id: sessionId },
     data: {
       isDeleted: true,
       deletedAt: new Date(),
     },
   });
   ```
3. **Indexing:** Use composite indexes (such as `@@index([isDeleted, createdAt])`) to optimize selective reads without incurring excessive index size overhead on low-cardinality boolean fields.

---

## 6. Production Safety Warning

> ⚠️ **CRITICAL WARNING:** Never use `--force-reset` or `npx prisma migrate reset` in production!
>
> Running `--force-reset` or `migrate reset` will **immediately drop all database tables and permanently destroy all production data**, including user profiles, scheduled interviews, transcripts, and evaluation scorecards.
>
> For production database schema updates, **ALWAYS** use:
> ```bash
> npx prisma migrate deploy
> ```
