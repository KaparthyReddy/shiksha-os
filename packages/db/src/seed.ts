import { hash } from "@node-rs/argon2";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "./schema";

const PASSWORD = "demo1234";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set (check your .env)");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: s });

  const existing = await db.query.tenants.findFirst({
    where: eq(s.tenants.slug, "demo-academy"),
  });
  if (existing) {
    console.log("Seed already applied, skipping.");
    await client.end();
    return;
  }

  const passwordHash = await hash(PASSWORD);

  await db.transaction(async (tx) => {
    // ---------- Tenant 1: Demo Academy ----------
    const [t] = await tx
      .insert(s.tenants)
      .values({ slug: "demo-academy", name: "Demo Academy" })
      .returning();
    const tenantId = t!.id;

    const [admin] = await tx
      .insert(s.users)
      .values({ tenantId, email: "admin@demo.test", passwordHash, name: "Demo Admin", role: "admin" })
      .returning();

    const [teacherUser] = await tx
      .insert(s.users)
      .values({ tenantId, email: "teacher@demo.test", passwordHash, name: "Demo Teacher", role: "teacher" })
      .returning();
    await tx.insert(s.faculty).values({
      tenantId,
      userId: teacherUser!.id,
      designation: "Physics Faculty",
      subjects: ["Physics"],
    });

    const [course] = await tx
      .insert(s.courses)
      .values({ tenantId, name: "NEET Foundation", code: "NEET-F" })
      .returning();
    const [batch] = await tx
      .insert(s.batches)
      .values({
        tenantId,
        courseId: course!.id,
        name: "NEET 2027 - Morning",
        startsOn: "2026-06-01",
        endsOn: "2027-05-01",
        capacity: 60,
      })
      .returning();

    const [teacherFaculty] = await tx.select({ id: s.faculty.id }).from(s.faculty).where(eq(s.faculty.userId, teacherUser!.id));
    await tx.insert(s.batchTeachers).values({ tenantId, batchId: batch!.id, facultyId: teacherFaculty!.id });

    for (let i = 1; i <= 5; i++) {
      const [u] = await tx
        .insert(s.users)
        .values({ tenantId, email: `student${i}@demo.test`, passwordHash, name: `Student ${i}`, role: "student" })
        .returning();
      const [st] = await tx
        .insert(s.students)
        .values({
          tenantId,
          userId: u!.id,
          rollNo: `DA-2026-00${i}`,
          guardianName: `Guardian ${i}`,
          guardianPhone: `90000000${i}0`,
        })
        .returning();
      await tx.insert(s.enrollments).values({ tenantId, batchId: batch!.id, studentId: st!.id });
    }

    const bank = [
      { body: "A body moves with uniform velocity. Its acceleration is:", opts: ["Zero", "Constant and non-zero", "Increasing", "Decreasing"], ans: 0 },
      { body: "The SI unit of force is:", opts: ["Joule", "Newton", "Watt", "Pascal"], ans: 1 },
      { body: "The approximate value of g near Earth's surface is:", opts: ["9.8 m/s²", "98 m/s²", "0.98 m/s²", "980 m/s²"], ans: 0 },
      { body: "Which of the following is a vector quantity?", opts: ["Speed", "Mass", "Displacement", "Time"], ans: 2 },
      { body: "Work done by a force perpendicular to the displacement is:", opts: ["Maximum", "Negative", "Zero", "Infinite"], ans: 2 },
    ];
    const ids = ["a", "b", "c", "d"];
    const qRows = await tx
      .insert(s.questions)
      .values(
        bank.map((q) => ({
          tenantId,
          subject: "Physics",
          topic: "Mechanics",
          body: q.body,
          options: q.opts.map((text, idx) => ({ id: ids[idx]!, text })),
          correct: [ids[q.ans]!],
          createdBy: teacherUser!.id,
        })),
      )
      .returning();

    const [exam] = await tx
      .insert(s.exams)
      .values({
        tenantId,
        title: "Physics Mock CBT #1",
        batchId: batch!.id,
        durationMinutes: 30,
        status: "published",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        createdBy: admin!.id,
      })
      .returning();
    await tx.insert(s.examQuestions).values(
      qRows.map((q, idx) => ({ tenantId, examId: exam!.id, questionId: q.id, position: idx + 1 })),
    );

    // ---------- Tenant 2: exists only to prove isolation ----------
    const [t2] = await tx
      .insert(s.tenants)
      .values({ slug: "other-academy", name: "Other Academy" })
      .returning();
    await tx.insert(s.users).values({
      tenantId: t2!.id, email: "admin@other.test", passwordHash, name: "Other Admin", role: "admin",
    });
    await tx.insert(s.users).values({
      tenantId: t2!.id, email: "hidden@other.test", passwordHash, name: "Hidden Student", role: "student",
    });
  });

  await client.end();
  console.log(`✔ seeded. Login (tenant demo-academy): admin@demo.test / teacher@demo.test / student1@demo.test, password "${PASSWORD}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
