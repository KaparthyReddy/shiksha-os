import type { FastifyInstance } from "fastify";
import { liveClasses, users, withTenant, eq } from "@shiksha/db";
import { parseRoomName } from "./calc";
import { lk } from "./instance";
import { closeOpenForClass, closeOpenForUser, markJoined } from "./participants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LiveKit posts events as application/webhook+json, signed with a JWT in the Authorization header.
 * The raw body is needed to check the signature, so this lives in its own encapsulated plugin.
 */
export async function liveWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/webhook+json", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/livekit", async (req, reply) => {
    const raw = typeof req.body === "string" ? req.body : "";
    const auth = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!(await lk.verifyWebhook(auth, raw))) {
      return reply.status(401).send({ error: { code: "unauthorized", message: "Bad signature" } });
    }

    let ev: { event?: unknown; room?: { name?: unknown }; participant?: { identity?: unknown } };
    try {
      ev = JSON.parse(raw);
    } catch {
      return reply.status(400).send({ error: { code: "bad_request", message: "Invalid JSON" } });
    }

    const room = parseRoomName(String(ev.room?.name ?? ""));
    if (!room) return { ok: true }; // some other room, not ours
    const type = String(ev.event ?? "");
    const identity = String(ev.participant?.identity ?? "");

    await withTenant(app.db, room.tenantId, async (tx) => {
      const [cls] = await tx.select({ id: liveClasses.id }).from(liveClasses).where(eq(liveClasses.id, room.classId)).limit(1);
      if (!cls) return;

      if (type === "participant_joined" && UUID.test(identity)) {
        const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, identity)).limit(1);
        if (u) await markJoined(tx, room.tenantId, room.classId, identity);
      } else if (type === "participant_left" && UUID.test(identity)) {
        await closeOpenForUser(tx, room.classId, identity);
      } else if (type === "room_finished") {
        await closeOpenForClass(tx, room.classId);
      }
    });
    return { ok: true };
  });
}
