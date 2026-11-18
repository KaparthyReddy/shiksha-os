import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { ROLES, type Role } from "@shiksha/shared";
import { env } from "../env";
import { unauthorized } from "./errors";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}

const enc = (s: string) => new TextEncoder().encode(s);

/** Access tokens are short-lived JWTs. Refresh tokens are opaque and stored in the database (see modules/auth). */
export async function issueAccessToken(ctx: AuthContext): Promise<string> {
  return new SignJWT({ tid: ctx.tenantId, role: ctx.role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ctx.userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(enc(env.JWT_ACCESS_SECRET));
}

async function verifyAccess(token: string): Promise<AuthContext> {
  const { payload } = await jwtVerify(token, enc(env.JWT_ACCESS_SECRET), { algorithms: ["HS256"] });
  if (
    payload.typ !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.tid !== "string" ||
    !ROLES.includes(payload.role as Role)
  ) {
    throw new Error("malformed token");
  }
  return { userId: payload.sub, tenantId: payload.tid, role: payload.role as Role };
}

/** Fastify preHandler: requires a valid access token and sets req.auth. */
export async function authenticate(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  try {
    req.auth = await verifyAccess(header.slice(7));
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}
