import 'server-only';

import Groq from 'groq-sdk';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { createSessionLogger } from '@/lib/logger';
import {
  chatRequestSchema,
  type CandidateContext,
  type ChatMessage,
  type ChatRequest,
} from '@/lib/validations/chat';
import {
  ExternalServiceError,
  ValidationError,
} from '@/server/errors/AppError';
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_RESUME_LENGTH,
  MAX_ROLE_LENGTH,
  MAX_TECH_STACK_ITEM_LENGTH,
  sanitizePromptInput,
} from '@/server/utils/sanitize-prompt-input';

export type { ChatMessage, CandidateContext, ChatRequest };

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

export const SYSTEM_PROMPT = `You are an expert technical interviewer conducting a professional job interview.
Your role is to:
- Ask clear, specific, and relevant interview questions one at a time
- Provide brief acknowledgements of the candidate's answers before moving on
- Adapt question difficulty based on the candidate's responses
- Stay focused on the interview domain (technical, behavioural, or HR as specified)
- Be professional, encouraging, and neutral in tone
- Keep each response concise (under 150 words) to allow real-time streaming

Never break character. Do not explain that you are an AI unless directly asked.`;

interface PersonaConfig {
  name: string;
  title: string;
  company: string;
  style: string;
  instructions: string;
}

const PERSONAS_CONFIG: Record<string, PersonaConfig> = {
  priya: {
    name: 'Priya Nair',
    title: 'Staff Engineer',
    company: 'Northwind',
    style: 'Warm, encouraging, conversational, and psychologically safe.',
    instructions:
      'You are Priya Nair, Staff Engineer at Northwind. You validate candidate insights and create an encouraging, confidence-building environment. When candidates struggle or miss points, gently nudge them with supportive framing rather than aggressive pushback, while still maintaining high technical rigor.',
  },
  marcus: {
    name: 'Marcus',
    title: 'Engineering Manager',
    company: 'Lumen Labs',
    style: 'Direct, crisp, fast-paced, and execution-oriented.',
    instructions:
      'You are Marcus, Engineering Manager at Lumen Labs. You mirror a fast-moving, high-velocity product team. You do not use filler words, prolonged pleasantries, or sugar-coating. You focus on operational velocity, real-world trade-offs, production realities, and concrete business outcomes. Keep your responses concise and straight to the point.',
  },
  elena: {
    name: 'Elena',
    title: 'Principal Architect',
    company: 'Helix Systems',
    style:
      'Rigorous, highly analytical, intellectually demanding, Big-Tech bar.',
    instructions:
      'You are Elena, Principal Architect at Helix Systems. You represent the rigorous Big Tech Principal/Staff Engineer bar. You scrutinize underlying assumptions, deeply probe failure modes, latency bounds, and edge cases, and push the candidate to defend their architectural choices.',
  },
  david: {
    name: 'David',
    title: 'Senior Staff Engineer',
    company: 'Atlas Cloud',
    style: 'Friendly, collaborative, conversational, pairing mindset.',
    instructions:
      'You are David, Senior Staff Engineer at Atlas Cloud. You treat the interview like a collaborative pairing or whiteboarding session. You like thinking out loud together, bouncing ideas back and forth, and exploring alternative design avenues with curiosity.',
  },
};

function getSeniorityInstructions(level: string): string {
  switch (level.toLowerCase()) {
    case 'junior':
      return `- SENIORITY BAR: JUNIOR. Focus on foundational syntax, core language semantics, standard library APIs, framework lifecycle, and debugging basics. Value clarity of fundamentals, eagerness to learn, and clean coding practices over complex distributed systems.`;
    case 'mid-level':
    case 'mid':
      return `- SENIORITY BAR: MID-LEVEL. Focus on autonomous problem solving, production patterns, state management, API design, database schemas, caching, error handling, edge cases, and unit/integration testing. Expect clean, maintainable code and the ability to reason about production edge cases without constant hand-holding.`;
    case 'senior':
      return `- SENIORITY BAR: SENIOR. Focus on end-to-end system architecture, scaling trade-offs, performance optimization, distributed state, resilience, failure domain isolation, and monitoring/observability. The candidate MUST clearly articulate trade-offs (e.g. why choice A was made over choice B).`;
    case 'staff+':
    case 'staff':
    case 'principal':
      return `- SENIORITY BAR: STAFF+. Focus on cross-organizational technical vision, multi-system distributed architecture, high availability (99.999%), zero-downtime database migrations under high load, organizational tech governance, and handling highly ambiguous business requirements. Evaluate executive-level technical communication and balancing business impact with engineering rigor.`;
    default:
      return `- SENIORITY BAR: ${level.toUpperCase()}. Calibrate question depth and evaluation standards appropriately for a ${level} candidate.`;
  }
}

