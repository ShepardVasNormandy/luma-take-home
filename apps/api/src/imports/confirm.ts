import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  directionVersions,
  generationAttempts,
  importRows,
  imports,
  products,
  shotRequests,
} from "../db/schema.js";
import { assembleGenerationBody, priceSnapshotUsd } from "../luma/assemble.js";
import { preflightPhoto } from "./preflight.js";

const reconcileBody = z.object({
  rowIds: z.array(z.string().uuid()).min(1),
  choice: z.enum(["USE_IMPORTED", "KEEP_EXISTING"]),
});

const confirmBody = z.object({
  selectedRowIds: z.array(z.string().uuid()),
});

const startRequestBody = z.object({
  shotIdea: z.string().trim().min(1).optional(),
});

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type ImportRow = typeof importRows.$inferSelect;
type Product = typeof products.$inferSelect;

async function createRequestWithDirection(
  tx: Tx,
  row: ImportRow,
  product: Product,
  shotIdea: string,
) {
  const [request] = await tx
    .insert(shotRequests)
    .values({
      productId: product.id,
      importId: row.importId,
      importRowId: row.id,
      shotIdea,
    })
    .returning();

  const [direction] = await tx
    .insert(directionVersions)
    .values({
      shotRequestId: request!.id,
      version: 1,
      content: shotIdea,
      provenance: "INITIAL",
    })
    .returning();

  await tx.update(importRows).set({ shotRequestId: request!.id }).where(eq(importRows.id, row.id));

  return { request: request!, direction: direction! };
}

async function createSubmittingAttempt(
  tx: Tx,
  requestId: string,
  directionId: string,
  directionContent: string,
  product: Product,
) {
  const facts = {
    name: product.name,
    colorFinish: product.colorFinish,
    material: product.material,
    photoUrl: product.photoUrl!,
  };
  const body = assembleGenerationBody(directionContent, facts);
  await tx.insert(generationAttempts).values({
    shotRequestId: requestId,
    directionVersionId: directionId,
    state: "SUBMITTING",
    requestPayload: body,
    sourceSnapshot: facts,
    model: body.model,
    priceSnapshotUsd: String(priceSnapshotUsd()),
  });
}

