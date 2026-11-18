import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { createDb, sql } from "@shiksha/db";
import { env } from "./env";
import { AppError } from "./core/errors";
import { authRoutes } from "./modules/auth/routes";
import { auditRoutes } from "./modules/audit/routes";
import { tenantRoutes } from "./modules/tenants/routes";
import { academicsRoutes } from "./modules/academics/routes";
import { studentRoutes } from "./modules/students/routes";
import { facultyRoutes } from "./modules/faculty/routes";
import { questionBankRoutes } from "./modules/question-bank/routes";
import { examRoutes } from "./modules/exams/routes";
import { sessionRoutes } from "./modules/exams/sessions";
import { attendanceRoutes } from "./modules/attendance/routes";
import { feeRoutes } from "./modules/fees/routes";

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : true,
  });

  const { db, client } = createDb(env.DATABASE_URL);
  app.decorate("db", db);
  app.decorateRequest("auth", null);
  app.addHook("onClose", async () => {
    await client.end();
  });

  await app.register(cors, { origin: env.WEB_URL, credentials: true });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler(
    (error: Error & { statusCode?: number; code?: string }, req, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
      }
      if (error instanceof ZodError) {
        return reply
          .status(400)
          .send({ error: { code: "validation_error", message: "Invalid request", details: error.flatten() } });
      }
      if (error.statusCode && error.statusCode < 500) {
        return reply
          .status(error.statusCode)
          .send({ error: { code: error.code ?? "bad_request", message: error.message } });
      }
      req.log.error(error);
      return reply.status(500).send({ error: { code: "internal", message: "Something went wrong" } });
    },
  );

  app.get("/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  await app.register(authRoutes);
  await app.register(auditRoutes);
  await app.register(tenantRoutes);
  await app.register(academicsRoutes);
  await app.register(studentRoutes);
  await app.register(facultyRoutes);
  await app.register(questionBankRoutes);
  await app.register(examRoutes);
  await app.register(sessionRoutes);
  await app.register(attendanceRoutes);
  await app.register(feeRoutes);

  return app;
}
