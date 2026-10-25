import { loadEnvConfig } from '@next/env';
import { vi } from 'vitest';

// Load .env.local and .env for testing environment
loadEnvConfig(process.cwd());

// Set deterministic fallback environment variables for test suites
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
process.env.GROQ_API_KEY ||= 'gsk_test_groq_api_key_for_testing';
process.env.DATABASE_URL ||=
  'postgresql://postgres:postgres@localhost:5432/postgres';

// Vitest runs in a jsdom environment where 'server-only' could throw or fail resolution.
// Mocking it ensures server-side modules can be imported and tested cleanly.
vi.mock('server-only', () => ({}));