export async function confirmRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/imports/:id/reconcile", async (req, reply) => {
    const body = reconcileBody.parse(req.body);
    const found = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!found) return reply.code(404).send({ error: "Import not found" });
    if (found.confirmedAt) return reply.code(409).send({ error: "Import already confirmed" });

    const updated = await db()
      .update(importRows)
      .set({ reconciliationChoice: body.choice })
      .where(
        and(
          inArray(importRows.id, body.rowIds),
          eq(importRows.importId, found.id),
          eq(importRows.productReconciliation, "PRODUCT_CHANGED"),
        ),
      )
      .returning({ id: importRows.id });

    return { updated: updated.length };
  });

  app.post<{ Params: { id: string } }>("/imports/:id/confirm", async (req, reply) => {
    const body = confirmBody.parse(req.body);
    const found = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!found) return reply.code(404).send({ error: "Import not found" });
    if (found.confirmedAt) return reply.code(409).send({ error: "Import already confirmed" });

    const rows = await db().select().from(importRows).where(eq(importRows.importId, found.id));
    const rowById = new Map(rows.map((r) => [r.id, r]));

    const unresolved = rows.filter(
      (r) => r.productReconciliation === "PRODUCT_CHANGED" && r.reconciliationChoice === null,
    );
    if (unresolved.length > 0) {
      return reply.code(400).send({
        error: "Unresolved product changes",
        rowIds: unresolved.map((r) => r.id),
      });
    }

    const selected = new Set(body.selectedRowIds);
    for (const id of selected) {
      const row = rowById.get(id);
      if (!row) return reply.code(400).send({ error: `Row ${id} not in this import` });
      if (row.creativeWork !== "REQUEST_ELIGIBLE") {
        return reply.code(400).send({ error: `Row ${id} is not eligible for generation` });
      }
    }

    const counts = {
      productsCreated: 0,
      productsUpdated: 0,
      requestsCreated: 0,
      needsInput: 0,
      deferred: 0,
      attemptsQueued: 0,
    };

    await db().transaction(async (tx) => {
      const validRows = rows.filter((r) => r.validity === "VALID" && r.sku);

      for (const row of validRows) {
        if (row.productReconciliation === "NEW_PRODUCT") {
          await tx.insert(products).values({
            sku: row.sku!,
            name: row.productName,
            category: row.category,
            colorFinish: row.colorFinish,
            material: row.material,
            priceRaw: row.priceRaw,
            photoUrl: row.photoUrl,
          });
          counts.productsCreated++;
        } else if (
          row.productReconciliation === "PRODUCT_CHANGED" &&
          row.reconciliationChoice === "USE_IMPORTED"
        ) {
          await tx
            .update(products)
            .set({
              name: row.productName,
              category: row.category,
              colorFinish: row.colorFinish,
              material: row.material,
              priceRaw: row.priceRaw,
              photoUrl: row.photoUrl,
              updatedAt: new Date(),
            })
            .where(eq(products.sku, row.sku!));
          counts.productsUpdated++;
        }
      }

      const skus = validRows.map((r) => r.sku!);
      const canon = skus.length
        ? await tx.select().from(products).where(inArray(products.sku, skus))
        : [];
      const canonBySku = new Map(canon.map((p) => [p.sku, p]));

      for (const row of validRows) {
        const product = canonBySku.get(row.sku!);
        if (!product) continue;

        if (row.creativeWork === "NEEDS_INPUT") {
          await createRequestWithDirection(tx, row, product, row.shotIdea ?? "");
          counts.requestsCreated++;
          counts.needsInput++;
        } else if (row.creativeWork === "REQUEST_ELIGIBLE") {
          if (!selected.has(row.id)) {
            await tx
              .update(importRows)
              .set({ deferredAt: new Date() })
              .where(eq(importRows.id, row.id));
            counts.deferred++;
          } else {
            const { request, direction } = await createRequestWithDirection(
              tx,
              row,
              product,
              row.shotIdea!,
            );
            await createSubmittingAttempt(tx, request.id, direction.id, direction.content, product);
            counts.requestsCreated++;
            counts.attemptsQueued++;
          }
        }
      }

      await tx.update(imports).set({ confirmedAt: new Date() }).where(eq(imports.id, found.id));
    });

    return {
      ...counts,
      estimatedSpendUsd: Number((counts.attemptsQueued * priceSnapshotUsd()).toFixed(4)),
    };
  });

  // Deferred-row start and authored ideas share one endpoint (SPEC §5):
  // "Save idea & generate first candidate" — the explicit action IS the gate.
  app.post<{ Params: { id: string; rowId: string } }>(
    "/imports/:id/rows/:rowId/request",
    async (req, reply) => {
      const body = startRequestBody.parse(req.body ?? {});
      const found = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
      if (!found) return reply.code(404).send({ error: "Import not found" });
      if (!found.confirmedAt) return reply.code(409).send({ error: "Import not confirmed yet" });

      const row = await db().query.importRows.findFirst({
        where: and(eq(importRows.id, req.params.rowId), eq(importRows.importId, found.id)),
      });
      if (!row) return reply.code(404).send({ error: "Row not found" });
      if (row.shotRequestId) return reply.code(409).send({ error: "Request already exists for this row" });
      if (row.validity !== "VALID" || !row.sku) {
        return reply.code(400).send({ error: "Row is invalid — no product identity" });
      }

      // The Shot Idea is the row's own (deferred start) or authored now.
      // Once captured it is immutable (CONTEXT.md).
      const shotIdea = row.shotIdea ?? body.shotIdea;
      if (!shotIdea) return reply.code(400).send({ error: "shotIdea required for a row without one" });

      const product = await db().query.products.findFirst({ where: eq(products.sku, row.sku) });
      if (!product) return reply.code(409).send({ error: "Product not applied to canon" });

      const photoOk = product.photoUrl ? await preflightPhoto(product.photoUrl) : false;

      const result = await db().transaction(async (tx) => {
        const { request, direction } = await createRequestWithDirection(tx, row, product, shotIdea);
        if (photoOk) {
          await createSubmittingAttempt(tx, request.id, direction.id, direction.content, product);
        }
        return request;
      });

      return reply.code(201).send({
        request: result,
        generating: photoOk,
        ...(photoOk ? {} : { blocked: "Source photo missing or unreachable — fix it, then generate" }),
      });
    },
  );
}
