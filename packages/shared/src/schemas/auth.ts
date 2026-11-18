import { z } from "zod";

export const loginSchema = z.object({
  tenant: z.string().min(2).max(64).toLowerCase(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
