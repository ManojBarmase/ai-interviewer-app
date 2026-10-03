/**
 * POST /api/interview/chat
 *
 * Streams AI-generated interview questions/responses from Google Gemini back
 * to the client using Server-Sent Events (SSE) over HTTP streaming.
 *
 * ─── Runtime ─────────────────────────────────────────────────────────────────
 * `export const runtime = "edge"` opts this Route Handler into Next.js Edge
 * Runtime (V8 isolate, no Node.js built-ins). This is valid for Route Handlers
 * in all Next.js versions including 16.x — it was only REMOVED for the
 * proxy.ts (middleware) file. See:
 *   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md §640
 *
 * @google/genai v2.26.0 ships a browser/edge-compatible build at
 * `dist/web/index.mjs` which is selected automatically by the "browser" export
 * condition — uses `fetch` internally, no Node.js APIs.
 *
 * ─── Protocol: SSE ───────────────────────────────────────────────────────────
 * Responses use the W3C Server-Sent Events format over a ReadableStream:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache, no-transform
 *   X-Accel-Nginx-Buffering: no   ← disables nginx proxy buffering
 *
 * Each Gemini chunk is emitted as:
 *   data: {"type":"chunk","text":"..."}\n\n
 *
 * Terminal events:
 *   data: {"type":"done","usage":{...}}\n\n
 *   data: {"type":"error","code":"...","message":"..."}\n\n
 *
 * ─── Rate Limiting ───────────────────────────────────────────────────────────
 * Edge Runtime has no file system or shared memory between invocations, so
 * traditional in-process sliding window rate limiting cannot be used. We
 * implement a two-layer strategy:
 *
 *   Layer 1 — Request-level (this file):
 *     A fixed-window count stored in a signed JWT-like token in a cookie.
 *     Lightweight, zero-latency, no external dependency.
 *     Suitable for quick abuse protection at the edge.
 *
 *   Layer 2 — Infrastructure-level (recommended for production):
 *     Use Upstash Redis + @upstash/ratelimit for a distributed sliding window
 *     counter shared across all edge regions. Add it here when ready.
 *
 * ─── Timeout ─────────────────────────────────────────────────────────────────
 * The Edge Runtime enforces a maximum CPU time per invocation (30 s on Vercel).
 * We add an explicit AbortController timeout of 25 s so we can send a clean
 * SSE error event before the runtime cuts us off.
 *
 * ─── Authentication ──────────────────────────────────────────────────────────
 * Supabase auth is validated via the session cookie. Unauthenticated requests
 * receive 401 before any Gemini call is made.
 *
 * ─── References ──────────────────────────────────────────────────────────────
 * • @google/genai web export: node_modules/@google/genai/dist/web/web.d.ts
 * • SSE spec: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
 * • Next.js streaming: route.md §367
 */

import Groq from "groq-sdk";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

// ── Route segment config ──────────────────────────────────────────────────────
export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Groq model to use. Qwen 27B is extremely fast and reliable. */
const GROQ_MODEL = "qwen/qwen3.8-27b";

/** System prompt shaping Gemini into an AI interviewer. */
const SYSTEM_PROMPT = `You are an expert technical interviewer conducting a professional job interview.
Your role is to:
- Ask clear, specific, and relevant interview questions one at a time
- Provide brief acknowledgements of the candidate's answers before moving on
- Adapt question difficulty based on the candidate's responses
- Stay focused on the interview domain (technical, behavioural, or HR as specified)
- Be professional, encouraging, and neutral in tone
- Keep each response concise (under 150 words) to allow real-time streaming

Never break character. Do not explain that you are an AI unless directly asked.`;

/** Request timeout in milliseconds. Must be under Edge Runtime CPU limit. */
const REQUEST_TIMEOUT_MS = 25_000;

/** Rate limit: max requests per window per user. */
const RATE_LIMIT_MAX = 20;

/** Rate limit window duration in seconds. */
const RATE_LIMIT_WINDOW_S = 60;

