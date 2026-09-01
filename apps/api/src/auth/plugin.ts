import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";
import * as argon2 from "argon2";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireConfig } from "../config.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    role: "operator";
  }
}

declare module "fastify" {
  interface FastifyInstance {
    requireOperator: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}

const loginBody = z.object({ email: z.string(), password: z.string() });

const FAILURE_DELAY_MS = 300;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const authPlugin = fp(
  async (app) => {
    await app.register(secureSession, {
      secret: requireConfig("SESSION_SECRET"),
      salt: "shots-auth-salt!",
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: "auto",
      },
    });

    app.decorate("requireOperator", async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.session.get("role") !== "operator") {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });

    app.post("/auth/login", async (req, reply) => {
      const failed = async () => {
        await sleep(FAILURE_DELAY_MS);
        return reply.code(401).send({ error: "Invalid credentials" });
      };

      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) return failed();

      const operatorEmail = requireConfig("OPERATOR_EMAIL");
      const passwordHash = requireConfig("OPERATOR_PASSWORD_HASH");

      const emailMatches =
        parsed.data.email.trim().toLowerCase() === operatorEmail.trim().toLowerCase();
      if (!emailMatches) return failed();

      const passwordMatches = await argon2.verify(passwordHash, parsed.data.password);
      if (!passwordMatches) return failed();

      req.session.set("role", "operator");
      return { ok: true };
    });

    app.post("/auth/logout", async (req) => {
      req.session.delete();
      return { ok: true };
    });
  },
  { name: "auth" },
);
