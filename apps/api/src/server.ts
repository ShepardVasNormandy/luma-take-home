import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { importRoutes } from "./imports/routes.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.register(importRoutes);

  return app;
}
