import { vi } from 'vitest';

// Vitest runs in a jsdom environment where 'server-only' could throw or fail resolution.
// Mocking it ensures server-side modules can be imported and tested cleanly.
vi.mock('server-only', () => ({}));
