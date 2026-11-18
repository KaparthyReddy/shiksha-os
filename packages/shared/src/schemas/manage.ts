import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const uuid = z.string().uuid();

// ---------- Courses ----------
export const createCourseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24).toUpperCase(),
});
export const updateCourseSchema = createCourseSchema.partial();

// ---------- Batches ----------
const orderOk = (b: { startsOn?: string | null; endsOn?: string | null }) =>
  !b.startsOn || !b.endsOn || b.startsOn <= b.endsOn;
const orderMsg = { message: "endsOn must be on or after startsOn", path: ["endsOn"] };

export const createBatchSchema = z
  .object({
    courseId: uuid,
    name: z.string().trim().min(2).max(120),
    startsOn: dateStr.optional(),
    endsOn: dateStr.optional(),
    capacity: z.number().int().min(1).max(10000).optional(),
  })
  .refine(orderOk, orderMsg);

export const updateBatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    startsOn: dateStr.nullable().optional(),
    endsOn: dateStr.nullable().optional(),
    capacity: z.number().int().min(1).max(10000).nullable().optional(),
  })
  .refine(orderOk, orderMsg);

export const enrollSchema = z.object({ studentId: uuid });

// ---------- Students ----------
export const updateStudentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    rollNo: z.string().trim().min(1).max(32),
    guardianName: z.string().max(120).nullable(),
    guardianPhone: z.string().regex(/^[0-9+\- ]{8,15}$/).nullable(),
    isActive: z.boolean(),
  })
  .partial();

// ---------- Faculty ----------
export const createFacultySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().toLowerCase(),
  designation: z.string().max(120).optional(),
  subjects: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const updateFacultySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    designation: z.string().max(120).nullable(),
    subjects: z.array(z.string().trim().min(1).max(60)).max(20),
    isActive: z.boolean(),
  })
  .partial();
