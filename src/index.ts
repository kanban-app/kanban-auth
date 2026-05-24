import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth.routes.js";
import { startGrpcServer } from "./grpc/server.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { env } from "./config/env.js";

async function bootstrap() {
  await redis.connect();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
    },
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? "http://139.100.205.119/" : true,
    credentials: true,
  });

  await app.register(authRoutes);

  const shutdown = async () => {
    console.log("Shutting down...");
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await Promise.all([
    app.listen({ host: "0.0.0.0", port: env.PORT }),
    startGrpcServer(),
  ]);
}

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
