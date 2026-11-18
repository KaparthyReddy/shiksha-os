import "fastify";
import type { Db } from "@shiksha/db";
import type { AuthContext } from "./auth";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
