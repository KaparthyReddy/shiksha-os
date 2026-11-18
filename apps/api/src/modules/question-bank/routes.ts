import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { questionSchema } from "@shiksha/shared";
import { questions, examQuestions, examSessions, eq, and, ilike, sql, desc, type Tx } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";
import { idParams, pageQuery, likeTerm, conflict } from "../../core/http";

const staff = requireRole("admin", "teacher");

const listQuery = pageQuery.extend({
  subject: z.string().trim().max(80).optional(),
  topic: z.string().trim().max(120).optional(),
});

async function usage(tx: Tx, questionId: string) {
  const [r] = await tx
    .select({
      exams: sql<number>`count(distinct ${examQuestions.examId})::int`,
      attempts: sql<number>`count(distinct ${examSessions.id})::int`,
    })
    .from(examQuestions)
    .leftJoin(examSessions, eq(examSessions.examId, examQuestions.examId))
    .where(eq(examQuestions.questionId, questionId));
  return { exams: r?.exams ?? 0, attempts: r?.attempts ?? 0 };
}

export async function questionBankRoutes(app: FastifyInstance) {
  app.get("/questions", { preHandler: staff }, async (req) => {
    const { page, pageSize, q, subject, topic } = listQuery.parse(req.query);
    return inTenant(req, async (tx) => {
      const where = and(
        subject ? eq(questions.subject, subject) : undefined,
        topic ? eq(questions.topic, topic) : undefined,
        q ? ilike(questions.body, likeTerm(q)) : undefined,
      );
      const items = await tx
        .select()
        .from(questions)
        .where(where)
        .orderBy(desc(questions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(questions).where(where);
      return { items, total: row?.total ?? 0, page, pageSize };
    });
  });

  app.post("/questions", { preHandler: staff }, async (req, reply) => {
    const body = questionSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const q = await inTenant(req, async (tx) => {
      const [created] = await tx
        .insert(questions)
        .values({ tenantId, ...body, options: body.options ?? null, createdBy: userId })
        .returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "question.create", entity: "question", entityId: created!.id,
        payload: { subject: body.subject },
      });
      return created;
    });
    return reply.status(201).send(q);
  });

  // Full replace. Blocked once students have attempted an exam containing the question,
  // because changing it would silently change already-graded results.
  app.put("/questions/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = questionSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [existing] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.id, id)).limit(1);
      if (!existing) throw notFound("Question not found");
      if ((await usage(tx, id)).attempts > 0) {
        throw conflict("This question is part of an exam students have already attempted");
      }
      const [q] = await tx
        .update(questions)
        .set({ ...body, options: body.options ?? null })
        .where(eq(questions.id, id))
        .returning();
      await writeAudit(tx, tenantId, { actorId: userId, action: "question.update", entity: "question", entityId: id });
      return q;
    });
  });

  app.delete("/questions/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      if ((await usage(tx, id)).exams > 0) throw conflict("Remove this question from its exams first");
      const gone = await tx.delete(questions).where(eq(questions.id, id)).returning({ id: questions.id });
      if (gone.length === 0) throw notFound("Question not found");
      await writeAudit(tx, tenantId, { actorId: userId, action: "question.delete", entity: "question", entityId: id });
      return { ok: true };
    });
  });
}
