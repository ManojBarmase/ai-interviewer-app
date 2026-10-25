import 'server-only';

import {
  MAX_RESUME_LENGTH,
  MAX_ROLE_LENGTH,
  MAX_TECH_STACK_ITEM_LENGTH,
  sanitizePromptInput,
} from '@/server/utils/sanitize-prompt-input';

export interface CandidateContext {
  role?: string;
  experience?: string;
  level?: string;
  techStack?: string[];
  resumeText?: string;
  interviewType?: string;
  type?: string;
}

export interface StructuredTurn {
  question: string;
  rawTranscript: string | null;
}

export function buildSystemInstruction(
  candidateContext?: CandidateContext | null,
): string {
  let systemInstruction = `You are a strict, highly experienced Senior Engineering Manager conducting an interview evaluation.
Analyze the provided interview transcript thoroughly. 
You must objectively evaluate the candidate's technical skills, communication abilities, and overall fit.
Return a structured JSON response strictly adhering to the required schema. Ensure scores are between 1.0 and 10.0.`;

  if (candidateContext) {
    const roleText = candidateContext.role
      ? sanitizePromptInput(candidateContext.role, MAX_ROLE_LENGTH)
      : 'Software Engineer';
    const expText =
      candidateContext.experience || candidateContext.level || 'Mid-Level';
    const techText = Array.isArray(candidateContext.techStack)
      ? candidateContext.techStack
          .map((item) => sanitizePromptInput(item, MAX_TECH_STACK_ITEM_LENGTH))
          .filter(Boolean)
          .join(', ') || 'General'
      : 'General';
    systemInstruction += `\n\nContext about the candidate:\n- Role: ${roleText}\n- Experience: ${expText}\n- Tech Stack: ${techText}\nPlease judge their performance strictly against these exact criteria and seniority expectations.`;

    if (candidateContext.resumeText) {
      const sanitizedResume = sanitizePromptInput(
        candidateContext.resumeText,
        MAX_RESUME_LENGTH,
      );
      systemInstruction += `\n\nAdditionally, here is their Extracted Resume:\n"""\n${sanitizedResume}\n"""\nEvaluate if their answers align with the claims made in their resume.`;
    }
  }

  return systemInstruction;
}

export function buildQuestionsInstructions(totalTurnsCount: number): string {
  if (totalTurnsCount <= 0) return '';

  return `
CRITICAL QUESTION COUNT & EVALUATION REQUIREMENTS:
1. You MUST evaluate EVERY single question listed above. Your output JSON "questions" array MUST contain EXACTLY ${totalTurnsCount} objects, strictly 1-to-1 in the exact same chronological order (Question 1 through Question ${totalTurnsCount}).
2. Do NOT drop or skip Question 1 (if it is an introduction/background question, set type to "Behavioral" and score their communication, clarity, and self-presentation).
3. Do NOT merge separate interview questions into the "followUp" field! Each question asked by the interviewer in the transcript is an independent turn and MUST be its own object in "questions".
4. The "followUp" field is only for a RECOMMENDED future practice question you suggest the candidate practice later (or null). Never put actual interview turns into it.`;
}

export function buildPromptWithSchema(
  candidateContext?: CandidateContext | null,
  totalTurnsCount = 0,
): string {
  const systemInstruction = buildSystemInstruction(candidateContext);
  const questionsPromptInstructions =
    buildQuestionsInstructions(totalTurnsCount);

  return `${systemInstruction}
${questionsPromptInstructions}

IMPORTANT: You must output ONLY a valid JSON object matching this schema exactly:
{
  "technicalScore": <number 1.0 to 10.0, evaluating technical mastery, architecture, and correctness>,
  "problemSolvingScore": <number 1.0 to 10.0, evaluating algorithmic reasoning, trade-offs, and edge case coverage>,
  "communicationScore": <number 1.0 to 10.0, evaluating clarity, structure, and verbal articulation>,
  "deliveryScore": <number 1.0 to 10.0, evaluating speaking pace, confidence, and fluency>,
  "cultureFitScore": <number 1.0 to 10.0, evaluating business impact, ownership, and engineering mindset>,
  "strongAreas": ["string", "string"],
  "weakAreas": ["string", "string"],
  "actionableFeedback": "string",
  "recommendation": "STRONG_YES" | "YES" | "NEUTRAL" | "NO" | "STRONG_NO",
  "questions": [
    {
      "title": "The exact verbatim question that the AI interviewer asked (do not summarize)",
      "answer": "Candidate's response",
      "followUp": "A recommended follow-up question for future practice (optional, or null)",
      "score": <number 0 to 100>,
      "type": "Coding" | "System Design" | "Behavioral" | "Technical" | "DevOps",
      "difficulty": "easy" | "medium" | "hard",
      "metrics": {
        "content": <number 0 to 100>,
        "clarity": <number 0 to 100>,
        "delivery": <number 0 to 100>,
        "time": "00:30"
      },
      "conceptsCovered": ["string"],
      "conceptsMissed": ["string"],
      "modelAnswer": "Ideal answer"
    }
  ]
}`;
}

export function buildUserPromptContent(
  structuredTurns: StructuredTurn[],
  fallbackTranscript: string,
): string {
  if (structuredTurns.length > 0) {
    return (
      `There were EXACTLY ${structuredTurns.length} questions asked in this interview. Here is the full chronological question-by-question record:\n\n` +
      structuredTurns
        .map(
          (t, idx) =>
            `--- QUESTION ${idx + 1} OF ${structuredTurns.length} ---\nInterviewer: ${sanitizePromptInput(t.question, 1000)}\nCandidate: ${t.rawTranscript ? sanitizePromptInput(t.rawTranscript, 4000) : '(Silence / Skipped)'}`,
        )
        .join('\n\n')
    );
  }

  return sanitizePromptInput(fallbackTranscript, 8000);
}
