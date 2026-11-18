import { z } from "zod";

export const createStudentSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().toLowerCase(),
  rollNo: z.string().min(1).max(32),
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().regex(/^[0-9+\- ]{8,15}$/).optional(),
  batchId: z.string().uuid().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
