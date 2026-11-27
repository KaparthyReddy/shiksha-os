import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface JoinGrant {
  room: string;
  identity: string;
  name: string;
  role: "teacher" | "student";
  canPublish: boolean;
  ttlSeconds: number;
}

/** Everything that talks to LiveKit. Config is passed in, so this file is easy to test. */
export function makeLiveKit(cfg: LiveKitConfig) {
  const secret = new TextEncoder().encode(cfg.apiSecret);

  return {
    /** A LiveKit access token is an HS256 JWT with a "video" grant. LiveKit itself enforces canPublish. */
    async createJoinToken(g: JoinGrant): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        name: g.name,
        metadata: JSON.stringify({ role: g.role }),
        video: {
          room: g.room,
          roomJoin: true,
          canPublish: g.canPublish,
          canPublishData: true,
          canSubscribe: true,
        },
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(cfg.apiKey)
        .setSubject(g.identity)
        .setNotBefore(now - 10)
        .setExpirationTime(now + g.ttlSeconds)
        .sign(secret);
    },

    /** Best effort: kicks everyone out when a teacher ends the class. Failure is not fatal. */
    async deleteRoom(room: string): Promise<void> {
      try {
        const token = await new SignJWT({ video: { roomCreate: true } })
          .setProtectedHeader({ alg: "HS256", typ: "JWT" })
          .setIssuer(cfg.apiKey)
          .setExpirationTime("1m")
          .sign(secret);
        await fetch(`${cfg.url.replace(/^ws/, "http")}/twirp/livekit.RoomService/DeleteRoom`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ room }),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        /* LiveKit unreachable or room already gone */
      }
    },

    /** LiveKit signs each webhook with a JWT whose sha256 claim is the base64 hash of the body. */
    async verifyWebhook(authHeader: string | undefined, rawBody: string): Promise<boolean> {
      if (!authHeader) return false;
      try {
        const { payload } = await jwtVerify(authHeader, secret, { algorithms: ["HS256"], issuer: cfg.apiKey });
        const expected = Buffer.from(createHash("sha256").update(rawBody).digest("base64"));
        const got = Buffer.from(typeof payload.sha256 === "string" ? payload.sha256 : "");
        return expected.length === got.length && timingSafeEqual(expected, got);
      } catch {
        return false;
      }
    },
  };
}

export type LiveKit = ReturnType<typeof makeLiveKit>;
