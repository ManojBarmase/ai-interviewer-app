# Security Policy

The AI Interviewer engineering team is committed to ensuring the safety, confidentiality, and integrity of candidate data, system telemetry, and proprietary interview evaluation logic. We adhere to industry best practices, including SOC2 Type II principles and GDPR data privacy mandates.

---

## 1. Supported Versions

Security updates, hotfixes, and dependency vulnerability patches are actively maintained for the following versions:

| Version | Supported          | Security SLA Status | Notes |
| :--- | :--- | :--- | :--- |
| **`1.x.x`** | :white_check_mark: Yes | **Active Support** | Current production release line |
| `< 1.0.0` | :x: No | End of Life (EOL) | Upgrade immediately to v1.x.x |

---

## 2. Responsible Disclosure Policy & Vulnerability Reporting

If you discover a security vulnerability, architectural flaw, credential exposure, or exploit within this codebase or deployed instances, **please report it to us privately**. Do **NOT** open public GitHub issues, discussions, or pull requests for security vulnerabilities.

### Primary Reporting Channel
- **Email:** `manojbarmase9@gmail.com`
- **Security Contact:** Lead Architect & Security Lead ([@ManojBarmase](https://github.com/ManojBarmase))
- **Subject Header:** `[SECURITY] Vulnerability Report: <Brief Description>`
- **Optional PGP:** If your report contains sensitive exploit payloads or private vulnerability data, you may request our PGP public key prior to transmission.

### Information to Include in Your Report
To accelerate validation and triage, please include:
1. **Description & Impact**: A concise summary of the issue, severity assessment (CVSS 3.1 estimation), and potential blast radius.
2. **Steps to Reproduce**: Detailed reproduction steps, curl commands, HTTP requests, or proof-of-concept (PoC) code.
3. **Affected Components**: Endpoint routes (`/api/*`), middleware/proxy paths (`/src/proxy.ts`), database schemas, or dependencies.
4. **Remediation Ideas**: Recommended mitigation or code patch if known.

---

## 3. Vulnerability Response Service Level Agreements (SLAs)

We enforce strict response and remediation SLAs based on Common Vulnerability Scoring System (CVSS) ratings:

| Severity Level | CVSS Score | Initial Acknowledgment | Triage & Assessment | Remediation / Patch SLA |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | 9.0 – 10.0 | **< 24 hours** | **< 48 hours** | **< 72 hours** (Emergency Hotfix) |
| **HIGH** | 7.0 – 8.9 | **< 24 hours** | **< 48 hours** | **< 7 calendar days** |
| **MEDIUM** | 4.0 – 6.9 | **< 48 hours** | **< 5 business days**| **< 30 calendar days** |
| **LOW** | 0.1 – 3.9 | **< 72 hours** | **< 10 business days**| Next Scheduled Release (~90 days) |

### Coordinated Disclosure Process
1. **Receipt & Acknowledgment**: You will receive written confirmation of your submission within the acknowledgment window.
2. **Investigation & Reproducibility**: The engineering team verifies the vulnerability in a private staging environment.
3. **Patch Development & Testing**: Fixes are authored in private forks, validated through automated CI security audits and unit suites.
4. **Coordinated Release & Credit**: Once the patch is deployed to production, we issue a public security advisory, credit the security researcher (if desired), and publish release notes.

---

## 4. Safe Harbor Policy

We consider ethical security research conducted under this policy to be authorized. We will **NOT** initiate legal action against researchers who:
- Act in good faith to avoid privacy violations, data destruction, degradation of service, or disruption of user access.
- Refrain from accessing, downloading, or exfiltrating user data beyond what is strictly necessary to demonstrate the vulnerability.
- Promptly report findings without sharing them publicly before the remediation window concludes.
- Comply with all applicable data protection laws (e.g., GDPR, CCPA).

---

## 5. Built-in Security Architecture & Defense-in-Depth

The application implements defense-in-depth across every architectural tier:

### A. Authentication & Route Protection (`src/proxy.ts`)
- Edge-level proxy route guarding on `/dashboard/**` and `/api/interview/**`.
- Cryptographically signed demo sessions using HMAC-SHA256 (`src/lib/auth/demo-session.ts`).
- Server-side JWT re-validation via `supabase.auth.getUser()` on every Route Handler to prevent session spoofing.

### B. Cryptographic PII Field-Level Encryption (`src/server/utils/crypto.ts`)
- Sensitive interview transcripts, scores, and candidate identities are encrypted using **AES-256-GCM** with authenticated 128-bit integrity tags.
- Data remains encrypted at rest within PostgreSQL storage.

### C. Adversarial LLM Prompt Injection Defense (`src/server/utils/sanitize-prompt-input.ts`)
- Candidate responses, resumes, and system prompts are screened for known jailbreak vectors (e.g., `system instructions override`, `ignore previous constraints`).

### D. Hardened HTTP Security Headers (`next.config.ts`)
- **Strict Content Security Policy (CSP)** restricting scripts, styles, connections, and framing (`frame-ancestors 'none'`).
- **HTTP Strict Transport Security (HSTS)** with `max-age=31536000; includeSubDomains; preload`.
- **Cross-Origin Protections**: `COOP`, `COEP`, `CORP`, and `X-Content-Type-Options: nosniff`.

### E. Rate Limiting & Denial-of-Service Defense (`src/server/integrations/cache/ratelimit.ts`)
- Distributed sliding-window rate limiting on Upstash Redis with tiered route quotas:
  - Natural conversation: 60 requests / 10 minutes.
  - Evaluation generation: 5 requests / 10 minutes.
  - Resume parsing: 5 requests / 15 minutes.
  - General API: 30 requests / 5 minutes.

### F. SOC2 PII Redaction & Structured Logging (`src/lib/logger.ts`)
- Zero PII leaks: emails, passwords, tokens, API keys, cookies, and bearer credentials are automatically masked by Pino log formatters.
