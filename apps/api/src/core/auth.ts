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

async function sign(ctx: AuthContext, typ: "access" | "refresh", secret: string, ttl: string) {
  return new SignJWT({ tid: ctx.tenantId, role: ctx.role, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ctx.userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(enc(secret));
}

async function verifyToken(token: string, typ: "access" | "refresh", secret: string): Promise<AuthContext> {
  const { payload } = await jwtVerify(token, enc(secret), { algorithms: ["HS256"] });
  if (
    payload.typ !== typ ||
    typeof payload.sub !== "string" ||
    typeof payload.tid !== "string" ||
    !ROLES.includes(payload.role as Role)
  ) {
    throw new Error("malformed token");
  }
  return { userId: payload.sub, tenantId: payload.tid, role: payload.role as Role };
}

export async function issueTokens(ctx: AuthContext) {
  const [accessToken, refreshToken] = await Promise.all([
    sign(ctx, "access", env.JWT_ACCESS_SECRET, "15m"),
    sign(ctx, "refresh", env.JWT_REFRESH_SECRET, "7d"),
  ]);
  return { accessToken, refreshToken };
}

export const verifyRefresh = (token: string) => verifyToken(token, "refresh", env.JWT_REFRESH_SECRET);

/** Fastify preHandler: requires a valid access token and sets req.auth. */
export async function authenticate(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  try {
    req.auth = await verifyToken(header.slice(7), "access", env.JWT_ACCESS_SECRET);
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}
