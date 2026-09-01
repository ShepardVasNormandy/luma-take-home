import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { assets } from "../db/schema.js";
import { presignGet } from "../storage/index.js";

// Public capability URL (CONTEXT.md): stable, unauthenticated, unguessable.
// Bucket stays private; we 302 to a short-lived presigned GET.
export async function assetRoutes(app: FastifyInstance) {
  app.get<{ Params: { publicId: string }; Querystring: { download?: string; filename?: string } }>(
    "/assets/:publicId",
    async (req, reply) => {
      const asset = await db().query.assets.findFirst({
        where: eq(assets.publicId, req.params.publicId),
      });
      if (!asset || asset.storeState !== "STORED") {
        return reply.code(404).send({ error: "Asset not found" });
      }
      const url = await presignGet(asset.storageKey, {
        expiresInSeconds: 300,
        ...(req.query.download !== undefined
          ? { downloadFilename: req.query.filename ?? `${asset.publicId}.jpg` }
          : {}),
      });
      return reply.redirect(url, 302);
    },
  );
}
