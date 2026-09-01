"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { api, errorMessage } from "./lib/api";
import { READINESS_LABELS, READINESS_TONES, shortDate } from "./lib/status";
import { Shell } from "./lib/Shell";
import { StatusChip } from "./lib/StatusChip";
import { PaginationFooter } from "./lib/PaginationFooter";
import type { ImportRecord, ProductListItem } from "./lib/types";

const PAGE_SIZE = 10;

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function importStatus(imp: ImportRecord): { key: string; label: string; tone: "green" | "amber" | "gray" } {
  if (!imp.confirmedAt) return { key: "STAGED", label: "Staged", tone: "gray" };
  const readiness = imp.readiness ?? "NOT_STARTED";
  return { key: readiness, label: READINESS_LABELS[readiness], tone: READINESS_TONES[readiness] };
}

function CountCell({ value, attn = false }: { value: number; attn?: boolean }) {
  return (
    <td className={value === 0 ? "count-zero" : attn ? "count-num count-attn" : "count-num"}>
      {value}
    </td>
  );
}

// nuqs reads useSearchParams, which bails out of static prerender — the
// Suspense boundary is what Next requires to build this page.
export default function ImportsPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="muted">Loading…</p>
        </Shell>
      }
    >
      <ImportsView />
    </Suspense>
  );
}

function ImportsView() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[] | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [status, setStatus] = useQueryState("status", parseAsString.withDefault("all"));
  const [range, setRange] = useQueryState("range", parseAsString.withDefault("all"));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const load = useCallback(async () => {
    try {
      const data = await api<{ imports: ImportRecord[] }>("/imports");
      setImports(
        [...data.imports].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    api<{ products: ProductListItem[] }>("/products")
      .then((data) => setProductCount(data.products.length))
      .catch(() => setProductCount(null));
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ existing: boolean; import: ImportRecord }>("/imports", {
        method: "POST",
        formData,
      });
      router.push(res.existing ? `/imports/${res.import.id}?dup=1` : `/imports/${res.import.id}`);
    } catch (err) {
      setUploadError(errorMessage(err));
      setUploading(false);
    }
  }

  const totals = useMemo(() => {
    const sum = { awaitingReview: 0, ready: 0, noRequest: 0, deferred: 0 };
    for (const imp of imports ?? []) {
      sum.awaitingReview += imp.counts?.awaitingReview ?? 0;
      sum.ready += imp.counts?.ready ?? 0;
      sum.noRequest += imp.counts?.noRequest ?? 0;
      sum.deferred += imp.counts?.deferred ?? 0;
    }
    return sum;
  }, [imports]);

  const filtered = useMemo(() => {
    if (!imports) return null;
    const needle = q.trim().toLowerCase();
    const days = RANGE_DAYS[range];
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
    return imports.filter((imp) => {
      if (needle && !imp.originalFilename.toLowerCase().includes(needle)) return false;
      if (status !== "all" && importStatus(imp).key !== status) return false;
      if (cutoff !== null && new Date(imp.createdAt).getTime() < cutoff) return false;
      return true;
    });
  }, [imports, q, status, range]);

  const pageItems = filtered?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => void setPage(null);

  return (
    <Shell>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        {dragging ? <div className="drop-overlay">Drop the catalog CSV to stage it</div> : null}

        <div className="page-top">
          <div className="page-head" style={{ marginBottom: 0 }}>
            <h1>Imports</h1>
            <p className="page-meta">Upload a customer CSV, stage it, and generate styled shots.</p>
          </div>
          <button
            className="btn btn-primary"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? "Uploading…" : "+ New import"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </div>
        {uploadError ? (
          <p className="error-text" style={{ marginBottom: 12 }}>
            Upload failed: {uploadError}
          </p>
        ) : null}

        <div className="stat-band">
          <div className="stat-tile">
            <div className="value">{imports?.length ?? "—"}</div>
            <div className="label">Imports</div>
          </div>
          <div className="stat-tile">
            <div className="value">{productCount ?? "—"}</div>
            <div className="label">Products</div>
          </div>
          <div className="stat-tile highlight">
            <div className="value">{totals.awaitingReview}</div>
            <div className="label">Awaiting review</div>
          </div>
          <div className="stat-tile">
            <div className="value">{totals.ready}</div>
            <div className="label">Ready</div>
          </div>
          <div className="stat-tile">
            <div className="value">{totals.noRequest}</div>
            <div className="label">No request</div>
          </div>
          <div className="stat-tile">
            <div className="value">{totals.deferred}</div>
            <div className="label">Deferred</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <svg className="search-icon" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search imports…"
              value={q}
              onChange={(e) => {
                void setQ(e.target.value || null);
                resetPage();
              }}
            />
          </div>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              void setStatus(e.target.value === "all" ? null : e.target.value);
              resetPage();
            }}
          >
            <option value="all">All statuses</option>
            <option value="STAGED">Staged</option>
            <option value="READY">{READINESS_LABELS.READY}</option>
            <option value="PARTIAL">{READINESS_LABELS.PARTIAL}</option>
            <option value="NOT_STARTED">{READINESS_LABELS.NOT_STARTED}</option>
            <option value="NO_REQUESTS">{READINESS_LABELS.NO_REQUESTS}</option>
          </select>
          <select
            aria-label="Filter by upload date"
            value={range}
            onChange={(e) => {
              void setRange(e.target.value === "all" ? null : e.target.value);
              resetPage();
            }}
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>

        <div className="section" style={{ marginTop: 0 }}>
          {loadError ? (
            <p className="error-text">Could not load imports: {loadError}</p>
          ) : pageItems === undefined || filtered === null ? (
            <p className="muted">Loading…</p>
          ) : imports?.length === 0 ? (
            <div className="card card-pad muted">
              No imports yet — drop the first catalog CSV anywhere on this page.
            </div>
          ) : filtered.length === 0 ? (
            <div className="card card-pad muted">No imports match the current filters.</div>
          ) : (
            <>
              <div className="card table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Import</th>
                      <th>Products</th>
                      <th>Status</th>
                      <th>Awaiting review</th>
                      <th>Ready</th>
                      <th>No request</th>
                      <th>Deferred</th>
                      <th>Created</th>
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems!.map((imp) => {
                      const s = importStatus(imp);
                      return (
                        <tr
                          key={imp.id}
                          className="row-link"
                          onClick={() => router.push(`/imports/${imp.id}`)}
                        >
                          <td>
                            <div className="file-cell">
                              <span className="file-glyph" aria-hidden="true">
                                <svg viewBox="0 0 16 16" fill="none">
                                  <path
                                    d="M3.5 1.5h6L13 5v9.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5Z"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinejoin="round"
                                  />
                                  <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                                </svg>
                              </span>
                              <div className="cell-main">
                                <Link href={`/imports/${imp.id}`} onClick={(e) => e.stopPropagation()}>
                                  {imp.originalFilename}
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td>{imp.rowCount}</td>
                          <td>
                            <StatusChip tone={s.tone} label={s.label} />
                          </td>
                          <CountCell value={imp.counts?.awaitingReview ?? 0} attn />
                          <CountCell value={imp.counts?.ready ?? 0} />
                          <CountCell value={imp.counts?.noRequest ?? 0} />
                          <CountCell value={imp.counts?.deferred ?? 0} />
                          <td>
                            <div>{shortDate(imp.createdAt)}</div>
                            <div className="cell-sub">{timeOf(imp.createdAt)}</div>
                          </td>
                          <td className="chevron-cell">›</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                noun="imports"
                onPage={(p) => void setPage(p === 1 ? null : p)}
              />
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
