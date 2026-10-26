# Engineering & Development Standards Guide

> **Note for Reviewers & Recruiters:**  
> This repository is a **personal showcase project** authored by Manoj Barmase and is **not open to public contributions, external forks for redistribution, or pull requests**.  
> This document details the enterprise software engineering standards, conventional commit specifications, code quality gates, and architectural disciplines followed during the design and development of this platform.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. All contributors, maintainers, and community members are expected to adhere to the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html).

Instances of abusive, harassing, or otherwise unacceptable behavior should be reported to the repository maintainers.

---

## 2. Development Workflow

### Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Git**
- **Docker** (optional, for local PostgreSQL if not using Supabase cloud)

### Step-by-Step Workflow

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/ManojBarmase/ai-interviewer-app.git
   cd ai-interviewer-app
   ```

2. **Install Dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```
   *(The `postinstall` script automatically runs `prisma generate` to build client types.)*

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env.local
   ```
   Populate `.env.local` with your development keys (Supabase, Groq AI, Upstash Redis). Never commit `.env.local` or any secrets to Git.

4. **Prepare Database Migrations**:
   ```bash
   npm run db:migrate
   ```

5. **Create a Feature Branch**:
   Always branch off `main` using descriptive prefix conventions:
   - `feat/feature-name` — New feature or capability
   - `fix/bug-description` — Defect resolution
   - `chore/task-name` — Maintenance, tooling, or dependency updates
   - `docs/topic-name` — Documentation improvements or additions

   Example:
   ```bash
   git checkout -b feat/custom-prompt-templates
   ```

---

## 3. Commit Message Format

This repository strictly enforces [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). All commit messages must follow this structure:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

| Type | Description | Example |
| :--- | :--- | :--- |
| `feat` | A new user-facing or platform feature | `feat(interview): add realtime speech-to-text token stream` |
| `fix` | A bug fix | `fix(auth): prevent cookie expiration race condition in demo session` |
| `chore` | Maintenance, dependencies, or configuration changes | `chore(deps): update prisma to v6.19.3` |
| `test` | Adding missing tests or correcting existing tests | `test(services): add unit tests for ResumeParserService` |
| `docs` | Documentation updates only | `docs(readme): add architecture flow diagram and api docs` |
| `refactor` | Code changes that neither fix a bug nor add a feature | `refactor(logger): implement pii redaction rules` |
| `perf` | Code changes that improve performance | `perf(groq): streamline system prompt token length` |

---

## 4. Pull Request Requirements Checklist

Before submitting a Pull Request, verify that your branch satisfies all items:

- [ ] **Tests Passing**: All unit and integration tests pass cleanly (`npm run test`).
- [ ] **Type Check Clean**: Zero TypeScript compiler errors (`npm run type-check`).
- [ ] **Lint Clean**: ESLint passes with **zero warnings** (`npm run lint`).
- [ ] **Format Clean**: Prettier checks pass (`npm run format:check`).
- [ ] **Test Coverage**: Any new business logic or service methods have corresponding unit tests meeting minimum coverage thresholds (80% lines/functions/statements, 70% branches).
- [ ] **Server-Only Boundaries**: Any server-side files (services, repositories, database models) include `import 'server-only'` at the top.
- [ ] **Zod Validation**: All new API endpoints validate request inputs and responses with Zod schemas.
- [ ] **Domain Error Handling**: Thrown errors utilize `AppError` subclasses.
- [ ] **Zero Hardcoded Secrets**: Secrets and environment variables are strictly accessed via `@/lib/config/env`.
- [ ] **No Console Logs**: Production-bound code does not contain raw `console.log` statements; structured logging via `logger` or `createSessionLogger` is used instead.

---

## 5. Running the Full Quality Gate

You must run the complete validation suite prior to pushing commits:

```bash
npm run validate
```

This single command executes in order:
1. `npm run type-check` (`next typegen && tsc --noEmit`)
2. `npm run lint` (`eslint src --max-warnings=0`)
3. `npm run test` (`vitest run`)
4. `npm run format:check` (`prettier --check "src/**/*.{ts,tsx,css,json,md}"`)

To automatically fix formatting or lint issues:
```bash
npm run format
npm run lint:fix
```

---

## 6. How to Add a New API Endpoint

Follow this step-by-step enterprise pattern to add new functionality:

### Step 1: Create or Extend a Repository (Data Layer)
If database queries are required, implement data access in `src/server/repositories/`:
```typescript
import 'server-only';
import { prisma } from '@/server/db/prisma';

export class FeatureRepository {
  static async findById(id: string) {
    return prisma.session.findUnique({ where: { id } });
  }
}
```

### Step 2: Implement the Service (Business Logic Layer)
Encapsulate business logic in `src/server/services/`. Never query Prisma directly from a service if a repository exists:
```typescript
import 'server-only';
import { AppError, NotFoundError } from '@/server/errors/AppError';
import { FeatureRepository } from '@/server/repositories/feature.repository';

export class FeatureService {
  static async processFeature(id: string) {
    const item = await FeatureRepository.findById(id);
    if (!item) {
      throw new NotFoundError(`Item with ID ${id} not found`);
    }
    return item;
  }
}
```

### Step 3: Write Unit Tests
Add tests in `src/server/services/__tests__/feature.service.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { FeatureService } from '../feature.service';
import { FeatureRepository } from '@/server/repositories/feature.repository';

vi.mock('@/server/repositories/feature.repository');

describe('FeatureService', () => {
  it('throws NotFoundError if item does not exist', async () => {
    vi.mocked(FeatureRepository.findById).mockResolvedValue(null);
    await expect(FeatureService.processFeature('missing-id')).rejects.toThrow();
  });
});
```

### Step 4: Implement Route Handler
Create a thin route handler in `src/app/api/.../route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, handleApiError } from '@/server/utils/api-response';
import { FeatureService } from '@/server/services/feature.service';

const requestSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { id } = requestSchema.parse(json);
    const result = await FeatureService.processFeature(id);
    return ok(result);
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/feature' });
  }
}
```

---

## 7. Enterprise Rules to Follow

1. **Always Use `AppError` Subclasses**:
   Never throw plain `new Error('...')` in server services. Throw appropriate subclasses from `@/server/errors/AppError`:
   - `ValidationError` (422)
   - `BadRequestError` (400)
   - `UnauthorizedError` (401)
   - `ForbiddenError` (403)
   - `NotFoundError` (404)
   - `RateLimitError` (429)
   - `ExternalServiceError` (502)

2. **Always Use `createSessionLogger()` for Contextual Logging**:
   When handling requests, instantiate or derive a child logger with correlation context (`sessionId`, `userId`, `route`) so all log entries are traceable in APM/log aggregators:
   ```typescript
   import { createSessionLogger } from '@/lib/logger';
   const log = createSessionLogger(sessionId, { userId, action: 'submit_turn' });
   log.info('Processing turn input');
   ```

3. **Always Validate Request Payloads with Zod at the Route Level**:
   Never assume client payloads match expected types. Parse inputs with Zod before delegating to the service layer.

4. **Always Import Environment Variables Through `@/lib/config/env`**:
   Never access `process.env.VAR_NAME` directly in application logic. The centralized `@/lib/config/env` module provides runtime validation, fail-fast verification, and compiler inlining for public variables.

5. **Always Write Unit Tests for New Service Methods**:
   Every new method added to `src/server/services/` must have accompanying unit test suites in `__tests__/` verifying both happy paths and edge cases / error handling.
