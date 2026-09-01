"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { REQUEST_STATUSES, type RequestStatus } from "@shots/shared";
import { api, errorMessage } from "../../lib/api";
import { STATUS_LABELS, statusChipClass, usd } from "../../lib/status";
import type {
  ImportDetail,
  ImportSummary,
  SendReviewResult,
  ShotRequestDetail,
} from "../../lib/types";

export function ConfirmedView({
  detail,
  reloadRows,
}: {
  detail: ImportDetail;
  reloadRows: () => Promise<void>;
}) {
  const importId = detail.import.id;
  const [requests, setRequests] = useState<ShotRequestDetail[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [filter, setFilter] = useState<RequestStatus | "ALL">("ALL");
  const [sendResult, setSendResult] = useState<SendReviewResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearingBudget, setClearingBudget] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [startNote, setStartNote] = useState<string | null>(null);
  const [ideaDrafts, setIdeaDrafts] = useState<Record<string, string>>({});

  const loadBoard = useCallback(async () => {
    try {
      const data = await api<{ requests: ShotRequestDetail[] }>(`/requests?importId=${importId}`);
      setRequests(data.requests);
      setBoardError(null);
    } catch (err) {
      setBoardError(errorMessage(err));
    }
    try {
      setSummary(await api<ImportSummary>(`/imports/${importId}/summary`));
    } catch {
      setSummary(null);
    }
  }, [importId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const anyGenerating = requests?.some((r) => r.status === "GENERATING") ?? false;

  useEffect(() => {
    if (!anyGenerating) return;
    const timer = setInterval(() => void loadBoard(), 5000);
    return () => clearInterval(timer);
  }, [anyGenerating, loadBoard]);

  async function sendForReview() {
    setSending(true);
    setSendError(null);
    setCopied(false);
    try {
      setSendResult(
        await api<SendReviewResult>(`/imports/${importId}/review/send`, { method: "POST", body: {} }),
      );
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function clearBudget() {
    setClearingBudget(true);
    try {
      await api("/budget/clear", { method: "POST", body: {} });
      await loadBoard();
    } catch (err) {
      setBoardError(errorMessage(err));
    } finally {
      setClearingBudget(false);
    }
  }

  async function startRow(rowId: string, shotIdea?: string) {
    setStarting(rowId);
    setStartNote(null);
    try {
      const res = await api<{ generating: boolean; blocked?: string }>(
        `/imports/${importId}/rows/${rowId}/request`,
        { method: "POST", body: shotIdea ? { shotIdea } : {} },
      );
      if (res.blocked) setStartNote(res.blocked);
      await Promise.all([reloadRows(), loadBoard()]);
    } catch (err) {
      setStartNote(errorMessage(err));
    } finally {
      setStarting(null);
    }
  }

  const counts = new Map<RequestStatus, number>();
  for (const r of requests ?? []) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const visible =
    filter === "ALL" ? (requests ?? []) : (requests ?? []).filter((r) => r.status === filter);

  const deferredRows = detail.rows.filter((r) => r.deferredAt !== null && !r.shotRequestId);
  const noRequestRows = detail.rows.filter(
    (r) => r.creativeWork === "NO_REQUEST" && r.validity === "VALID" && !r.shotRequestId,
  );

  return (
    <>
      {summary ? (
        <div className="card card-pad summary-strip" style={{ marginBottom: 16 }}>
          {typeof summary.spendUsd === "number" ? (
            <div className="stat">
              <div className="label">Spend</div>
              <div className="value">{usd(summary.spendUsd)}</div>
            </div>
          ) : null}
          {summary.counts ? (
            <div className="stat">
              <div className="label">Ready</div>
              <div className="value">
                {summary.counts.READY ?? 0}
                <span className="muted" style={{ fontSize: 14 }}>
                  {" "}
                  / {requests?.length ?? "—"}
                </span>
              </div>
            </div>
          ) : null}
          {typeof summary.importReady === "boolean" ? (
            summary.importReady ? (
              <span className="chip chip-green">Import ready</span>
            ) : (
              <span className="chip chip-neutral">Not ready yet</span>
            )
          ) : null}
        </div>
      ) : null}

      {summary?.budgetExhausted ? (
        <div className="banner-danger" style={{ marginBottom: 16 }}>
          <span>
            <strong>Provider budget exhausted.</strong> Generation is paused everywhere until this
            is cleared — top up with the provider, then retry.
          </span>
          <button className="btn btn-danger" disabled={clearingBudget} onClick={() => void clearBudget()}>
            {clearingBudget ? "Clearing…" : "Clear & retry"}
          </button>
        </div>
      ) : null}

      <div className="row row-wrap" style={{ marginBottom: 8 }}>
        <button className="btn btn-primary" disabled={sending} onClick={() => void sendForReview()}>
          {sending ? "Sending…" : "Send for review"}
        </button>
        <a className="btn" href={`/api/imports/${importId}/export.csv`}>
          Download CSV
        </a>
      </div>
      {sendError ? (
        <p className="error-text small" style={{ margin: "6px 0 0" }}>
          {sendError}
        </p>
      ) : null}
      {sendResult ? (
        <div className={`note${sendResult.emailError ? " note-warn" : ""}`} style={{ marginTop: 8 }}>
          <div>
            {sendResult.pendingCount} candidate{sendResult.pendingCount === 1 ? "" : "s"} pending
            review.{" "}
            {sendResult.emailError
              ? `Email failed (${sendResult.emailError}) — copy the link below and share it manually.`
              : "Email sent to the reviewer."}
          </div>
          <div className="row row-wrap" style={{ marginTop: 6 }}>
            <span className="mono tiny" style={{ overflowWrap: "anywhere" }}>
              {sendResult.reviewUrl}
            </span>
            <button
              className="btn btn-small"
              onClick={() => {
                void navigator.clipboard.writeText(sendResult.reviewUrl).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section-head">
          <h2>Shot requests</h2>
          <div className="row row-wrap">
            <button
              className={`filter-chip${filter === "ALL" ? " active" : ""}`}
              onClick={() => setFilter("ALL")}
            >
              All ({requests?.length ?? 0})
            </button>
            {REQUEST_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
              <button
                key={s}
                className={`filter-chip${filter === s ? " active" : ""}`}
                onClick={() => setFilter(s)}
              >
                {STATUS_LABELS[s]} ({counts.get(s)})
              </button>
            ))}
          </div>
        </div>

        {boardError ? (
          <p className="error-text">{boardError}</p>
        ) : requests === null ? (
          <p className="muted">Loading requests…</p>
        ) : visible.length === 0 ? (
          <div className="card card-pad muted">No requests{filter === "ALL" ? "" : " with this status"}.</div>
        ) : (
          <div className="board-grid">
            {visible.map((r) => (
              <Link key={r.id} href={`/requests/${r.id}`} className="request-card">
                {r.product.photoUrl ? (
                  <img className="thumb" src={r.product.photoUrl} alt={r.product.name ?? r.product.sku} />
                ) : (
                  <div className="thumb-empty">no photo</div>
                )}
                <div className="body">
                  <div className="tiny mono muted">{r.product.sku}</div>
                  <div style={{ fontWeight: 600 }}>{r.product.name ?? "Unnamed product"}</div>
                  <div className="small muted clamp-2" style={{ marginTop: 4 }}>
                    {r.shotIdea}
                  </div>
                  <div className="row spread" style={{ marginTop: 10 }}>
                    <span className={statusChipClass(r.status)}>{STATUS_LABELS[r.status]}</span>
                    <span className="tiny muted">
                      {r.approvedCount}/{r.requiredApprovals} · {usd(r.spendUsd)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {startNote ? (
        <div className="note note-warn" style={{ marginTop: 20 }}>
          {startNote}
        </div>
      ) : null}

      {deferredRows.length > 0 ? (
        <div className="section">
          <div className="section-head">
            <h2>Deferred at confirm</h2>
            <span className="section-sub">
              Unchecked on purpose — start each one explicitly when it's time.
            </span>
          </div>
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Shot idea</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deferredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.sku ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{row.productName ?? "—"}</td>
                    <td className="verbatim" style={{ maxWidth: 280 }}>
                      {row.shotIdea ?? "—"}
                    </td>
                    <td className="verbatim" style={{ maxWidth: 280 }}>
                      {row.notes ?? <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-small"
                        disabled={starting !== null}
                        onClick={() => void startRow(row.id)}
                      >
                        {starting === row.id ? "Starting…" : "Start request"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {noRequestRows.length > 0 ? (
        <div className="section">
          <div className="section-head">
            <h2>No shot idea yet</h2>
            <span className="section-sub">
              A missing idea is a normal state — author one to start creative work. Generating
              spends ~$0.04 per image.
            </span>
          </div>
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Notes</th>
                  <th style={{ width: "42%" }}>Shot idea</th>
                </tr>
              </thead>
              <tbody>
                {noRequestRows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.sku ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{row.productName ?? "—"}</td>
                    <td className="verbatim" style={{ maxWidth: 260 }}>
                      {row.notes ?? <span className="muted">—</span>}
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 6 }}>
                        <input
                          type="text"
                          placeholder="Describe the scene the customer would want…"
                          value={ideaDrafts[row.id] ?? ""}
                          onChange={(e) =>
                            setIdeaDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                        />
                        <div>
                          <button
                            className="btn btn-small btn-primary"
                            disabled={starting !== null || !(ideaDrafts[row.id] ?? "").trim()}
                            onClick={() => void startRow(row.id, (ideaDrafts[row.id] ?? "").trim())}
                          >
                            {starting === row.id
                              ? "Saving…"
                              : "Save idea & generate first candidate"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
