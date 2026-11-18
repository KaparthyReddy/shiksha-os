import type { FastifyInstance } from "fastify";
import { createFacultySchema, updateFacultySchema } from "@shiksha/shared";
import { faculty, users, eq, or, ilike, sql, asc } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound, badRequest } from "../../core/errors";
import { idParams, pageQuery, likeTerm, rethrowUnique } from "../../core/http";
import { generateTempPassword, hashPassword } from "../../core/passwords";

const staff = requireRole("admin", "teacher");
const admin = requireRole("admin");

const facultyCols = {
  id: faculty.id,
  userId: faculty.userId,
  name: users.name,
  email: users.email,
  designation: faculty.designation,
  subjects: faculty.subjects,
  isActive: users.isActive,
  createdAt: faculty.createdAt,
};

export async function facultyRoutes(app: FastifyInstance) {
  app.get("/faculty", { preHandler: staff }, async (req) => {
    const { page, pageSize, q } = pageQuery.parse(req.query);
    return inTenant(req, async (tx) => {
      const where = q ? or(ilike(users.name, likeTerm(q)), ilike(users.email, likeTerm(q))) : undefined;

      const items = await tx
        .select(facultyCols)
        .from(faculty)
        .innerJoin(users, eq(users.id, faculty.userId))
        .where(where)
        .orderBy(asc(users.name))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [row] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(faculty)
        .innerJoin(users, eq(users.id, faculty.userId))
        .where(where);

      return { items, total: row?.total ?? 0, page, pageSize };
    });
  });

  app.get("/faculty/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const [f] = await inTenant(req, (tx) =>
      tx.select(facultyCols).from(faculty).innerJoin(users, eq(users.id, faculty.userId)).where(eq(faculty.id, id)).limit(1),
    );
    if (!f) throw notFound("Faculty member not found");
    return f;
  });

  app.post("/faculty", { preHandler: admin }, async (req, reply) => {
    const body = createFacultySchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const temporaryPassword = generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const member = await inTenant(req, async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ tenantId, email: body.email, passwordHash, name: body.name, role: "teacher" })
          .returning({ id: users.id });

        const [f] = await tx
          .insert(faculty)
          .values({ tenantId, userId: u!.id, designation: body.designation, subjects: body.subjects })
          .returning();

        await writeAudit(tx, tenantId, {
          actorId: userId, action: "faculty.create", entity: "faculty", entityId: f!.id,
        });
        return { id: f!.id, userId: u!.id, name: body.name, email: body.email };
      });
      return reply.status(201).send({ faculty: member, temporaryPassword });
    } catch (e) {
      rethrowUnique(e, "A user with this email already exists");
    }
  });

  app.patch("/faculty/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateFacultySchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");
    const { tenantId, userId } = req.auth!;

    return inTenant(req, async (tx) => {
      const [f] = await tx.select({ userId: faculty.userId }).from(faculty).where(eq(faculty.id, id)).limit(1);
      if (!f) throw notFound("Faculty member not found");

      const { name, isActive, designation, subjects } = body;
      if (name !== undefined || isActive !== undefined) {
        await tx.update(users).set({ name, isActive }).where(eq(users.id, f.userId));
      }
      if (designation !== undefined || subjects !== undefined) {
        await tx.update(faculty).set({ designation, subjects }).where(eq(faculty.id, id));
      }

      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: body.isActive === false ? "faculty.deactivate" : "faculty.update",
        entity: "faculty",
        entityId: id,
        payload: { fields: Object.keys(body) },
      });
      return { ok: true };
    });
  });
}
