import 'server-only';

import Groq from 'groq-sdk';

import { createSessionLogger } from '@/lib/logger';
import {
  BadRequestError,
  ExternalServiceError,
} from '@/server/errors/AppError';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface CandidateContext {
  role?: string;
  experience?: string;
  difficulty?: string;
  interviewType?: string;
  techStack?: string[];
  interviewerId?: string;
  numQuestions?: number;
  timeLimit?: string;
  allowFollowUps?: boolean;
  jobDescription?: string;
  resumeText?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  sessionId: string;
  interviewType?:
    'TECHNICAL' | 'BEHAVIOURAL' | 'SYSTEM_DESIGN' | 'HR' | 'MIXED';
  candidateContext?: CandidateContext;
}

export interface SSEChunkEvent {
  type: 'chunk';
  text: string;
}

export interface SSEDoneEvent {
  type: 'done';
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

const GROQ_MODEL = 'qwen/qwen3.8-27b';

const SYSTEM_PROMPT = `You are an expert technical interviewer conducting a professional job interview.
Your role is to:
- Ask clear, specific, and relevant interview questions one at a time
- Provide brief acknowledgements of the candidate's answers before moving on
- Adapt question difficulty based on the candidate's responses
- Stay focused on the interview domain (technical, behavioural, or HR as specified)
- Be professional, encouraging, and neutral in tone
- Keep each response concise (under 150 words) to allow real-time streaming

Never break character. Do not explain that you are an AI unless directly asked.`;

const REQUEST_TIMEOUT_MS = 25_000;

const encoder = new TextEncoder();

export function sseFrame(event: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function sseHeaders(extraHeaders?: Record<string, string>): Headers {
  return new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
}

export function validateChatRequest(body: unknown): ChatRequest {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('Request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    throw new BadRequestError('`messages` must be a non-empty array.');
  }
  if (b.messages.length > 50) {
    throw new BadRequestError('`messages` must not exceed 50 turns.');
  }

  for (const msg of b.messages as unknown[]) {
    if (
      typeof msg !== 'object' ||
      msg === null ||
      !['user', 'model'].includes(
        (msg as Record<string, unknown>).role as string,
      ) ||
      typeof (msg as Record<string, unknown>).content !== 'string' ||
      ((msg as Record<string, unknown>).content as string).length === 0
    ) {
      throw new BadRequestError(
        `Each message must have \`role\` ('user' | 'model') and non-empty \`content\` string.`,
      );
    }
    if (((msg as Record<string, unknown>).content as string).length > 8_000) {
      throw new BadRequestError(
        'Individual message content must not exceed 8000 characters.',
      );
    }
  }

  if (typeof b.sessionId !== 'string' || b.sessionId.trim().length === 0) {
    throw new BadRequestError('`sessionId` must be a non-empty string.');
  }

  const result: ChatRequest = {
    messages: b.messages as ChatMessage[],
    sessionId: b.sessionId as string,
  };

  if (b.interviewType !== undefined) {
    result.interviewType = b.interviewType as NonNullable<
      ChatRequest['interviewType']
    >;
  }
  if (b.candidateContext !== undefined) {
    result.candidateContext = b.candidateContext as NonNullable<
      ChatRequest['candidateContext']
    >;
  }
  return result;
}

export class ChatService {
  /**
   * Orchestrates the Groq LLM streaming interview interaction and produces
   * an SSE-compliant ReadableStream with proper error boundaries and abort signals.
   */
  createStream(
    chatRequest: ChatRequest,
    userId: string,
  ): ReadableStream<Uint8Array> {
    const sessionLogger = createSessionLogger(chatRequest.sessionId, {
      route: '/api/interview/chat',
      userId,
    });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your-groq-api-key-here') {
      throw new ExternalServiceError(
        'Groq API key not configured.',
        'GroqClient',
      );
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort('REQUEST_TIMEOUT');
    }, REQUEST_TIMEOUT_MS);

    return new ReadableStream({
      async start(controller) {
        const enqueue = (event: SSEEvent) => {
          try {
            controller.enqueue(sseFrame(event));
          } catch {
            // Controller closed if client disconnected
          }
        };

        try {
          const groq = new Groq({ apiKey });

          let finalSystemPrompt = SYSTEM_PROMPT;
          if (chatRequest.candidateContext) {
            finalSystemPrompt += `\n\nCandidate Profile:\n- Target Role: ${chatRequest.candidateContext.role || 'Software Engineer'}\n- Experience Level: ${chatRequest.candidateContext.experience || 'Mid-Level'}\n- Tech Stack: ${chatRequest.candidateContext.techStack?.join(', ') || 'General'}\n\nPlease ensure your questions are highly tailored to this exact candidate profile. Ask deep, specific technical questions matching their selected tech stack and experience level.`;

            if (chatRequest.candidateContext.resumeText) {
              finalSystemPrompt += `\n\nCandidate's Extracted Resume:\n"""\n${chatRequest.candidateContext.resumeText}\n"""\n\nPlease incorporate specific details, projects, or achievements from their resume into your interview questions. Make it feel like you have thoroughly read their CV.`;
            }
          }

          const systemMessage = {
            role: 'system' as const,
            content: finalSystemPrompt,
          };
          const historyMessages = chatRequest.messages.map((msg) => ({
            role: (msg.role === 'model' ? 'assistant' : 'user') as
              'assistant' | 'user',
            content: msg.content,
          }));
          const messages = [systemMessage, ...historyMessages];

          const responseStream = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 512,
            top_p: 0.9,
          });

          for await (const chunk of responseStream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              enqueue({ type: 'chunk', text });
            }
          }

          enqueue({ type: 'done' });
        } catch (err: unknown) {
          const isTimeout =
            abortController.signal.aborted &&
            abortController.signal.reason === 'REQUEST_TIMEOUT';
          const isAborted = abortController.signal.aborted && !isTimeout;

          if (isTimeout) {
            sessionLogger.error('AI chat response stream timed out');
            enqueue({
              type: 'error',
              code: 'TIMEOUT',
              message: 'The AI took too long to respond. Please try again.',
            });
          } else if (isAborted) {
            sessionLogger.info(
              'Client disconnected from AI chat response stream',
            );
          } else if (err instanceof Error) {
            sessionLogger.error(
              { err: err.message, stack: err.stack },
              'Groq API error during streaming response',
            );
            const message = err.message.toLowerCase();
            const code =
              message.includes('quota') || message.includes('rate limit')
                ? 'QUOTA_EXCEEDED'
                : message.includes('api_key') || message.includes('api key')
                  ? 'INVALID_API_KEY'
                  : message.includes('network') || message.includes('fetch')
                    ? 'NETWORK_ERROR'
                    : 'GROQ_ERROR';

            enqueue({
              type: 'error',
              code,
              message:
                process.env.NODE_ENV === 'development'
                  ? err.message
                  : 'An error occurred while generating the response.',
            });
          } else {
            sessionLogger.error(
              { err },
              'Unknown error during AI chat response streaming',
            );
            enqueue({
              type: 'error',
              code: 'UNKNOWN',
              message: 'An unexpected error occurred.',
            });
          }
        } finally {
          clearTimeout(timeoutId);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },

      cancel() {
        clearTimeout(timeoutId);
        abortController.abort('CLIENT_DISCONNECTED');
      },
    });
  }

  /**
   * High-level entry point validating input and constructing an SSE streaming Response.
   */
  async handleChatStream(body: unknown, userId: string): Promise<Response> {
    const chatRequest = validateChatRequest(body);
    const stream = this.createStream(chatRequest, userId);
    return new Response(stream, {
      status: 200,
      headers: sseHeaders(),
    });
  }
}

export const chatService = new ChatService();
