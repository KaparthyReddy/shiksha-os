import { buildApp } from "./app";
import { env } from "./env";

async function main() {
  const app = await buildApp();
  await app.listen({
    port: env.API_PORT,
    host: env.API_HOST ?? (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  });

  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
