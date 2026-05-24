import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash } from "crypto";
import { redis } from "../redis.js";
import { env } from "../config/env.js";

interface TokenPayload {
  userId: string;
  email: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const accessOptions: SignOptions = {
  expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
};

const refreshOptions: SignOptions = {
  expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
};

export function generateTokens(payload: TokenPayload): TokenPair {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, accessOptions);

  const refreshToken = jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET,
    refreshOptions,
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

// Добавляем токен в blacklist до истечения его срока жизни
export async function blacklistToken(token: string): Promise<void> {
  const decoded = jwt.decode(token) as { exp?: number } | null;

  if (!decoded?.exp) return;

  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  if (ttl <= 0) return; // токен уже истёк — не нужно добавлять

  const hash = createHash("sha256").update(token).digest("hex");
  await redis.set(`blacklist:${hash}`, "1", "EX", ttl);
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await redis.get(`blacklist:${hash}`);
  return result !== null;
}