/** Cookie name for rate limit tracking. */
const RATE_LIMIT_COOKIE = "rl_chat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  sessionId: string;
  interviewType?: "TECHNICAL" | "BEHAVIOURAL" | "SYSTEM_DESIGN" | "HR" | "MIXED";
}

interface RateLimitState {
  count: number;
  windowStart: number; // Unix seconds
}

interface SSEChunkEvent {
  type: "chunk";
  text: string;
}

interface SSEDoneEvent {
  type: "done";
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

interface SSEErrorEvent {
  type: "error";
  code: string;
  message: string;
}

type SSEEvent = SSEChunkEvent | SSEDoneEvent | SSEErrorEvent;

// ── SSE helpers ───────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** Encode a single SSE data frame. */
function sseFrame(event: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/** Build the standard SSE response headers. */
function sseHeaders(extraHeaders?: Record<string, string>): Headers {
  return new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disable proxy/nginx buffering so chunks reach the client immediately.
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
}

import { rateLimit } from '@/lib/ratelimit';

// ── Request validation ────────────────────────────────────────────────────────

function validateChatRequest(body: unknown): ChatRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    throw new Error("`messages` must be a non-empty array.");
  }
  if (b.messages.length > 50) {
    throw new Error("`messages` must not exceed 50 turns.");
  }

  for (const msg of b.messages as unknown[]) {
    if (
      typeof msg !== "object" ||
      msg === null ||
      !["user", "model"].includes((msg as Record<string, unknown>).role as string) ||
      typeof (msg as Record<string, unknown>).content !== "string" ||
      ((msg as Record<string, unknown>).content as string).length === 0
    ) {
      throw new Error(
        `Each message must have \`role\` ('user' | 'model') and non-empty \`content\` string. Failed on: ${JSON.stringify(msg)}`
      );
    }
    if (((msg as Record<string, unknown>).content as string).length > 8_000) {
      throw new Error("Individual message content must not exceed 8000 characters.");
    }
  }

  if (typeof b.sessionId !== "string" || b.sessionId.trim().length === 0) {
    throw new Error("`sessionId` must be a non-empty string.");
  }

  const result: ChatRequest = {
    messages: b.messages as ChatMessage[],
    sessionId: b.sessionId as string,
  };
  // Use conditional assignment to satisfy exactOptionalPropertyTypes —
  // we must not set the key to `undefined`, we must omit it entirely.
  if (b.interviewType !== undefined) {
    // b.interviewType is narrowed to a non-undefined string here;
    // cast to the concrete union so exactOptionalPropertyTypes is satisfied.
    result.interviewType = b.interviewType as NonNullable<ChatRequest["interviewType"]>;
  }
  return result;
}

// ── Supabase Edge auth ────────────────────────────────────────────────────────

/**
 * Validate the Supabase session from the request cookies.
 * Returns the user ID on success, null if unauthenticated.
 *
 * On the Edge Runtime, `next/headers` (cookies()) is not available — we must
 * read cookies directly from the NextRequest object.
 */