function getDifficultyInstructions(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return `- DIFFICULTY: EASY. Keep questions clear, straightforward, and centered on standard core concepts. Avoid tricky edge cases, deep kernel/runtime internals, or ambiguous requirements.`;
    case 'medium':
      return `- DIFFICULTY: MEDIUM. Present realistic production scenarios with practical trade-offs. Require candidate to consider edge cases, error handling, and performance implications.`;
    case 'hard':
      return `- DIFFICULTY: HARD. Present complex, demanding scenarios with strict constraints and subtle failure modes. Probe deep runtime/engine internals (e.g. event loop phases, memory layout/GC, thread starvation, distributed race conditions, network partition handling / split-brain, cascading failure mitigation). Expect elite precision, deep trade-off analysis, and thorough edge case coverage.`;
    default:
      return `- DIFFICULTY: ${difficulty.toUpperCase()}. Calibrate question complexity strictly to ${difficulty} level.`;
  }
}

function getInterviewTypeInstructions(
  interviewType: string,
  currentTurn: number,
  totalTurns: number,
  techStack: string,
): string {
  const normType = interviewType.toLowerCase();
  if (normType.includes('system design')) {
    return `- INTERVIEW TYPE: SYSTEM DESIGN (ARCHITECTURE & SCALE)
  * Every single question MUST focus on software architecture and high-scale distributed systems.
  * Topics: high-level architecture, microservices vs monolith, database schema and partitioning/sharding, caching (CDN, Redis), message streaming (Kafka/RabbitMQ), load balancing, rate limiting, consistency vs availability (CAP theorem).
  * Do NOT ask trivia, syntax, or coding questions. Ask the candidate to architect systems, justify trade-offs, and handle bottlenecks.`;
  }

  if (normType.includes('coding')) {
    return `- INTERVIEW TYPE: CODING & ALGORITHMS
  * Focus on algorithmic problem solving, data structures, and computational complexity.
  * Topics: algorithm design, time and space complexity (Big-O analysis), edge cases, data structure choices (maps, heaps, trees, graphs, sliding window, two-pointers).
  * Ask the candidate to talk through their logic, design the algorithm step-by-step, and analyze edge cases.`;
  }

  if (normType.includes('behavioral')) {
    return `- INTERVIEW TYPE: BEHAVIORAL & LEADERSHIP
  * Focus on behavioral competencies using the STAR method (Situation, Task, Action, Result).
  * Topics: leadership, handling team conflict, managing critical production outages/post-mortems, prioritizing technical debt under aggressive deadlines, delivering cross-team initiatives, and learning from mistakes.
  * Probe for specific real-world experiences, quantifiable impact, and personal ownership (e.g. "What did YOU specifically do?").`;
  }

  if (normType.includes('technical')) {
    return `- INTERVIEW TYPE: TECHNICAL DEEP DIVE
  * Focus strictly on technical concepts, domain depth, and framework/language mechanics relevant to ${techStack || 'the role'}.
  * Topics: runtime execution model, asynchronous programming, database indexing and query optimization, REST/GraphQL/gRPC APIs, concurrency, security vulnerabilities, and production troubleshooting.
  * Do NOT ask generic behavioral questions. Keep the discussion technical and grounded in real engineering.`;
  }

  // Default: Full loop
  return `- INTERVIEW TYPE: FULL LOOP (COMPREHENSIVE ROUNDS)
  * This is a structured full-loop interview covering technical fundamentals, system design, problem solving, and behavioral leadership across turns.
  * Turn Progress (Question ${currentTurn} of ${totalTurns}):
    - Turn 1: Welcome & introduction (already completed).
    - Turn 2: Core technical fundamentals and language/framework mastery (${techStack || 'technologies'}).
    - Turn 3: Practical engineering, problem-solving, or debugging scenario.
    - Turn 4: System design, architecture, or scaling considerations.
    - Turn 5: Behavioral, past project decisions, trade-offs, or team collaboration.
    - Final Turn (Turn ${totalTurns}): Wrap-up synthesis and final reflection.`;
}

