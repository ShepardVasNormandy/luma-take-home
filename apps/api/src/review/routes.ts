import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { REJECTION_REASONS } from "@shots/shared";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { imports, reviewDecisions, reviewSessions } from "../db/schema.js";
import { loadRequestsByImport } from "../requests/projection-loader.js";
import { sendReviewEmail } from "../email/index.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const decisionBody = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.enum(REJECTION_REASONS).nullish(),
  comment: z.string().trim().max(2000).nullish(),
});

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

async function pendingQueue(importId: string) {
  const loaded = await loadRequestsByImport(importId);
  const pending: Array<{
    candidateId: string;
    createdAt: Date;
    assetPublicId: string;
    packshotUrl: string | null;
    productName: string | null;
    sku: string;
    shotIdea: string;
    approvedCount: number;
    requiredApprovals: number;
  }> = [];
  const decided: Array<Record<string, unknown>> = [];
  let approvedTotal = 0;
  let rejectedTotal = 0;

  for (const item of loaded.values()) {
    for (const candidate of item.candidates) {
      if (candidate.asset?.storeState !== "STORED") continue;
      const entry = {
        candidateId: candidate.id,
        createdAt: candidate.createdAt,
        assetPublicId: candidate.asset.publicId,
        packshotUrl: item.product.photoUrl,
        productName: item.product.name,
        sku: item.product.sku,
        shotIdea: item.request.shotIdea,
        approvedCount: item.approvedCount,
        requiredApprovals: item.request.requiredApprovals,
      };
      if (candidate.decision) {
        if (candidate.decision.decision === "APPROVED") approvedTotal++;
        else rejectedTotal++;
        decided.push({
          ...entry,
          decision: {
            decision: candidate.decision.decision,
            reason: candidate.decision.reason,
            comment: candidate.decision.comment,
            reviewedAt: candidate.decision.reviewedAt,
          },
        });
      } else if (!item.request.closedAt) {
        pending.push(entry);
      }
    }
  }

  pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  decided.sort(
    (a, b) =>
      new Date((b.decision as { reviewedAt: Date }).reviewedAt).getTime() -
      new Date((a.decision as { reviewedAt: Date }).reviewedAt).getTime(),
  );
  return { pending, recentlyDecided: decided.slice(0, 10), approvedTotal, rejectedTotal, loaded };
}

type SessionResolution =
  | { ok: true; session: typeof reviewSessions.$inferSelect; importRecord: typeof imports.$inferSelect }
  | { ok: false; code: "TOKEN_INVALID" | "TOKEN_REVOKED" | "TOKEN_EXPIRED" };

async function resolveToken(req: FastifyRequest): Promise<SessionResolution> {
  const header = req.headers.authorization;
  const raw =
    header?.startsWith("Bearer ") === true
      ? header.slice(7)
      : ((req.query as Record<string, string | undefined>)?.token ?? null);
  if (!raw) return { ok: false, code: "TOKEN_INVALID" };

  const session = await db().query.reviewSessions.findFirst({
    where: eq(reviewSessions.tokenHash, hashToken(raw)),
  });
  if (!session) return { ok: false, code: "TOKEN_INVALID" };
  if (session.revokedAt) return { ok: false, code: "TOKEN_REVOKED" };
  if (session.expiresAt.getTime() < Date.now()) return { ok: false, code: "TOKEN_EXPIRED" };

  const importRecord = await db().query.imports.findFirst({
    where: eq(imports.id, session.importId),
  });
  if (!importRecord) return { ok: false, code: "TOKEN_INVALID" };
  return { ok: true, session, importRecord };
}

const unauthorized = (reply: FastifyReply, code: string) =>
  reply.code(401).send({ error: "Review link is not valid", code });

// Operator-scoped: explicit "Send for review".
export async function reviewSendRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/imports/:id/review/send", async (req, reply) => {
    const found = await db().query.imports.findFirst({ where: eq(imports.id, req.params.id) });
    if (!found) return reply.code(404).send({ error: "Import not found" });
    if (!found.confirmedAt) return reply.code(409).send({ error: "Import not confirmed yet" });

    const { pending } = await pendingQueue(found.id);
    if (pending.length === 0) {
      return reply.code(409).send({ error: "No pending candidates to review right now" });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);

    const existing = await db().query.reviewSessions.findFirst({
      where: eq(reviewSessions.importId, found.id),
    });
    if (existing) {
      await db()
        .update(reviewSessions)
        .set({
          tokenHash: hashToken(rawToken),
          expiresAt,
          revokedAt: null,
          lastSentAt: now,
          sendCount: existing.sendCount + 1,
        })
        .where(eq(reviewSessions.id, existing.id));
    } else {
      await db().insert(reviewSessions).values({
        importId: found.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
        lastSentAt: now,
        sendCount: 1,
      });
    }

    const reviewUrl = `${config.WEB_URL ?? "http://localhost:3000"}/review/${rawToken}`;

    let emailError: string | null = null;
    try {
      await sendReviewEmail({
        pendingCount: pending.length,
        importName: found.originalFilename,
        reviewUrl,
      });
    } catch (err) {
      emailError = (err as Error).message;
    }

    return { sent: emailError === null, pendingCount: pending.length, reviewUrl, emailError };
  });
}

// Token-scoped: Ellie's surface. No operator cookie involved.
export async function reviewRoutes(app: FastifyInstance) {
  app.get("/review/session", async (req, reply) => {
    const resolved = await resolveToken(req);
    if (!resolved.ok) return unauthorized(reply, resolved.code);

    const { pending, recentlyDecided, approvedTotal, rejectedTotal } = await pendingQueue(
      resolved.importRecord.id,
    );
    return {
      importName: resolved.importRecord.originalFilename,
      counts: { pending: pending.length, approved: approvedTotal, rejected: rejectedTotal },
      pending,
      recentlyDecided,
    };
  });

  app.put<{ Params: { id: string } }>("/review/candidates/:id/decision", async (req, reply) => {
    const resolved = await resolveToken(req);
    if (!resolved.ok) return unauthorized(reply, resolved.code);
    const body = decisionBody.parse(req.body);

    // Server-side staleness verification (CONTEXT "Live queue"): candidate
    // must belong to this session's import, be reviewable, request not closed.
    const { loaded } = await pendingQueue(resolved.importRecord.id);
    let target: { candidateId: string; closed: boolean; stored: boolean } | null = null;
    for (const item of loaded.values()) {
      const candidate = item.candidates.find((c) => c.id === req.params.id);
      if (candidate) {
        target = {
          candidateId: candidate.id,
          closed: item.request.closedAt !== null,
          stored: candidate.asset?.storeState === "STORED",
        };
        break;
      }
    }
    if (!target) return reply.code(404).send({ error: "Candidate not found in this review" });
    if (target.closed) return reply.code(409).send({ error: "This request was closed by the operator" });
    if (!target.stored) return reply.code(409).send({ error: "Candidate is not reviewable" });

    const values = {
      candidateId: req.params.id,
      decision: body.decision,
      reason: body.decision === "REJECTED" ? (body.reason ?? null) : null,
      comment: body.comment ?? null,
      reviewedAt: new Date(),
    };
    await db()
      .insert(reviewDecisions)
      .values(values)
      .onConflictDoUpdate({
        target: reviewDecisions.candidateId,
        set: {
          decision: values.decision,
          reason: values.reason,
          comment: values.comment,
          reviewedAt: values.reviewedAt,
        },
      });

    return { saved: true };
  });
}