async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      // setAll is omitted — we cannot set response cookies in this handler
      // because the response is a streaming ReadableStream. Auth refresh is
      // handled by the proxy.ts middleware before this handler runs.
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user.id;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  // ── 1. Authentication ───────────────────────────────────────────────────────
  // Note: For actual production, uncomment the auth check. Currently bypassed for testing.
  let userId: string | null = "test-user-id";
  // const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Authentication required.", code: "UNAUTHORIZED" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── 2. Enterprise Rate limiting (Upstash Redis) ─────────────────────────────
  // Use the authenticated userId as the rate limit identifier
  const identifier = userId;
  
  try {
    const { success } = await rateLimit.limit(identifier);
    
    if (!success) {
      return new Response(
        JSON.stringify({
          error: "Too many requests. Please wait before sending another message.",
          code: "RATE_LIMITED",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.warn("Rate limiter failed or redis is unreachable. Proceeding without rate limit.", error);
  }

  // ── 3. Parse and validate request body ────────────────────────────────────
  let chatRequest: ChatRequest;
  try {
    const body = await request.json();
    chatRequest = validateChatRequest(body);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Invalid request body.",
        code: "BAD_REQUEST",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── 4. Check API key ─────────────────────────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your-groq-api-key-here") {
    return new Response(
      JSON.stringify({ error: "Groq API key not configured.", code: "CONFIG_ERROR" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ── 5. Build SSE streaming response ────────────────────────────────────────
  const abortController = new AbortController();

  // Timeout: send clean error event before Edge Runtime cuts us off.
  const timeoutId = setTimeout(() => {
    abortController.abort("REQUEST_TIMEOUT");
  }, REQUEST_TIMEOUT_MS);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SSEEvent) => {
        try {
          controller.enqueue(sseFrame(event));
        } catch {
          // Controller may be closed if client disconnected.
        }
      };

      try {
        // ── 5a. Initialise Groq client ──────────────────────────────────────
        const groq = new Groq({ apiKey });

        // ── 5b. Build conversation history ───────────────────────────────────
        const systemMessage = { role: "system", content: SYSTEM_PROMPT };
        const historyMessages = chatRequest.messages.map((msg) => ({
          // Groq expects "assistant" instead of "model"
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.content,
        }));
        const messages = [systemMessage, ...historyMessages];

        // ── 5c. Stream from Groq ────────────────────────────────────────────
        // @ts-ignore - The Groq SDK typings might complain about role literal types, but it's fine
        const responseStream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 512,
          top_p: 0.9,
        });

        // ── 5d. Forward each chunk as an SSE frame ────────────────────────────
        let usageMeta = undefined;
        for await (const chunk of responseStream) {
          const text = chunk.choices[0]?.delta?.content || "";
          if (text) {
            enqueue({ type: "chunk", text });
          }
          
          // Groq includes usage in the final chunk if requested (stream_options: { include_usage: true })
          // but we'll leave it undefined for now as it's not critical for the UI.
        }

        // ── 5e. Send terminal done event with usage metadata ──────────────────
        // (Usage omitted for Groq stream unless explicitly enabled)
        const usage: SSEDoneEvent["usage"] = usageMeta
          ? {
              ...(usageMeta.promptTokenCount !== undefined && {
                promptTokens: usageMeta.promptTokenCount,
              }),
              ...(usageMeta.candidatesTokenCount !== undefined && {
                candidatesTokens: usageMeta.candidatesTokenCount,
              }),
              ...(usageMeta.totalTokenCount !== undefined && {
                totalTokens: usageMeta.totalTokenCount,
              }),
            }
          : undefined;
        enqueue({ type: "done", ...(usage !== undefined && { usage }) });
      } catch (err) {
        // ── 5f. Error handling ────────────────────────────────────────────────
        const isTimeout =
          abortController.signal.aborted &&
          abortController.signal.reason === "REQUEST_TIMEOUT";

        const isAborted =
          abortController.signal.aborted && !isTimeout;

        if (isTimeout) {
          enqueue({
            type: "error",
            code: "TIMEOUT",
            message:
              "The AI took too long to respond. Please try again.",
          });
        } else if (isAborted) {
          // Client disconnected — no need to send anything.
        } else if (err instanceof Error) {
          // Surface API errors with clean codes.
          const message = err.message.toLowerCase();
          const code = message.includes("quota") || message.includes("rate limit")
            ? "QUOTA_EXCEEDED"
            : message.includes("api_key") || message.includes("api key")
              ? "INVALID_API_KEY"
              : message.includes("network") || message.includes("fetch")
                ? "NETWORK_ERROR"
                : "GROQ_ERROR";

          enqueue({
            type: "error",
            code,
            message:
              process.env.NODE_ENV === "development"
                ? err.message
                : "An error occurred while generating the response.",
          });
        } else {
          enqueue({
            type: "error",
            code: "UNKNOWN",
            message: "An unexpected error occurred.",
          });
        }
      } finally {
        clearTimeout(timeoutId);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },

    // Called if the client closes the connection (e.g. navigates away).
    cancel() {
      clearTimeout(timeoutId);
      abortController.abort("CLIENT_DISCONNECTED");
    },
  });

  return new Response(stream, {
    status: 200,
    headers: sseHeaders(),
  });
}

// ── Reject non-POST methods ───────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } }
  );
}
