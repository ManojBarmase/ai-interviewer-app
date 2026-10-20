'use client';

import { useState, useMemo, useCallback } from 'react';

import { useRouter } from 'next/navigation';

import {
  Search,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Mic,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'Technical' | 'System design' | 'Coding' | 'Behavioral';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  topic: string;
  text: string;
  hint: string;
  keyConcepts: string[];
  modelAnswer: string;
  roles: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'All',
  'Technical',
  'System design',
  'Coding',
  'Behavioral',
] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const DIFFICULTIES = ['Any', 'Easy', 'Medium', 'Hard'] as const;
type DifficultyFilter = (typeof DIFFICULTIES)[number];

const ROLES = [
  'All roles',
  'Frontend Engineer',
  'Backend Engineer',
  'Full Stack Engineer',
  'DevOps',
  'Data Engineer',
] as const;
type RoleFilter = (typeof ROLES)[number];

const DIFF_STYLES: Record<Difficulty, string> = {
  easy: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  hard: 'bg-red-500/15 text-red-400 border border-red-500/20',
};

const CAT_STYLES: Record<Category, string> = {
  Technical: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
  'System design':
    'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  Coding: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
  Behavioral: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
};

const LS_KEY = 'qb_saved_questions';

// ─── 48 curated questions ────────────────────────────────────────────────────

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Rendering performance',
    text: 'A React dashboard feels sluggish after a new feature shipped. How would you find and fix the cause?',
    hint: 'Start with measurement, then the cheapest high-impact fix.',
    keyConcepts: [
      'profiler',
      're-render',
      'memo',
      'virtualization',
      'bundle',
      'lazy',
      'measure',
      'web vitals',
    ],
    modelAnswer:
      'Measure first with the React Profiler and browser performance panel to find what re-renders and which tasks block the main thread. Then fix the biggest offenders with memoization, state colocation, list virtualization or code splitting, and confirm with before and after Web Vitals.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q2',
    category: 'Technical',
    difficulty: 'easy',
    topic: 'Browser fundamentals',
    text: 'Walk me through what happens between typing a URL and seeing a rendered page.',
    hint: 'Cover DNS, TCP, TLS, HTTP, HTML parsing, CSSOM, render tree, paint.',
    keyConcepts: [
      'DNS',
      'TCP',
      'TLS',
      'HTTP',
      'HTML parsing',
      'CSSOM',
      'render tree',
      'paint',
    ],
    modelAnswer:
      'DNS resolves the hostname, TCP + TLS handshake establishes a secure connection, the browser sends an HTTP request and receives the HTML. It parses HTML into a DOM, fetches and parses CSS into a CSSOM, combines them into a render tree, runs layout, then paints pixels to the screen. JS can block this pipeline unless deferred or async.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q3',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'State management',
    text: 'How do you decide where state should live in a large front-end application?',
    hint: 'Start local, move up only when needed; distinguish server vs. client state.',
    keyConcepts: [
      'colocation',
      'lifting state',
      'server state',
      'client state',
      'context',
      'Zustand',
      'React Query',
    ],
    modelAnswer:
      'Colocate state as close to its consumers as possible. Lift only when siblings need it. Use a server-state library (React Query / SWR) for data fetching and caching to avoid duplicating network state in global stores. Use global stores (Zustand, Redux) only for truly cross-cutting UI state like auth or theme.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q4',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Accessibility',
    text: 'How do you make a complex custom component, such as a combobox or modal, accessible?',
    hint: 'Follow ARIA patterns; test with keyboard and screen reader.',
    keyConcepts: [
      'ARIA',
      'role',
      'aria-expanded',
      'focus trap',
      'keyboard',
      'screen reader',
    ],
    modelAnswer:
      'Follow the WAI-ARIA authoring practices for the pattern. Add correct roles and states (aria-expanded, aria-controls). Trap focus inside a modal and return it on close. Ensure all actions are keyboard operable. Test with at least NVDA or VoiceOver.',
    roles: ['Frontend Engineer'],
  },
  {
    id: 'q5',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'JavaScript',
    text: 'Explain the event loop and how it affects UI responsiveness.',
    hint: 'Call stack, task queue, microtask queue order.',
    keyConcepts: [
      'call stack',
      'task queue',
      'microtask',
      'setTimeout',
      'Promise',
      'blocking',
    ],
    modelAnswer:
      'The event loop processes the call stack first, then drains the microtask queue (Promises), then picks one macrotask (setTimeout, I/O). Long synchronous work blocks the stack and freezes the UI. Break it up with yielding patterns or move heavy work to a Web Worker.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q6',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'Design systems',
    text: 'How would you design a reusable component library that balances consistency with team flexibility?',
    hint: 'Tokens, slots, composition over configuration.',
    keyConcepts: [
      'design tokens',
      'slots',
      'compound components',
      'polymorphic',
      'Storybook',
      'versioning',
    ],
    modelAnswer:
      'Establish a design token layer (colours, spacing, typography). Build composable primitives using compound-component or slot patterns so consumers can customise internals without forking. Publish with strict semver, document in Storybook, and auto-generate changelogs to keep teams in sync.',
    roles: ['Frontend Engineer'],
  },
  {
    id: 'q7',
    category: 'Technical',
    difficulty: 'easy',
    topic: 'CSS and layout',
    text: 'How do you approach responsive layouts, and when do you choose Grid over Flexbox?',
    hint: 'Flex = one axis; Grid = two axes.',
    keyConcepts: [
      'Flexbox',
      'Grid',
      'media query',
      'fluid',
      'container query',
      'clamp',
    ],
    modelAnswer:
      'Use Flexbox for single-axis layouts (nav bars, button groups). Use Grid for two-dimensional layouts (page skeleton, card galleries). Prefer fluid units and clamp() over fixed breakpoints. Container queries let components respond to their own size rather than the viewport.',
    roles: ['Frontend Engineer'],
  },
  {
    id: 'q8',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Testing strategy',
    text: 'What is your testing strategy for a feature-rich application?',
    hint: 'Testing pyramid: unit to integration to e2e.',
    keyConcepts: [
      'unit',
      'integration',
      'e2e',
      'testing library',
      'Cypress',
      'mocking',
      'coverage',
    ],
    modelAnswer:
      'Follow the testing pyramid: many fast unit tests for pure logic, fewer integration tests that mount real components with mocked APIs, and a small suite of end-to-end tests for critical user journeys. Aim for high confidence, not 100% line coverage.',
    roles: ['Frontend Engineer', 'Full Stack Engineer', 'Backend Engineer'],
  },
  {
    id: 'q9',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'API design',
    text: 'How would you design a REST API that must serve many client versions over several years?',
    hint: 'Versioning, deprecation policy, additive changes only.',
    keyConcepts: [
      'versioning',
      'backward compatibility',
      'deprecation',
      'hypermedia',
      'OpenAPI',
    ],
    modelAnswer:
      'Version in the URL path (/v1/, /v2/) or Accept header. Commit to only additive changes within a version (new fields, new endpoints). Announce deprecation with Sunset headers and a timeline. Document with OpenAPI. Provide a changelog and migration guide per major version.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q10',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Database performance',
    text: 'A query that was fast last month is now slow in production. How do you diagnose it?',
    hint: 'EXPLAIN, indexes, data growth, lock contention.',
    keyConcepts: [
      'EXPLAIN',
      'index',
      'statistics',
      'vacuum',
      'lock',
      'N+1',
      'query plan',
    ],
    modelAnswer:
      'Run EXPLAIN ANALYZE to get the query plan. Check whether the planner chose the expected index and whether statistics are stale (ANALYZE). Look for table bloat, lock waits, or N+1 patterns introduced by ORM changes. Then add missing indexes, rewrite the query, or partition the table if data volume is the root cause.',
    roles: ['Backend Engineer', 'Full Stack Engineer', 'Data Engineer'],
  },
  {
    id: 'q11',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'Idempotency',
    text: 'How do you prevent double-processing in a payment or job-queue system?',
    hint: 'Idempotency keys, at-least-once delivery, deduplication.',
    keyConcepts: [
      'idempotency key',
      'at-least-once',
      'exactly-once',
      'deduplication',
      'distributed lock',
    ],
    modelAnswer:
      'Require callers to send a client-generated idempotency key. Store processed keys with their outcome in a durable store. On retry, return the cached result instead of re-executing. For queues, use an at-least-once broker and deduplicate on the consumer side using a seen-IDs set or conditional database upsert.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q12',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Incident response',
    text: "Your service's p99 latency doubled overnight. Walk me through your response.",
    hint: 'Detect, mitigate, diagnose, fix, review.',
    keyConcepts: [
      'SLO',
      'runbook',
      'rollback',
      'traces',
      'logs',
      'metrics',
      'postmortem',
    ],
    modelAnswer:
      'First mitigate user impact by rolling back the last deployment or enabling a feature flag. Open a trace for a slow request to find the bottleneck. Correlate with deployment history, infrastructure events, and upstream dependency health. Fix or revert, then write a postmortem with timeline and action items.',
    roles: ['Backend Engineer', 'Full Stack Engineer', 'DevOps'],
  },
  {
    id: 'q13',
    category: 'Technical',
    difficulty: 'easy',
    topic: 'Caching',
    text: 'When would you introduce a cache, and what problems does it bring?',
    hint: 'Invalidation and consistency are the hard parts.',
    keyConcepts: [
      'cache-aside',
      'write-through',
      'TTL',
      'invalidation',
      'stale data',
      'thundering herd',
    ],
    modelAnswer:
      'Cache when data is expensive to compute or fetch and is read far more than it changes. Cache-aside is the simplest pattern. Problems include stale data, cache stampede on cold start, and invalidation complexity when the source changes. Choose TTL carefully and prefer event-driven invalidation for high-consistency needs.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q14',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Security',
    text: 'What are the most important security practices you apply when building an authenticated API?',
    hint: 'OWASP Top 10: injection, auth, data exposure.',
    keyConcepts: [
      'JWT',
      'OAuth',
      'HTTPS',
      'input validation',
      'rate limiting',
      'CORS',
      'secrets management',
    ],
    modelAnswer:
      'Use HTTPS everywhere. Validate and sanitise all input. Issue short-lived JWTs and refresh tokens; store secrets in a vault. Enforce rate limiting and throttling. Set CORS to allowlist origins. Log authentication events. Rotate credentials automatically. Run dependency audits in CI.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q15',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'CI/CD',
    text: 'How would you design a deployment pipeline that ships safely multiple times a day?',
    hint: 'Trunk-based dev, feature flags, progressive rollout.',
    keyConcepts: [
      'trunk-based',
      'feature flags',
      'canary',
      'blue-green',
      'smoke tests',
      'rollback',
    ],
    modelAnswer:
      'Commit to trunk; use feature flags to decouple deploy from release. Pipeline: lint, unit, integration, build, smoke test, canary deploy (5% traffic), automated SLO check, then full rollout. One-click rollback to the previous artifact at any stage.',
    roles: ['DevOps', 'Full Stack Engineer', 'Backend Engineer'],
  },
  {
    id: 'q16',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Kubernetes debugging',
    text: 'A pod keeps restarting in production. How do you troubleshoot it?',
    hint: 'CrashLoopBackOff reasons: OOMKill, bad probe, missing env.',
    keyConcepts: [
      'CrashLoopBackOff',
      'OOMKill',
      'liveness probe',
      'logs',
      'describe',
      'resource limits',
    ],
    modelAnswer:
      'Run kubectl describe pod to read Events, then kubectl logs --previous for the last crash output. Check exit code: 137 means OOMKilled, so raise memory limit or fix the leak. Otherwise check for missing env vars, failed liveness probes, or a bad image entrypoint. Fix the root cause, not just the restart policy.',
    roles: ['DevOps', 'Backend Engineer'],
  },
  {
    id: 'q17',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'Infrastructure as code',
    text: 'How do you manage infrastructure changes across environments safely with IaC?',
    hint: 'State, drift detection, plan review before apply.',
    keyConcepts: [
      'Terraform',
      'state',
      'plan',
      'drift',
      'modules',
      'workspaces',
      'secrets',
    ],
    modelAnswer:
      'Store Terraform state remotely with locking (S3 + DynamoDB or Terraform Cloud). Use workspaces or separate state files per environment. Always run plan in CI and require human approval before apply to production. Use modules for reuse. Never store secrets in state - reference from a vault.',
    roles: ['DevOps', 'Backend Engineer'],
  },
  {
    id: 'q18',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Observability',
    text: 'How do you decide what to monitor and alert on for a new service?',
    hint: 'USE + RED methods; alert on symptoms, not causes.',
    keyConcepts: [
      'RED',
      'USE',
      'SLO',
      'error budget',
      'latency',
      'saturation',
      'alert fatigue',
    ],
    modelAnswer:
      'Start with RED metrics (Rate, Errors, Duration) for request-driven services and USE (Utilisation, Saturation, Errors) for resources. Define SLOs for user-facing behaviour and alert on error budget burn rate rather than raw metrics. Avoid alert fatigue by paging only on symptoms that require human action.',
    roles: ['DevOps', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q19',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Data pipelines',
    text: 'Design a data pipeline that ingests events from many sources and powers daily analytics.',
    hint: 'Ingest, buffer, transform, warehouse, serve.',
    keyConcepts: [
      'Kafka',
      'Spark',
      'dbt',
      'data warehouse',
      'idempotency',
      'schema registry',
      'partitioning',
    ],
    modelAnswer:
      'Producers publish to Kafka topics (schema-validated via a registry). A streaming processor (Flink / Spark Streaming) cleans and enriches events, writing to a raw layer in the warehouse. dbt transformation jobs materialise curated models for analysts. Partition by event date for cheap pruning; enforce idempotency with upsert keys.',
    roles: ['Data Engineer', 'Backend Engineer'],
  },
  {
    id: 'q20',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'Data quality',
    text: 'How do you detect and handle bad data before it reaches stakeholders?',
    hint: 'Contract testing, Great Expectations, quarantine.',
    keyConcepts: [
      'data contract',
      'Great Expectations',
      'quarantine',
      'lineage',
      'alerts',
      'SLA',
    ],
    modelAnswer:
      'Define data contracts between producers and consumers. Run schema and statistical expectation checks (Great Expectations / dbt tests) on ingestion and after each transform. Route failing records to a quarantine table, alert the owning team, and never silently drop data. Track lineage so downstream impacts are immediately visible.',
    roles: ['Data Engineer'],
  },
  {
    id: 'q21',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'SQL',
    text: 'How would you find the top three customers by revenue in each region, and how would you make it efficient?',
    hint: 'Window function RANK() OVER (PARTITION BY region) with a CTE.',
    keyConcepts: [
      'window function',
      'RANK',
      'PARTITION BY',
      'CTE',
      'index',
      'covering index',
    ],
    modelAnswer:
      'Use RANK() OVER (PARTITION BY region ORDER BY revenue DESC) in a CTE, then filter WHERE rank is 3 or less. Ensure a composite index on (region, revenue DESC) so the planner can avoid a full table scan. Materialise as a view if queried frequently.',
    roles: ['Data Engineer', 'Backend Engineer'],
  },
  {
    id: 'q22',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'Offline-first',
    text: 'How would you build a mobile feature that works well on unreliable networks?',
    hint: 'Optimistic UI, sync queue, conflict resolution.',
    keyConcepts: [
      'offline-first',
      'optimistic UI',
      'sync queue',
      'conflict resolution',
      'service worker',
      'IndexedDB',
    ],
    modelAnswer:
      'Store data locally (IndexedDB / SQLite). Apply changes optimistically in the UI while queuing mutations. On reconnect, replay the queue against the server and resolve conflicts (last-write-wins or CRDT depending on domain). Use a service worker to cache assets and intercept requests.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q23',
    category: 'Technical',
    difficulty: 'hard',
    topic: 'Startup performance',
    text: "The app's launch time is too slow. How do you improve it?",
    hint: 'Critical path: main bundle, blocking resources, cold start.',
    keyConcepts: [
      'TTI',
      'code splitting',
      'preload',
      'tree shaking',
      'server-side render',
      'cold start',
    ],
    modelAnswer:
      'Profile with Lighthouse and the browser trace to find the critical path. Code-split at route boundaries, tree-shake unused code, preload key assets, and defer non-critical scripts. For SSR apps reduce cold-start by keeping the server warm or using edge functions. Cache aggressively at the CDN layer.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q24',
    category: 'Technical',
    difficulty: 'easy',
    topic: 'App lifecycle',
    text: 'Tell me about app lifecycle challenges you have handled, like backgrounding or process death.',
    hint: 'Save state on pause, restore on resume; handle process death gracefully.',
    keyConcepts: [
      'backgrounding',
      'process death',
      'state restoration',
      'onPause',
      'WorkManager',
    ],
    modelAnswer:
      "On mobile, save UI state to a Bundle or ViewModel on onPause/onStop. Use WorkManager for deferrable background work so the OS can reschedule it after process death. Test by enabling 'Don't keep activities' in developer options to simulate process death during background.",
    roles: ['Frontend Engineer'],
  },
  {
    id: 'q25',
    category: 'Technical',
    difficulty: 'medium',
    topic: 'People management',
    text: 'How do you handle an underperforming engineer who is well liked by the team?',
    hint: 'Separate the person from the performance; use data, not feelings.',
    keyConcepts: [
      'feedback',
      'PIP',
      'coaching',
      'psychological safety',
      'documentation',
      'HR',
    ],
    modelAnswer:
      'Start with private, specific, evidence-based feedback. Agree on clear, measurable goals with a timeline. Provide coaching and remove blockers. If no improvement, escalate to a formal PIP with HR involvement. Protect team morale by being fair and consistent, not by avoiding the conversation.',
    roles: ['Full Stack Engineer', 'Backend Engineer'],
  },
  // System Design
  {
    id: 'q26',
    category: 'System design',
    difficulty: 'hard',
    topic: 'URL shortener',
    text: 'Design a URL shortener that handles 10 billion clicks per day.',
    hint: 'Read-heavy, global CDN, hash collision strategy.',
    keyConcepts: [
      'consistent hashing',
      'CDN',
      'base62',
      'collision',
      'DB sharding',
      'cache',
    ],
    modelAnswer:
      'Generate a 7-character base-62 code. Store in a sharded key-value store (DynamoDB). Serve redirects from a global CDN with a long TTL. Rate-limit creation to prevent abuse. Use a bloom filter to quickly detect collisions before writing.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q27',
    category: 'System design',
    difficulty: 'hard',
    topic: 'Chat application',
    text: 'Design a real-time chat system for 50 million concurrent users.',
    hint: 'WebSockets, fan-out, message persistence vs. delivery.',
    keyConcepts: [
      'WebSocket',
      'fan-out',
      'pub/sub',
      'message queue',
      'presence',
      'horizontal scaling',
    ],
    modelAnswer:
      'Clients hold persistent WebSocket connections to stateless gateway servers. Gateways publish messages to a pub/sub broker (Kafka). Subscriber workers push to connected clients and write to a time-series message store. Store presence state in Redis with TTL heartbeats.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q28',
    category: 'System design',
    difficulty: 'hard',
    topic: 'Notification service',
    text: 'Design a notification system that sends push, email, and SMS reliably at scale.',
    hint: 'Fan-out, provider abstraction, retry with backoff.',
    keyConcepts: [
      'fan-out',
      'retry',
      'idempotency',
      'priority queue',
      'provider abstraction',
      'deduplication',
    ],
    modelAnswer:
      'An event bus (Kafka) fans out notification events to per-channel workers. Each worker uses an abstracted provider interface so swapping SendGrid for Postmark is a config change. Retry with exponential backoff and a dead-letter queue. Deduplicate using notification IDs.',
    roles: ['Backend Engineer'],
  },
  {
    id: 'q29',
    category: 'System design',
    difficulty: 'medium',
    topic: 'Rate limiter',
    text: 'How would you implement a distributed rate limiter?',
    hint: 'Token bucket or sliding window; atomic operations in Redis.',
    keyConcepts: [
      'token bucket',
      'sliding window',
      'Redis',
      'Lua script',
      'atomic',
      '429',
    ],
    modelAnswer:
      'Sliding window counter in Redis using a sorted set keyed by (user, window). On each request, ZADD the timestamp and ZCOUNT to check the window. Wrap in a Lua script for atomicity. Return 429 with Retry-After when the limit is exceeded.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q30',
    category: 'System design',
    difficulty: 'hard',
    topic: 'Search autocomplete',
    text: 'Design a search autocomplete that returns results in under 100 ms for 1 billion queries a day.',
    hint: 'Trie in Redis, pre-computed top-k, CDN.',
    keyConcepts: [
      'trie',
      'Redis',
      'pre-computed',
      'CDN',
      'debounce',
      'personalisation',
    ],
    modelAnswer:
      'Pre-compute top-k suggestions per prefix offline and store in Redis hashes. Serve from an edge cache (CDN) for common prefixes. Update the suggestion index asynchronously from a log of queries. Personalise in a second pass for authenticated users only.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q45',
    category: 'System design',
    difficulty: 'medium',
    topic: 'File storage',
    text: 'Design a system for storing and serving user-uploaded files at scale.',
    hint: 'Object storage, CDN, signed URLs, virus scan.',
    keyConcepts: [
      'object storage',
      'CDN',
      'signed URL',
      'virus scan',
      'metadata',
      'resumable upload',
    ],
    modelAnswer:
      'Client requests a signed upload URL from the API; uploads directly to object storage (S3) to keep the API stateless. A Lambda trigger runs virus scan and generates thumbnails. Serve downloads via CDN with short-lived signed URLs. Store metadata in the database.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q48',
    category: 'System design',
    difficulty: 'hard',
    topic: 'Feed ranking',
    text: 'Design the ranking system for a social media feed with 500 million daily active users.',
    hint: 'Candidate generation, scoring, serving; fan-out on read vs. write.',
    keyConcepts: [
      'candidate generation',
      'scoring',
      'fan-out',
      'feature store',
      'A/B testing',
      'freshness',
    ],
    modelAnswer:
      'Use fan-out-on-read for high-follower accounts and fan-out-on-write for low-follower accounts to balance latency and storage. Score candidates with a lightweight ML model using pre-computed user and post features from a feature store. Run continuous A/B tests to iterate on ranking signals.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  // Coding
  {
    id: 'q31',
    category: 'Coding',
    difficulty: 'easy',
    topic: 'Arrays',
    text: 'Given an array of integers, return indices of the two numbers that add up to a target.',
    hint: 'Hash map for O(n) instead of nested loops.',
    keyConcepts: ['hash map', 'two-sum', 'O(n)', 'complement', 'single pass'],
    modelAnswer:
      'Single-pass hash map: for each element x, check if (target - x) exists in the map; if so return its stored index. Otherwise store x with its index. O(n) time, O(n) space.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q32',
    category: 'Coding',
    difficulty: 'medium',
    topic: 'Linked lists',
    text: 'Reverse a singly linked list. Walk me through pointer movement and edge cases.',
    hint: 'Three-pointer iterative approach is O(n) time, O(1) space.',
    keyConcepts: [
      'prev',
      'current',
      'next',
      'iterative',
      'recursion',
      'O(1) space',
    ],
    modelAnswer:
      'Iterate with prev, current and next pointers: save next, point current to prev, then advance both. O(n) time, O(1) space. Handles empty and single-node lists. Recursion is possible but uses O(n) stack space.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q33',
    category: 'Coding',
    difficulty: 'medium',
    topic: 'Trees',
    text: 'Write an algorithm to check whether a binary tree is a valid BST.',
    hint: 'Pass min/max bounds down the recursion.',
    keyConcepts: ['BST', 'recursion', 'min/max bounds', 'inorder', 'DFS'],
    modelAnswer:
      'Recurse with (node, min, max) bounds. For the left subtree max becomes node.val; for the right subtree min becomes node.val. A node is invalid if its value is not strictly within (min, max). Alternatively, inorder traversal should yield strictly ascending values.',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q34',
    category: 'Coding',
    difficulty: 'hard',
    topic: 'Dynamic programming',
    text: 'Given a grid with obstacles, count the number of unique paths from top-left to bottom-right.',
    hint: 'DP table where dp[i][j] = dp[i-1][j] + dp[i][j-1], 0 for obstacles.',
    keyConcepts: ['DP', 'grid', 'base case', 'obstacle', 'space optimisation'],
    modelAnswer:
      'Initialise a DP grid of the same size. dp[0][0] = 1. For each cell: 0 if obstacle, else sum of the cell above and the cell to the left. Optimise space to O(cols) by rolling a single row. Time O(m x n).',
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q35',
    category: 'Coding',
    difficulty: 'easy',
    topic: 'Strings',
    text: 'Check if a string is a palindrome, ignoring non-alphanumeric characters and case.',
    hint: 'Two-pointer after cleaning, or reverse and compare.',
    keyConcepts: [
      'two-pointer',
      'regex',
      'toLowerCase',
      'alphanumeric',
      'O(n)',
    ],
    modelAnswer:
      'Clean the string to alphanumeric lower-case. Use two pointers at opposite ends and advance inward while chars match. Return false on mismatch. O(n) time, O(1) extra space if done in-place on a char array.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q36',
    category: 'Coding',
    difficulty: 'medium',
    topic: 'Graphs',
    text: "Given a list of courses with prerequisites, determine if it's possible to finish all courses.",
    hint: 'Detect a cycle in a directed graph. DFS with visited/in-stack sets.',
    keyConcepts: [
      'cycle detection',
      'DFS',
      'topological sort',
      'in-stack',
      "Kahn's algorithm",
    ],
    modelAnswer:
      "Build an adjacency list. DFS each unvisited node; maintain an in-stack set. If DFS reaches an in-stack node there's a cycle and return false. Alternatively, use Kahn's algorithm with in-degree counting which completes in O(V+E).",
    roles: ['Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q46',
    category: 'Coding',
    difficulty: 'hard',
    topic: 'Concurrency',
    text: 'Implement a promise pool that runs at most N promises concurrently.',
    hint: 'Use a counter or a set of active promises; resolve them as they complete.',
    keyConcepts: [
      'Promise.race',
      'concurrency limit',
      'pool',
      'generator',
      'async iterator',
    ],
    modelAnswer:
      'Keep a set of active promises. While the set size is less than N and there are remaining tasks, start the next task and add its promise (auto-removed on settle). When full, await Promise.race(activeSet) to free a slot. Continue until all tasks are settled.',
    roles: ['Frontend Engineer', 'Full Stack Engineer'],
  },
  // Behavioral
  {
    id: 'q37',
    category: 'Behavioral',
    difficulty: 'medium',
    topic: 'Conflict resolution',
    text: 'Tell me about a time you disagreed with a technical decision made by your team. What did you do?',
    hint: 'STAR method: describe the disagreement, your approach, and the outcome.',
    keyConcepts: [
      'STAR',
      'influence without authority',
      'data',
      'compromise',
      'retrospective',
    ],
    modelAnswer:
      'I documented my concerns with data and proposed an alternative. I requested a focused meeting to share trade-offs rather than arguing in Slack. We agreed to timebox a spike comparing both approaches. The data from the spike resolved the disagreement and we shipped the better solution with shared ownership.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q38',
    category: 'Behavioral',
    difficulty: 'easy',
    topic: 'Time management',
    text: 'Describe how you manage competing priorities when everything feels urgent.',
    hint: 'Impact vs. effort matrix; communicate early when something slips.',
    keyConcepts: [
      'prioritisation',
      'stakeholder communication',
      'impact',
      'trade-offs',
      'delegation',
    ],
    modelAnswer:
      'I list all items, estimate impact and effort, and sort by highest impact per unit of effort. I communicate to stakeholders early if something will slip and give them a revised ETA. I check in daily during crunch periods so surprises are rare.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q39',
    category: 'Behavioral',
    difficulty: 'medium',
    topic: 'Failure',
    text: 'Tell me about a project that failed or did not go as planned. What did you learn?',
    hint: 'Own the failure; focus on learnings and systemic improvements.',
    keyConcepts: [
      'ownership',
      'postmortem',
      'learnings',
      'systemic fix',
      'blameless',
    ],
    modelAnswer:
      'We shipped a feature without sufficient load testing; it degraded under peak traffic. I led the postmortem, focusing on process gaps rather than blame: we lacked a performance gate in CI. We added automated load tests and a rollback runbook. The same incident pattern has not recurred.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q40',
    category: 'Behavioral',
    difficulty: 'hard',
    topic: 'Leadership',
    text: 'How have you influenced the technical direction of a team or company without formal authority?',
    hint: 'Build credibility through delivery; write RFCs; earn allies.',
    keyConcepts: [
      'RFC',
      'credibility',
      'allies',
      'evangelism',
      'data-driven',
      'coalition',
    ],
    modelAnswer:
      'I wrote a concise RFC showing the current pain points with metrics, proposed a solution, and listed risks. I demoed a working prototype to remove doubt. I found one respected senior engineer who agreed and presented jointly. The proposal was adopted within a quarter.',
    roles: ['Full Stack Engineer', 'Backend Engineer'],
  },
  {
    id: 'q41',
    category: 'Behavioral',
    difficulty: 'easy',
    topic: 'Feedback',
    text: 'How do you give constructive feedback to a colleague whose code quality is slipping?',
    hint: 'Specific, private, behaviour-based, with an offer to help.',
    keyConcepts: [
      'SBI model',
      'private',
      'specific',
      'behaviour',
      'impact',
      'support',
    ],
    modelAnswer:
      'Use the SBI model: describe the Situation, the specific Behaviour, and its Impact. Keep it private and forward-looking. Offer to pair-program on the next PR or share resources. Follow up to close the loop so the feedback lands as coaching, not criticism.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q42',
    category: 'Behavioral',
    difficulty: 'medium',
    topic: 'Stakeholder management',
    text: 'A non-technical stakeholder keeps changing the requirements mid-sprint. How do you handle it?',
    hint: 'Surface the cost of change; agree on a decision-making process.',
    keyConcepts: [
      'scope creep',
      'change control',
      'cost of change',
      'sprint goal',
      'alignment',
    ],
    modelAnswer:
      'I make the cost of mid-sprint changes visible: adding this means dropping X or delaying the sprint goal by Y days. I propose a lightweight change-request process where new requirements go into the next sprint backlog unless truly critical.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q43',
    category: 'Behavioral',
    difficulty: 'medium',
    topic: 'Mentorship',
    text: 'How do you onboard a junior engineer and set them up for success in their first 90 days?',
    hint: 'Structured ramp: read, review, contribute, own.',
    keyConcepts: [
      'onboarding plan',
      'buddy',
      'small wins',
      'feedback loops',
      'autonomy',
    ],
    modelAnswer:
      'Week 1: orient to the codebase and processes with a dedicated buddy. Weeks 2-4: review PRs and fix small bugs to build familiarity. Month 2: own a well-scoped feature end-to-end. Month 3: run a retro or tech-talk to cement belonging. Weekly 1-1s for feedback throughout.',
    roles: ['Full Stack Engineer', 'Backend Engineer'],
  },
  {
    id: 'q44',
    category: 'Behavioral',
    difficulty: 'hard',
    topic: 'Ambiguity',
    text: 'Describe a time you had to make a significant technical decision with incomplete information.',
    hint: 'State assumptions explicitly; design for reversibility.',
    keyConcepts: [
      'assumptions',
      'reversibility',
      'time-boxing',
      'escalation',
      'documented',
    ],
    modelAnswer:
      'I listed known unknowns and ranked them by risk. I time-boxed a spike to resolve the highest-risk unknown. I documented my assumptions in the design doc so reviewers could challenge them. I chose the most reversible architecture so we could pivot cheaply if assumptions proved wrong.',
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
  {
    id: 'q47',
    category: 'Behavioral',
    difficulty: 'medium',
    topic: 'Cross-team collaboration',
    text: 'Tell me about a time you worked closely with another team (design, product, data) to deliver a feature.',
    hint: 'Describe communication structure, shared goals, and how you resolved friction.',
    keyConcepts: [
      'alignment',
      'shared goal',
      'communication cadence',
      'dependency management',
      'compromise',
    ],
    modelAnswer:
      "We set a shared definition of done and weekly syncs across engineering, design, and data. When design specs changed late I raised the impact immediately, we negotiated a phased release, and I documented the trade-offs. The feature shipped on time with everyone's buy-in.",
    roles: ['Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer'],
  },
];

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useSavedQuestions(): [Set<string>, (id: string) => void] {
  const [saved, setSaved] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  return [saved, toggle];
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: Question;
  isSaved: boolean;
  onToggleSave: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

function QuestionCard({
  question,
  isSaved,
  onToggleSave,
  isOpen,
  onToggleOpen,
}: QuestionCardProps) {
  const router = useRouter();

  const handlePractice = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams({
      topic: question.topic,
      category: question.category,
      prefillQuestion: question.text,
    });
    router.push(`/dashboard/setup?${params.toString()}`);
  };

  return (
    <article className="bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl overflow-hidden transition-all duration-200 hover:border-white/10">
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 sm:px-6 py-4 cursor-pointer select-none"
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleOpen();
          }
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${CAT_STYLES[question.category]}`}
            >
              {question.category}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${DIFF_STYLES[question.difficulty]}`}
            >
              {question.difficulty}
            </span>
            <span className="text-xs text-white/40">{question.topic}</span>
          </div>
          <p className="text-sm sm:text-base font-semibold text-white leading-snug">
            {question.text}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark question'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            className={`p-1.5 rounded-md transition-colors ${isSaved ? 'text-indigo-400 hover:text-indigo-300' : 'text-white/30 hover:text-white/70'}`}
          >
            {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
          <button
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className="p-1.5 rounded-md text-white/30 hover:text-white/70 transition-colors"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {isOpen && (
        <div className="px-4 sm:px-6 pb-5 border-t border-white/5 pt-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">
              Hint
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              {question.hint}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">
              Key Concepts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {question.keyConcepts.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[11px] text-white/60"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">
              Model Answer
            </p>
            <p className="text-sm text-white/80 leading-relaxed">
              {question.modelAnswer}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
            <button
              onClick={handlePractice}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Mic size={14} />
              Practice this question
            </button>
            <p className="text-xs text-white/35">
              Roles: {question.roles.join(', ')}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuestionBankClient() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('Any');
  const [role, setRole] = useState<RoleFilter>('All roles');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(QUESTIONS[0]?.id ?? null);
  const [saved, toggleSaved] = useSavedQuestions();

  const filtered = useMemo(() => {
    return QUESTIONS.filter((q) => {
      const term = search.toLowerCase();
      if (
        term &&
        !q.text.toLowerCase().includes(term) &&
        !q.topic.toLowerCase().includes(term) &&
        !q.category.toLowerCase().includes(term) &&
        !q.keyConcepts.some((c) => c.toLowerCase().includes(term))
      )
        return false;
      if (category !== 'All' && q.category !== category) return false;
      if (difficulty !== 'Any' && q.difficulty !== difficulty.toLowerCase())
        return false;
      if (role !== 'All roles' && !q.roles.includes(role)) return false;
      if (showSavedOnly && !saved.has(q.id)) return false;
      return true;
    });
  }, [search, category, difficulty, role, showSavedOnly, saved]);

  const savedCount = saved.size;
  const handleToggleOpen = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);
  const clearFilters = () => {
    setSearch('');
    setCategory('All');
    setDifficulty('Any');
    setRole('All roles');
    setShowSavedOnly(false);
  };
  const hasActiveFilters = !!(
    search ||
    category !== 'All' ||
    difficulty !== 'Any' ||
    role !== 'All roles' ||
    showSavedOnly
  );

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Question bank
        </h1>
        <p className="text-sm text-white/50">
          {QUESTIONS.length} curated questions with model answers and key
          concepts. Save favourites or practice any question on its own.
        </p>
      </header>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
        />
        <input
          type="search"
          aria-label="Search questions"
          placeholder="Search by topic, keyword or text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[hsl(222,24%,11%)] border border-white/8 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-5">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 bg-[hsl(222,24%,11%)] border border-white/8 rounded-xl p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${category === cat ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Difficulty tabs */}
        <div className="flex gap-1 bg-[hsl(222,24%,11%)] border border-white/8 rounded-xl p-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${difficulty === d ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Role dropdown */}
        <div className="relative inline-flex items-center">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleFilter)}
            aria-label="Filter by role"
            className="bg-[hsl(222,24%,11%)] border border-white/8 rounded-xl pl-3 pr-7 py-1.5 text-xs text-white/70 focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer transition-colors min-w-[120px]"
          >
            {ROLES.map((r) => (
              <option
                key={r}
                value={r}
                className="bg-[hsl(222,28%,9%)] text-white"
              >
                {r}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2.5 pointer-events-none text-white/40"
          />
        </div>

        {/* Saved toggle */}
        <button
          onClick={() => setShowSavedOnly((p) => !p)}
          aria-pressed={showSavedOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showSavedOnly ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' : 'bg-[hsl(222,24%,11%)] text-white/50 border-white/8 hover:text-white/80'}`}
        >
          <Bookmark size={13} />
          Saved ({savedCount})
        </button>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/40 hover:text-white/70 border border-white/8 transition-colors bg-[hsl(222,24%,11%)]"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-sm text-white/40 mb-4 font-medium">
        {filtered.length} question{filtered.length !== 1 ? 's' : ''}
        {showSavedOnly ? ' (saved)' : ''}
      </p>

      {/* Question list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookmarkCheck size={40} className="text-white/10 mb-4" />
          <p className="text-white/40 font-medium">
            No questions match your filters.
          </p>
          <button
            onClick={clearFilters}
            className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              isSaved={saved.has(q.id)}
              onToggleSave={() => toggleSaved(q.id)}
              isOpen={openId === q.id}
              onToggleOpen={() => handleToggleOpen(q.id)}
            />
          ))}
        </div>
      )}

      <div className="h-10" />
    </div>
  );
}
