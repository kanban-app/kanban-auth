import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../db.js";
import {
  generateTokens,
  verifyRefreshToken,
  blacklistToken,
  isTokenBlacklisted,
} from "../services/token.service.js";
import "@fastify/cookie";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /register
  app.post("/register", async (request, reply) => {
    const result = registerSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, password, name } = result.data;

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return reply.status(409).send({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return reply.status(201).send({ user });
  });

  // POST /login
  app.post("/login", async (request, reply) => {
    const result = loginSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: "Validation failed" });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = generateTokens({
      userId: user.id,
      email: user.email,
    });

    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/refresh",
      maxAge: 60 * 60 * 24 * 7, // 7 дней в секундах
    });

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  });

  // POST /refresh
  app.post("/refresh", async (request, reply) => {
    const refreshToken = request.cookies["refreshToken"];

    if (!refreshToken) {
      return reply.status(401).send({ error: "Refresh token not found" });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
      });

      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "strict",
        path: "/refresh",
        maxAge: 60 * 60 * 24 * 7,
      });

      return reply.send({ accessToken: tokens.accessToken });
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
  });

  // POST /logout
  app.post("/logout", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const refreshToken = request.cookies["refreshToken"];

    // Добавляем access token в blacklist
    if (authHeader?.startsWith("Bearer ")) {
      const accessToken = authHeader.slice(7);
      await blacklistToken(accessToken);
    }

    // Чистим cookie
    reply.clearCookie("refreshToken", { path: "/refresh" });

    return reply.send({ message: "Logged out successfully" });
  });

  // GET /health
  app.get("/health", async () => {
    return { status: "ok", service: "auth" };
  });
}
