import { z } from 'zod';

export const evaluationSchema = z.object({
  technicalScore: z.number().min(1).max(10),
  communicationScore: z.number().min(1).max(10),
  strongAreas: z.array(z.string()),
  weakAreas: z.array(z.string()),
  actionableFeedback: z.string().min(1),
  recommendation: z.enum(["STRONG_YES", "YES", "NEUTRAL", "NO", "STRONG_NO"]),
});

export type EvaluationType = z.infer<typeof evaluationSchema>;
