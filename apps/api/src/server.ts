import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { authPlugin } from "./auth/plugin.js";
import { importRoutes } from "./imports/routes.js";
import { confirmRoutes } from "./imports/confirm.js";
import { requestRoutes } from "./requests/routes.js";
import { assetRoutes } from "./assets/routes.js";
import { reviewRoutes, reviewSendRoutes } from "./review/routes.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  const authEnabled = Boolean(config.SESSION_SECRET);
  if (authEnabled) {
    app.register(authPlugin);
  }

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.register(assetRoutes);
  app.register(reviewRoutes);

  // Operator surface. Guarded when auth is configured; SESSION_SECRET-less
  // boot (local dev without env, /health smoke) runs open with a loud warning.
  app.register(async (operator) => {
    if (authEnabled) {
      operator.addHook("preHandler", (req, reply) => app.requireOperator(req, reply));
    } else {
      app.log.warn("SESSION_SECRET not set — operator routes are UNPROTECTED (dev only)");
    }
    await operator.register(importRoutes);
    await operator.register(confirmRoutes);
    await operator.register(requestRoutes);
    await operator.register(reviewSendRoutes);
  });

  return app;
}
