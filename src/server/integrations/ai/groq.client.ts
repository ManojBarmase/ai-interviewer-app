import 'server-only';

import Groq from 'groq-sdk';

import { env } from '@/lib/config/env';
import { ExternalServiceError } from '@/server/errors/AppError';

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/**
 * Invokes Groq LLM completion with JSON mode and deterministic temperature
 */
export async function generateEvaluationCompletion(
  promptWithSchema: string,
  userPromptContent: string,
  model = 'qwen/qwen3.8-27b',
  timeoutMs = 60000,
): Promise<string> {
  try {
    const response = await groq.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: promptWithSchema },
          { role: 'user', content: userPromptContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      { timeout: timeoutMs },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ExternalServiceError(
        'AI returned an empty evaluation response',
        'Groq',
      );
    }

    return content;
  } catch (error: unknown) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    throw new ExternalServiceError(
      `Groq AI evaluation failed: ${err.message}`,
      'Groq',
      { originalError: err.message },
    );
  }
}
