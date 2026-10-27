import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/utils/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

import {
  POST as chatPost,
  dynamic as chatDynamic,
} from '@/app/api/interview/chat/route';
import {
  POST as evaluatePost,
  dynamic as evaluateDynamic,
} from '@/app/api/interview/evaluate/route';
import {
  POST as v1ChatPost,
  dynamic as v1ChatDynamic,
} from '@/app/api/v1/interview/chat/route';
import {
  POST as v1EvaluatePost,
  dynamic as v1EvaluateDynamic,
} from '@/app/api/v1/interview/evaluate/route';

describe('/api/v1 Versioning Re-exports', () => {
  it('correctly aliases /api/v1/interview/evaluate to /api/interview/evaluate', () => {
    expect(typeof v1EvaluatePost).toBe('function');
    expect(v1EvaluatePost).toBe(evaluatePost);
    expect(v1EvaluateDynamic).toBe(evaluateDynamic);
  });

  it('correctly aliases /api/v1/interview/chat to /api/interview/chat', () => {
    expect(typeof v1ChatPost).toBe('function');
    expect(v1ChatPost).toBe(chatPost);
    expect(v1ChatDynamic).toBe(chatDynamic);
  });
});
