import { z } from 'zod';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string().min(1).max(8000),
});

export const candidateContextSchema = z
  .object({
    role: z.string().optional(),
    experience: z.string().optional(),
    difficulty: z.string().optional(),
    interviewType: z.string().optional(),
    techStack: z.array(z.string()).optional(),
    jobDescription: z.string().optional(),
    resumeText: z.string().optional(),
    interviewerId: z.string().optional(),
    numQuestions: z.number().optional(),
    timeLimit: z.string().optional(),
    allowFollowUps: z.boolean().optional(),
  })
  .passthrough();

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  sessionId: z.string().trim().min(1),
  interviewType: z
    .enum(['TECHNICAL', 'BEHAVIOURAL', 'SYSTEM_DESIGN', 'HR', 'MIXED'])
    .optional(),
  candidateContext: candidateContextSchema.optional().nullable(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type CandidateContext = z.infer<typeof candidateContextSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
