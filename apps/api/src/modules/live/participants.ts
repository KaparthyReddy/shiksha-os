import { liveParticipants, and, eq, sql, type Tx } from "@shiksha/db";

/** Adds the time since openSince to the running total. */
const addSeconds = () =>
  sql<number>`${liveParticipants.totalSeconds} + greatest(0, floor(extract(epoch from (now() - ${liveParticipants.openSince}))))::int`;
const isOpen = sql`${liveParticipants.openSince} is not null`;
const target = [liveParticipants.liveClassId, liveParticipants.userId];

/** A join token was issued: remember the person, without counting a join (the webhook does that). */
export async function touchJoin(tx: Tx, tenantId: string, classId: string, userId: string) {
  await tx
    .insert(liveParticipants)
    .values({ tenantId, liveClassId: classId, userId })
    .onConflictDoUpdate({ target, set: { lastJoinedAt: new Date() } });
}

export async function markJoined(tx: Tx, tenantId: string, classId: string, userId: string) {
  await tx
    .insert(liveParticipants)
    .values({ tenantId, liveClassId: classId, userId, openSince: new Date(), joinCount: 1 })
    .onConflictDoUpdate({
      target,
      set: {
        lastJoinedAt: new Date(),
        openSince: sql`coalesce(${liveParticipants.openSince}, now())`,
        joinCount: sql`${liveParticipants.joinCount} + 1`,
      },
    });
}

export async function closeOpenForUser(tx: Tx, classId: string, userId: string) {
  await tx
    .update(liveParticipants)
    .set({ totalSeconds: addSeconds(), openSince: null, lastLeftAt: new Date() })
    .where(and(eq(liveParticipants.liveClassId, classId), eq(liveParticipants.userId, userId), isOpen));
}

export async function closeOpenForClass(tx: Tx, classId: string) {
  await tx
    .update(liveParticipants)
    .set({ totalSeconds: addSeconds(), openSince: null, lastLeftAt: new Date() })
    .where(and(eq(liveParticipants.liveClassId, classId), isOpen));
}
