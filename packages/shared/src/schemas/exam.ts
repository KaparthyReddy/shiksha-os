import { z } from "zod";

export const answerResponse = z
  .union([z.string(), z.number(), z.array(z.string())])
  .nullable();

/** One locally-buffered answer. clientSeq increases per question; the server keeps the highest. */
export const answerSyncItem = z.object({
  questionId: z.string().uuid(),
  response: answerResponse,
  markedForReview: z.boolean().default(false),
  clientSeq: z.number().int().nonnegative(),
  clientTs: z.number().int().positive(),
});

export const syncAnswersSchema = z.object({
  answers: z.array(answerSyncItem).min(1).max(200),
});

export type AnswerSyncItem = z.infer<typeof answerSyncItem>;
export type SyncAnswersInput = z.infer<typeof syncAnswersSchema>;
