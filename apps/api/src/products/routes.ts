import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { importRows, imports, products, shotRequests } from "../db/schema.js";
import { loadRequests } from "../requests/projection-loader.js";
import { summarizeProductRequests } from "./summary.js";

export async function productRoutes(app: FastifyInstance) {
  app.get("/products", async () => {
    const all = await db().select().from(products).orderBy(asc(products.sku));
    if (all.length === 0) return { products: [] };

    const requestIds = await db().select({ id: shotRequests.id }).from(shotRequests);
    const loaded = await loadRequests(requestIds.map((r) => r.id));
    const summaries = summarizeProductRequests(
      [...loaded.values()].map((l) => ({
        productId: l.request.productId,
        status: l.status,
        candidates: l.candidates.map((c) => ({
          decision: c.decision?.decision ?? null,
          assetState: c.asset?.storeState ?? null,
          publicId: c.asset?.publicId ?? null,
          reviewedAt: c.decision?.reviewedAt ?? null,
        })),
      })),
    );

    const empty = {
      requestCount: 0,
      statusCounts: {},
      approvedCount: 0,
      approvedAssetPublicId: null,
    };
    return {
      products: all.map((p) => ({ ...p, ...(summaries[p.id] ?? empty) })),
    };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
    const found = await db().query.products.findFirst({
      where: eq(products.id, req.params.id),
    });
    if (!found) return reply.code(404).send({ error: "Product not found" });

    const requestIds = await db()
      .select({ id: shotRequests.id })
      .from(shotRequests)
      .where(eq(shotRequests.productId, found.id));
    const loaded = await loadRequests(requestIds.map((r) => r.id));

    // SKU is the join key across Imports (CONTEXT.md) — appearances are the
    // immutable row snapshots for this SKU, in import order.
    const appearances = await db()
      .select({ row: importRows, import: imports })
      .from(importRows)
      .innerJoin(imports, eq(importRows.importId, imports.id))
      .where(eq(importRows.sku, found.sku))
      .orderBy(asc(imports.createdAt), asc(importRows.rowIndex));

    const filenameByImport = new Map(
      appearances.map((a) => [a.import.id, a.import.originalFilename]),
    );

    return {
      product: found,
      requests: [...loaded.values()]
        .sort((a, b) => b.request.createdAt.getTime() - a.request.createdAt.getTime())
        .map((l) => ({
          id: l.request.id,
          importId: l.request.importId,
          importFilename: filenameByImport.get(l.request.importId) ?? null,
          shotIdea: l.request.shotIdea,
          status: l.status,
          approvedCount: l.approvedCount,
          requiredApprovals: l.request.requiredApprovals,
          spendUsd: l.spendUsd,
          createdAt: l.request.createdAt,
        })),
      appearances: appearances.map((a) => ({
        importId: a.import.id,
        importFilename: a.import.originalFilename,
        importedAt: a.import.createdAt,
        confirmedAt: a.import.confirmedAt,
        rowIndex: a.row.rowIndex,
        shotIdea: a.row.shotIdea,
        notes: a.row.notes,
        productReconciliation: a.row.productReconciliation,
        creativeWork: a.row.creativeWork,
        deferredAt: a.row.deferredAt,
        shotRequestId: a.row.shotRequestId,
      })),
    };
  });
}
