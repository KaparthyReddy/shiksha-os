import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default("ShikshaOS <noreply@shiksha.local>"),
});

export const env = schema.parse(process.env);
