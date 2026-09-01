import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { importRows, imports, products, shotRequests } from "../db/schema.js";
import { computeReadinessByImport } from "../exports/builder.js";
import { computeImportCounts } from "./counts.js";
import { loadRequests } from "../requests/projection-loader.js";
import { CsvParseError, parseCatalogCsv } from "./parse.js";
import { computeDisposition } from "./stage.js";
import { preflightMany } from "./preflight.js";

export async function importRoutes(app: FastifyInstance) {
  app.post("/imports", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Missing CSV file upload" });

    const buffer = await file.toBuffer();
    const contentHash = createHash("sha256")
      .update(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))
      .digest("hex");

    const existing = await db().query.imports.findFirst({
      where: eq(imports.contentHash, contentHash),
    });
    if (existing) return reply.code(200).send({ existing: true, import: existing });

    let parsed;
    try {
      parsed = parseCatalogCsv(buffer);
    } catch (err) {
      if (err instanceof CsvParseError) return reply.code(400).send({ error: err.message });
      throw err;
    }

    const skus = parsed.rows.map((r) => r.sku).filter((s): s is string => s !== null);
    const currentProducts = skus.length
      ? await db().select().from(products).where(inArray(products.sku, skus))
      : [];
    const bySku = new Map(currentProducts.map((p) => [p.sku, p]));

    const staged = parsed.rows.map((row) => ({
      row,
      disposition: computeDisposition(row, row.sku ? bySku.get(row.sku) : undefined),
    }));

    // Preflight only rows that could actually generate (CONTEXT eligibility).
    const preflightUrls = staged
      .filter((s) => s.disposition.creativeWork === "REQUEST_ELIGIBLE")
      .map((s) => s.row.photoUrl!)
      .filter(Boolean);
    const preflight = await preflightMany(preflightUrls);

    const [created] = await db()
      .insert(imports)
      .values({
        originalFilename: file.filename ?? "catalog.csv",
        contentHash,
        headers: parsed.headers,
        rowCount: parsed.rows.length,
      })
      .returning();

    if (parsed.rows.length > 0) {
      await db()
        .insert(importRows)
        .values(
          staged.map(({ row, disposition }) => {
            const eligible = disposition.creativeWork === "REQUEST_ELIGIBLE";
            const photoOk = eligible ? (preflight.get(row.photoUrl!) ?? false) : null;
            return {
              importId: created!.id,
              rowIndex: row.rowIndex,
              raw: row.raw,
              sku: row.sku,
              productName: row.productName,
              category: row.category,
              colorFinish: row.colorFinish,
              material: row.material,
              priceRaw: row.priceRaw,
              photoUrl: row.photoUrl,
              shotIdea: row.shotIdea,
              notes: row.notes,
              validity: row.validity,
              invalidReason: row.invalidReason,
              productReconciliation: disposition.productReconciliation,
              creativeWork: eligible && photoOk === false ? ("NEEDS_INPUT" as const) : disposition.creativeWork,
              photoChanged: disposition.photoChanged,
              photoPreflight: eligible ? (photoOk ? ("OK" as const) : ("FAILED" as const)) : ("SKIPPED" as const),
            };
          }),
        );
    }

    return reply.code(201).send({ existing: false, import: created });
  });

  app.get("/imports", async () => {
    const all = await db().select().from(imports).orderBy(asc(imports.createdAt));
    if (all.length === 0) return { imports: [] };

    const ids = all.map((i) => i.id);
    const [requestIds, creativeRows] = await Promise.all([
      db()
        .select({ id: shotRequests.id })
        .from(shotRequests)
        .where(inArray(shotRequests.importId, ids)),
      db()
        .select({
          importId: importRows.importId,
          creativeWork: importRows.creativeWork,
          deferredAt: importRows.deferredAt,
        })
        .from(importRows)
        .where(inArray(importRows.importId, ids)),
    ]);
    const loaded = await loadRequests(requestIds.map((r) => r.id));
    const requestFacts = [...loaded.values()].map((l) => ({
      importId: l.request.importId,
      status: l.status,
    }));
    const readiness = computeReadinessByImport(ids, requestFacts, creativeRows);
    const counts = computeImportCounts(ids, requestFacts, creativeRows);

    return {
      imports: all.map((imp) => ({ ...imp, readiness: readiness[imp.id], counts: counts[imp.id] })),
    };
  });

  app.get<{ Params: { id: string } }>("/imports/:id", async (req, reply) => {
    const found = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!found) return reply.code(404).send({ error: "Import not found" });

    const rows = await db()
      .select()
      .from(importRows)
      .where(eq(importRows.importId, found.id))
      .orderBy(asc(importRows.rowIndex));

    const changedSkus = rows
      .filter((r) => r.productReconciliation === "PRODUCT_CHANGED" && r.sku)
      .map((r) => r.sku!);
    const currentProducts = changedSkus.length
      ? await db().select().from(products).where(inArray(products.sku, changedSkus))
      : [];
    const currentBySku = Object.fromEntries(currentProducts.map((p) => [p.sku, p]));

    return { import: found, rows, currentProducts: currentBySku };
  });
}
