# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Added Content Security Policy (CSP), HSTS, CORP, COOP, and COEP security headers in `next.config.ts`.
- Implemented adversarial prompt injection sanitization (`sanitize-prompt-input.ts`) before LLM inference.
- Feature-flagged demo mode authentication behind `DEMO_MODE_ENABLED` environment variable.
- Added PII and credential redaction (emails, passwords, tokens, API keys, cookies) to structured Pino logger for GDPR & SOC2 compliance.

### Added
- Health check endpoint `GET /api/health` providing service status and latency checks.
- Sentry error monitoring and exception tracking integration for client, server, and edge runtimes.
- Role-Based Access Control (RBAC) authorization guard (`auth-guard.ts`).
- Pagination support in session repository (`SessionRepository.findPaginatedByUserId`).
- Comprehensive unit tests for `ChatService`, `ResumeParserService`, `SessionService`, and `AnalyticsService`.
- Database maintenance, health-check, and audit scripts (`db:migrate`, `db:studio`, `audit`, `health-check`) in `package.json`.

### Changed
- Environment validator (`env.ts`) now strictly verifies all required environment variables at server initialization with descriptive diagnostics.
- Upstash Redis rate limit failures are now explicitly logged with structured contextual telemetry instead of being silently ignored.
- Database persistence failures in evaluation workflow now report a graceful warning flag in API response rather than failing the entire evaluation.
- Changed `package.json` license to `UNLICENSED` with `private: true` and added strict All-Rights-Reserved copyright notice to protect proprietary portfolio code.

### Removed
- Removed permissive open-source `LICENSE` file to prevent unauthorized copying, redistribution, or plagiarism of personal portfolio codebase.
- Removed unused `@google/genai` and `@google/generative-ai` dependencies to streamline dependency footprint.

### Fixed
- Extracted demo user ID to shared constant (`DEMO_USER_ID`) across client, server, and auth proxy.
- Replaced boilerplate root layout metadata with production-ready, SEO-optimized OpenGraph and Twitter card tags.

### Documentation
- Completely rewritten `README.md` with comprehensive architecture flow, API reference, tech stack, and setup guides.
- Created `ARCHITECTURE.md` detailing system design principles, layer responsibilities, data flows, and database entity relationships.
- Created `CONTRIBUTING.md` outlining development standards, PR checklist, conventional commits, and error handling rules.
- Created `.env.example` documenting all configuration keys, defaults, and requirements.
- Created `prisma/README.md` with migration runbooks, connection pooling guidance, and database schema rationale.
