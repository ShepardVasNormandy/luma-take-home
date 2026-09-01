import { requireConfig } from "../config.js";

const BASE = "https://agents.lumalabs.ai/v1";

export interface LumaGeneration {
  id: string;
  state: "queued" | "processing" | "completed" | "failed";
  output?: unknown[];
  failure_reason?: string | null;
  failure_code?: string | null;
}

export class LumaRateLimited extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Luma rate limited, retry after ${retryAfterSeconds}s`);
  }
}

export class LumaRequestRejected extends Error {
  constructor(
    public status: number,
    public failureCode: string,
    public detail: string,
  ) {
    super(`Luma rejected request (${status}): ${failureCode} ${detail}`);
  }
}

function headers(requestId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${requireConfig("LUMA_AGENTS_API_KEY")}`,
    "Content-Type": "application/json",
    ...(requestId ? { "X-Request-Id": requestId } : {}),
  };
}

async function parseError(res: Response): Promise<{ code: string; detail: string }> {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const code =
      (json.failure_code as string) ??
      (json.code as string) ??
      ((json.error as Record<string, unknown>)?.code as string) ??
      `http_${res.status}`;
    return { code, detail: body.slice(0, 500) };
  } catch {
    return { code: `http_${res.status}`, detail: body.slice(0, 500) };
  }
}

// Verified 2026-09-01: no idempotency key exists, no list endpoint.
// X-Request-Id is tracing-only; one attempt row = one request id.
export async function createGeneration(
  body: Record<string, unknown>,
  attemptId: string,
): Promise<LumaGeneration> {
  const res = await fetch(`${BASE}/generations`, {
    method: "POST",
    headers: headers(attemptId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 429) {
    throw new LumaRateLimited(Number(res.headers.get("retry-after") ?? 60));
  }
  if (!res.ok) {
    const { code, detail } = await parseError(res);
    throw new LumaRequestRejected(res.status, code, detail);
  }
  return (await res.json()) as LumaGeneration;
}

export async function getGeneration(providerGenerationId: string): Promise<LumaGeneration> {
  const res = await fetch(`${BASE}/generations/${providerGenerationId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const { code, detail } = await parseError(res);
    throw new LumaRequestRejected(res.status, code, detail);
  }
  return (await res.json()) as LumaGeneration;
}

export function outputUrls(gen: LumaGeneration): string[] {
  return (gen.output ?? [])
    .map((o) =>
      typeof o === "string"
        ? o
        : ((o as Record<string, unknown>)?.url as string) ??
          ((o as Record<string, unknown>)?.uri as string) ??
          null,
    )
    .filter((u): u is string => Boolean(u));
}
