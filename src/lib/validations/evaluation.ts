import { z } from 'zod';

export const evaluationSchema = z.object({
  technicalScore: z.number().min(1).max(10),
  communicationScore: z.number().min(1).max(10),
  problemSolvingScore: z.number().min(1).max(10).optional().nullable(),
  deliveryScore: z.number().min(1).max(10).optional().nullable(),
  cultureFitScore: z.number().min(1).max(10).optional().nullable(),
  overallScore: z.number().min(0).max(100).optional().nullable(),
  strongAreas: z.array(z.string()),
  weakAreas: z.array(z.string()),
  actionableFeedback: z.string().min(1),
  recommendation: z.enum(['STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO']),
  questions: z
    .array(
      z.object({
        title: z.coerce.string().nullable().optional(),
        answer: z.coerce.string().nullable().optional(),
        followUp: z.coerce.string().nullable().optional(),
        score: z.coerce.number().min(0).max(100).nullable().optional(),
        type: z.coerce.string().nullable().optional(),
        difficulty: z.coerce.string().nullable().optional(),
        metrics: z
          .object({
            content: z.coerce.number().min(0).max(100).nullable().optional(),
            clarity: z.coerce.number().min(0).max(100).nullable().optional(),
            delivery: z.coerce.number().min(0).max(100).nullable().optional(),
            time: z.coerce.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        conceptsCovered: z.array(z.coerce.string()).nullable().optional(),
        conceptsMissed: z.array(z.coerce.string()).nullable().optional(),
        modelAnswer: z.coerce.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export type EvaluationType = z.infer<typeof evaluationSchema>;
