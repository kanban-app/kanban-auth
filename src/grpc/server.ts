import * as grpc from "@grpc/grpc-js";
import {
  AuthServiceService,
  type AuthServiceServer,
} from "./generated/auth/v1/auth.js";
import { prisma } from "../db.js";
import {
  verifyAccessToken,
  isTokenBlacklisted,
} from "../services/token.service.js";
import { env } from "../config/env.js";

const authServiceImpl: AuthServiceServer = {
  async validateToken(call, callback) {
    const { token } = call.request;

    try {
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        return callback(null, { valid: false, userId: "", email: "" });
      }

      const payload = verifyAccessToken(token);

      return callback(null, {
        valid: true,
        userId: payload.userId,
        email: payload.email,
      });
    } catch {
      return callback(null, { valid: false, userId: "", email: "" });
    }
  },

  async getUserPermissions(call, callback) {
    const { userId } = call.request;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return callback(null, { isMember: false, role: "" });
    }

    return callback(null, { isMember: true, role: "MEMBER" });
  },
};

export function startGrpcServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = new grpc.Server();

    server.addService(AuthServiceService, authServiceImpl);

    server.bindAsync(
      `0.0.0.0:${env.GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`gRPC server listening on port ${port}`);
        resolve();
      },
    );
  });
}