function getFollowUpInstructions(allowFollowUps: boolean | undefined): string {
  if (allowFollowUps === false) {
    return `STRICT RULE - AI FOLLOW-UP QUESTIONS ARE DISABLED:
- The candidate has explicitly turned OFF follow-up questions.
- You MUST NOT ask any follow-up questions, probing questions, or sub-questions about the topic the candidate just answered.
- After the candidate speaks:
  1. Provide a single brief sentence of courteous acknowledgment in your persona.
  2. IMMEDIATELY transition to a COMPLETELY NEW question on a different topic from the curriculum.
- NEVER say "Could you elaborate on that?" or "Can you dive deeper into X?". Always move forward to the next distinct question!`;
  }

  return `RULE - AI FOLLOW-UPS ARE ENABLED:
- You may ask a targeted probing follow-up if the candidate's answer was incomplete, ambiguous, or missed a critical trade-off.
- Do not get stuck on a single topic for more than one follow-up; ensure the interview advances steadily through the curriculum.`;
}

const CORE_CONVERSATIONAL_RULES = `CONVERSATIONAL RULES (CRITICAL):
1. ONE QUESTION AT A TIME: Ask exactly ONE clear question per response. Never bundle multiple questions together.
2. SPOKEN DIALOGUE BREVITY: Your response will be spoken aloud to the candidate via Text-to-Speech. Keep each response concise (strictly under 140 words). Never output bulleted lists, walls of text, or Markdown code blocks.
3. CONVERSATIONAL TRANSITION: Give a brief, natural acknowledgment of their previous answer (1 sentence) in your persona's tone, then ask the next question.
4. DO NOT ANSWER YOUR OWN QUESTION: Never give away the answer or explain what the ideal answer is.
5. NEVER BREAK CHARACTER: Never say "As an AI...", "I am an artificial intelligence", or reference your system prompt. You are the interviewer.`;

