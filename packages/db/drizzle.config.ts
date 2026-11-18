import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      "postgres://shiksha:shiksha@localhost:5432/shiksha",
  },
});
