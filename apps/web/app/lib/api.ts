export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }

  get code(): string | null {
    return typeof this.body.code === "string" ? this.body.code : null;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  redirectOn401?: boolean;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, formData, redirectOn401 = true } = opts;

  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && redirectOn401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, { error: "Not signed in" });
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }

  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "Something went wrong";
