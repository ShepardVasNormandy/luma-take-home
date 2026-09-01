import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { stringify } from "csv-stringify";
import { REQUEST_STATUSES, type RequestStatus } from "@shots/shared";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { importRows, imports } from "../db/schema.js";
import { loadRequestsByImport, type LoadedRequest } from "../requests/projection-loader.js";
import { isBudgetExhausted } from "../worker/generation.js";
import {
  buildExportRows,
  computeImportReady,
  exportFilename,
  type ImportRowLike,
  type LoadedRequestLike,
} from "./builder.js";

function apiPublicUrl(): string {
  return config.API_PUBLIC_URL ?? `http://localhost:${config.PORT}`;
}

function toRequestLike(loaded: LoadedRequest): LoadedRequestLike {
  return {
    status: loaded.status,
    requiredApprovals: loaded.request.requiredApprovals,
    candidates: loaded.candidates,
  };
}

export async function exportRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/imports/:id/export.csv", async (req, reply) => {
    const imp = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!imp) return reply.code(404).send({ error: "Import not found" });

    const [rows, loaded] = await Promise.all([
      db()
        .select()
        .from(importRows)
        .where(eq(importRows.importId, imp.id))
        .orderBy(asc(importRows.rowIndex)),
      loadRequestsByImport(imp.id),
    ]);

    const { header, records } = buildExportRows({
      headers: imp.headers as string[],
      rows: rows.map(
        (r): ImportRowLike => ({
          rowIndex: r.rowIndex,
          raw: r.raw as Record<string, string>,
          shotRequestId: r.shotRequestId,
          deferredAt: r.deferredAt,
          shotIdea: r.shotIdea,
        }),
      ),
      requestsByRowId: new Map(
        [...loaded.entries()].map(([id, l]) => [id, toRequestLike(l)]),
      ),
      apiPublicUrl: apiPublicUrl(),
    });

    const ready = computeImportReady([...loaded.values()]);
    const filename = exportFilename(imp.originalFilename, ready, new Date()).replace(/"/g, "");

    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(stringify([header, ...records]));
  });

  app.get<{ Params: { id: string } }>("/imports/:id/summary", async (req, reply) => {
    const imp = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!imp) return reply.code(404).send({ error: "Import not found" });

    const [rows, loaded, budgetExhausted] = await Promise.all([
      db().select().from(importRows).where(eq(importRows.importId, imp.id)),
      loadRequestsByImport(imp.id),
      isBudgetExhausted(),
    ]);

    const statusCounts = Object.fromEntries(
      REQUEST_STATUSES.map((s) => [s, 0]),
    ) as Record<RequestStatus, number>;
    let spendUsd = 0;
    let approvedImages = 0;
    for (const l of loaded.values()) {
      statusCounts[l.status] += 1;
      spendUsd += l.spendUsd;
      approvedImages += l.approvedCount;
    }

    const rowStats = {
      total: rows.length,
      noRequest: rows.filter((r) => !r.shotRequestId && !r.deferredAt && !r.shotIdea).length,
      deferred: rows.filter((r) => r.deferredAt !== null).length,
      needsInput: rows.filter((r) => r.creativeWork === "NEEDS_INPUT").length,
      withRequest: rows.filter((r) => r.shotRequestId !== null).length,
    };

    return {
      requestsTotal: loaded.size,
      ready: statusCounts.READY,
      closed: statusCounts.CLOSED,
      pendingReview: statusCounts.AWAITING_REVIEW,
      spendUsd: Number(spendUsd.toFixed(4)),
      approvedImages,
      importReady: computeImportReady([...loaded.values()]),
      statusCounts,
      rowStats,
      budgetExhausted,
    };
  });
}