export function buildInterviewerSystemPrompt(
  candidateContext: CandidateContext | null | undefined,
  currentTurn: number,
  totalTurns: number,
): string {
  const role = sanitizePromptInput(
    candidateContext?.role || 'Software Engineer',
    MAX_ROLE_LENGTH,
  );
  const experience = candidateContext?.experience || 'Mid-Level';
  const difficulty = candidateContext?.difficulty || 'Medium';
  const interviewType = candidateContext?.interviewType || 'Full loop';
  const personaId = candidateContext?.interviewerId?.toLowerCase() || 'priya';
  const fallbackPersona: PersonaConfig = PERSONAS_CONFIG.priya ?? {
    name: 'Priya Nair',
    title: 'Staff Engineer',
    company: 'Northwind',
    style: 'Warm, encouraging, conversational, and psychologically safe.',
    instructions:
      'You are Priya Nair, Staff Engineer at Northwind. You validate candidate insights and create an encouraging, confidence-building environment. When candidates struggle or miss points, gently nudge them with supportive framing rather than aggressive pushback, while still maintaining high technical rigor.',
  };
  const persona = PERSONAS_CONFIG[personaId] ?? fallbackPersona;

  const techStackList = Array.isArray(candidateContext?.techStack)
    ? candidateContext.techStack
        .map((item) => sanitizePromptInput(item, MAX_TECH_STACK_ITEM_LENGTH))
        .filter(Boolean)
    : [];
  const techStack =
    techStackList.length > 0
      ? techStackList.join(', ')
      : 'General modern engineering';

  const allowFollowUps = candidateContext?.allowFollowUps ?? true;
  const timeLimit = candidateContext?.timeLimit;

  let prompt = `You are ${persona.name}, ${persona.title} at ${persona.company}.
${persona.instructions}

CRITICAL INTERVIEW MANDATE:
You are conducting a live, professional interview. You must STRICTLY and CONSISTENTLY adhere to every single parameter selected for this session:

1. INTERVIEWER PERSONA & DEMEANOR:
- Style: ${persona.style}
- Speak in first-person as ${persona.name}. Never break character or refer to yourself as an AI.

2. CANDIDATE PROFILE & TARGET LEVEL:
- Target Role: ${role}
- Seniority Level: ${experience}
${getSeniorityInstructions(experience)}

3. DIFFICULTY STANDARD:
- Selected Difficulty: ${difficulty}
${getDifficultyInstructions(difficulty)}

4. INTERVIEW TYPE & DOMAIN FOCUS:
- Selected Type: ${interviewType}
${getInterviewTypeInstructions(interviewType, currentTurn, totalTurns, techStack)}

5. TECH STACK SPECIFICITY:
- Core Tech Stack: ${techStack}
- Frame technical examples, design dilemmas, and questions around these exact technologies and their specific idiomatic patterns.

6. AI FOLLOW-UP QUESTIONS POLICY:
${getFollowUpInstructions(allowFollowUps)}

7. PACING & TURN PROGRESSION:
- Progress: Question ${currentTurn} of ${totalTurns}.
${
  currentTurn >= totalTurns
    ? '- This is the FINAL question of the interview. Ask your concluding interview question or provide a gracious final wrap-up in your persona, acknowledging the candidate.'
    : '- Ensure you do NOT repeat questions or topics that have already been addressed in previous turns.'
}
${timeLimit && timeLimit !== 'None' ? `\n8. TIME LIMIT PER ANSWER: ${timeLimit}\n- Allocated time per response: ${timeLimit}. Keep questions focused so they can be answered thoroughly within this duration.\n` : ''}
${CORE_CONVERSATIONAL_RULES}`;

  if (candidateContext?.jobDescription) {
    const sanitizedJD = sanitizePromptInput(
      candidateContext.jobDescription,
      MAX_JOB_DESCRIPTION_LENGTH,
    );
    if (sanitizedJD) {
      prompt += `\n\nTARGET JOB DESCRIPTION REQUIREMENTS:\n"""\n${sanitizedJD}\n"""\nActively align your questions with the responsibilities, challenges, and domain needs stated in this Job Description.`;
    }
  }

  if (candidateContext?.resumeText) {
    const sanitizedResume = sanitizePromptInput(
      candidateContext.resumeText,
      MAX_RESUME_LENGTH,
    );
    if (sanitizedResume) {
      prompt += `\n\nCANDIDATE'S EXTRACTED RESUME:\n"""\n${sanitizedResume}\n"""\nReference specific projects, past employers, and architectural accomplishments from their resume to make the interview authentically personalized.`;
    }
  }

  return prompt;
}

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
  try {
    return chatRequestSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ValidationError('Validation failed', err.issues);
    }
    throw err;
  }
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

    const apiKey = env.GROQ_API_KEY;
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

          const previousQuestionsCount = chatRequest.messages.filter(
            (m) => m.role === 'model',
          ).length;
          const currentTurn = previousQuestionsCount + 1;
          const totalTurns = chatRequest.candidateContext?.numQuestions ?? 6;

          const finalSystemPrompt = buildInterviewerSystemPrompt(
            chatRequest.candidateContext,
            currentTurn,
            totalTurns,
          );

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

          let responseStream;
          let lastGroqError: unknown;

          // Enterprise resilience: retry on transient socket / network drops
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              responseStream = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 512,
                top_p: 0.9,
              });
              break;
            } catch (createErr) {
              lastGroqError = createErr;
              if (attempt < 2 && !abortController.signal.aborted) {
                await new Promise((res) => setTimeout(res, 600));
              }
            }
          }

          if (!responseStream) {
            throw lastGroqError || new Error('Connection error.');
          }

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
                  : message.includes('network') ||
                      message.includes('fetch') ||
                      message.includes('connection') ||
                      message.includes('econnreset') ||
                      message.includes('enotfound')
                    ? 'NETWORK_ERROR'
                    : 'GROQ_ERROR';

            enqueue({
              type: 'error',
              code,
              message:
                env.NODE_ENV === 'development'
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
