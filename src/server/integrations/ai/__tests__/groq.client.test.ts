import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExternalServiceError } from '@/server/errors/AppError';
import {
  generateEvaluationCompletion,
  groq,
} from '@/server/integrations/ai/groq.client';

describe('Groq AI Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateEvaluationCompletion', () => {
    it('successfully generates and returns completion content in JSON mode', async () => {
      const mockResult = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                technicalScore: 9,
                overallScore: 9,
                recommendation: 'STRONG_YES',
              }),
            },
          },
        ],
      };

      const createSpy = vi
        .spyOn(groq.chat.completions, 'create')
        .mockResolvedValueOnce(mockResult as never);

      const promptSchema = 'You are an evaluation engine. Return JSON.';
      const userContent = 'Interview transcript between Alex and Interv';

      const result = await generateEvaluationCompletion(
        promptSchema,
        userContent,
      );

      expect(result).toBe(mockResult.choices[0]?.message.content);
      expect(createSpy).toHaveBeenCalledWith(
        {
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: promptSchema },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
        { timeout: 60000 },
      );
    });

    it('supports custom model and timeout parameters', async () => {
      const mockResult = {
        choices: [
          {
            message: {
              content: '{"status":"ok"}',
            },
          },
        ],
      };

      const createSpy = vi
        .spyOn(groq.chat.completions, 'create')
        .mockResolvedValueOnce(mockResult as never);

      const result = await generateEvaluationCompletion(
        'sys-prompt',
        'user-content',
        'llama-3.3-70b-versatile',
        30000,
      );

      expect(result).toBe('{"status":"ok"}');
      expect(createSpy).toHaveBeenCalledWith(
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'sys-prompt' },
            { role: 'user', content: 'user-content' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
        { timeout: 30000 },
      );
    });

    it('throws ExternalServiceError when choices array is empty', async () => {
      vi.spyOn(groq.chat.completions, 'create').mockResolvedValue({
        choices: [],
      } as never);

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow('AI returned an empty evaluation response');
    });

    it('throws ExternalServiceError when message content is empty or null', async () => {
      vi.spyOn(groq.chat.completions, 'create').mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      } as never);

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow('AI returned an empty evaluation response');
    });

    it('handles timeout errors and wraps them in ExternalServiceError', async () => {
      vi.spyOn(groq.chat.completions, 'create').mockRejectedValue(
        new Error('Request timed out after 60000ms'),
      );

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow(
        'Groq AI evaluation failed: Request timed out after 60000ms',
      );
    });

    it('handles Groq API 429 rate limit or 500 error gracefully', async () => {
      vi.spyOn(groq.chat.completions, 'create').mockRejectedValueOnce(
        new Error('429 Rate limit exceeded. Try again in 20s'),
      );

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow('Groq AI evaluation failed: 429 Rate limit exceeded');
    });

    it('handles non-Error objects thrown by wrapping them in ExternalServiceError', async () => {
      vi.spyOn(groq.chat.completions, 'create').mockRejectedValueOnce(
        'Unexpected socket hang up',
      );

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow('Groq AI evaluation failed: Unexpected socket hang up');
    });

    it('does not re-wrap when an ExternalServiceError is thrown', async () => {
      const originalErr = new ExternalServiceError(
        'Direct external error',
        'Groq',
      );
      vi.spyOn(groq.chat.completions, 'create').mockRejectedValueOnce(
        originalErr,
      );

      await expect(
        generateEvaluationCompletion('prompt', 'content'),
      ).rejects.toThrow(originalErr);
    });
  });
});
