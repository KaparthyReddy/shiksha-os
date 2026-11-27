import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { makeLiveKit } from "./livekit";

const cfg = { url: "ws://localhost:7880", apiKey: "testkey", apiSecret: "s".repeat(40) };
const lk = makeLiveKit(cfg);
const key = new TextEncoder().encode(cfg.apiSecret);

async function signed(body: string, secret = key) {
  return new SignJWT({ sha256: createHash("sha256").update(body).digest("base64") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(cfg.apiKey)
    .setExpirationTime("5m")
    .sign(secret);
}

describe("livekit tokens", () => {
  it("issues a verifiable token with the right grant", async () => {
    const token = await lk.createJoinToken({
      room: "room-1", identity: "user-1", name: "Asha", role: "student", canPublish: false, ttlSeconds: 3600,
    });
    const { payload } = await jwtVerify(token, key, { issuer: cfg.apiKey });
    expect(payload.sub).toBe("user-1");
    expect(payload.name).toBe("Asha");
    expect(JSON.parse(String(payload.metadata))).toEqual({ role: "student" });
    expect(payload.video).toMatchObject({ room: "room-1", roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: true });
    expect(payload.exp! - Math.floor(Date.now() / 1000)).toBeGreaterThan(3500);
  });

  it("lets a teacher publish", async () => {
    const token = await lk.createJoinToken({
      room: "r", identity: "t", name: "T", role: "teacher", canPublish: true, ttlSeconds: 60,
    });
    const { payload } = await jwtVerify(token, key);
    expect((payload.video as { canPublish: boolean }).canPublish).toBe(true);
  });
});

describe("livekit webhook verification", () => {
  const body = JSON.stringify({ event: "participant_joined" });

  it("accepts a correctly signed body", async () => {
    expect(await lk.verifyWebhook(await signed(body), body)).toBe(true);
  });
  it("rejects a tampered body, a wrong secret, a missing header and garbage", async () => {
    expect(await lk.verifyWebhook(await signed(body), body + " ")).toBe(false);
    expect(await lk.verifyWebhook(await signed(body, new TextEncoder().encode("x".repeat(40))), body)).toBe(false);
    expect(await lk.verifyWebhook(undefined, body)).toBe(false);
    expect(await lk.verifyWebhook("not-a-jwt", body)).toBe(false);
  });
});
