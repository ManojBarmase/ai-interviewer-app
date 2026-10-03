import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { prisma } from '@/lib/prisma';
import { evaluationSchema } from '@/lib/validations/evaluation';
import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';

// Initialize Groq SDK
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, userId, transcript } = body;

    // Default to 'anonymous' if no userId is provided, though in production auth is required
    const identifier = userId || 'anonymous';
    
    // Enterprise Rate limiting (Upstash Redis)
    try {
      const { success } = await rateLimit.limit(identifier);
      if (!success) {
        return NextResponse.json(
          { error: "Too many requests. Please wait before evaluating another interview." }, 
          { status: 429 }
        );
      }
    } catch (rlError) {
      console.warn("Rate limiter failed or redis is unreachable. Proceeding without rate limit.", rlError);
    }

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: "A valid transcript string is required" }, { status: 400 });
    }

    // 1. Strict System Prompt for Senior Engineering Manager persona
    const systemInstruction = `You are a strict, highly experienced Senior Engineering Manager conducting an interview evaluation.
Analyze the provided interview transcript thoroughly. 
You must objectively evaluate the candidate's technical skills, communication abilities, and overall fit.
Return a structured JSON response strictly adhering to the required schema. Ensure scores are between 1.0 and 10.0.`;

    // 2. Groq structured outputs are achieved by prompting + JSON mode
    // Include the schema in the prompt to ensure it follows the format.
    const promptWithSchema = `${systemInstruction}
    
    IMPORTANT: You must output ONLY a valid JSON object matching this schema exactly:
    {
      "technicalScore": <number 1.0 to 10.0>,
      "communicationScore": <number 1.0 to 10.0>,
      "strongAreas": ["string", "string"],
      "weakAreas": ["string", "string"],
      "actionableFeedback": "string",
      "recommendation": "STRONG_YES" | "YES" | "NEUTRAL" | "NO" | "STRONG_NO"
    }`;

    // 3. Call Groq to analyze the transcript
    const response = await groq.chat.completions.create({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: promptWithSchema },
        { role: 'user', content: transcript }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for deterministic, analytical evaluation
    });

    const evalText = response.choices[0]?.message?.content;
    if (!evalText) {
      throw new Error("AI returned an empty evaluation response");
    }

    // 4. Parse JSON and validate with Zod
    let parsedJson;
    try {
      parsedJson = JSON.parse(evalText);
    } catch (e) {
      throw new Error("AI returned malformed JSON");
    }
    
    const evaluation = evaluationSchema.parse(parsedJson);

    // 5. Save the evaluation to the Prisma database if session context is provided
    if (sessionId && userId) {
      try {
        const overallScore = (evaluation.technicalScore + evaluation.communicationScore) / 2;

        // Note: If userId is "test-user-id" (mocked) or the sessionId wasn't actually created 
        // in the DB, this will fail due to Foreign Key constraints. We catch and log it so 
        // the evaluation is still returned to the user.
        if (userId !== "test-user-id") {
          await prisma.scorecard.upsert({
            where: { sessionId: sessionId },
            update: {
              technicalScore: evaluation.technicalScore,
              communicationScore: evaluation.communicationScore,
              overallScore: overallScore,
              strengths: evaluation.strongAreas.join('\n- '),
              weaknesses: evaluation.weakAreas.join('\n- '),
              detailedFeedback: evaluation.actionableFeedback,
              recommendation: evaluation.recommendation,
            },
            create: {
              sessionId,
              userId,
              technicalScore: evaluation.technicalScore,
              communicationScore: evaluation.communicationScore,
              overallScore: overallScore,
              strengths: evaluation.strongAreas.join('\n- '),
              weaknesses: evaluation.weakAreas.join('\n- '),
              detailedFeedback: evaluation.actionableFeedback,
              recommendation: evaluation.recommendation,
            }
          });
        } else {
          console.log("[MOCK_MODE] Skipping Prisma DB save for scorecard because userId is mocked.");
        }
      } catch (dbError) {
        console.warn("Failed to save scorecard to database (likely missing User/Session records):", dbError);
      }
    }

    return NextResponse.json({ success: true, evaluation });

  } catch (error: any) {
    console.error("[EVALUATION_ERROR]", error);
    
    // Handle specific Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "AI output validation failed", 
        details: error.errors 
      }, { status: 422 });
    }
    
    return NextResponse.json({ error: error.message || "Failed to evaluate transcript" }, { status: 500 });
  }
}
