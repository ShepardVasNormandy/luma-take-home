"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, errorMessage } from "../../lib/api";
import {
  PRICE_PER_IMAGE,
  REASON_LABELS,
  STATUS_EXPLANATIONS,
  STATUS_LABELS,
  dateTime,
  latency,
  statusChipClass,
  usd,
  usdExact,
} from "../../lib/status";
import { Shell } from "../../lib/Shell";
import type { RequestCandidate, ShotRequestDetail } from "../../lib/types";

const HARD_GATES: Partial<Record<string, string>> = {
  CLOSED: "Request is closed — reopen it to generate.",
  NEEDS_REVISION: "Gated: Ellie rejected this direction — save a new version below to lift the gate.",
  GENERATION_BLOCKED:
    "Gated: the provider refused this direction (moderation) — save a new version below to lift the gate.",
};

function DecisionBadge({ candidate }: { candidate: RequestCandidate }) {
  const d = candidate.decision;
  if (!d) return <span className="chip chip-amber">Awaiting review</span>;
  if (d.decision === "APPROVED") return <span className="chip chip-green">Approved</span>;
  return (
    <span className="chip chip-red">
      Rejected{d.reason ? ` · ${REASON_LABELS[d.reason]}` : ""}
    </span>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ShotRequestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [savingDirection, setSavingDirection] = useState(false);
  const [directionError, setDirectionError] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<{ code: string | null; message: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ request: ShotRequestDetail }>(`/requests/${id}`);
      setData(res.request);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data && draft === null) {
      setDraft(data.directions[data.directions.length - 1]?.content ?? "");
    }
  }, [data, draft]);

  const generating = data?.status === "GENERATING";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [generating, load]);

  if (loadError) {
    return (
      <Shell>
        <p className="error-text">{loadError}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <p className="muted">Loading…</p>
      </Shell>
    );
  }

  const latestDirection = data.directions[data.directions.length - 1];
  const remaining = data.requiredApprovals - data.approvedCount;
  const remainingClamped = Math.min(Math.max(remaining, 0), 5);
  const decided = data.candidates
    .filter((c) => c.decision !== null)
    .sort(
      (a, b) =>
        new Date(b.decision!.reviewedAt).getTime() - new Date(a.decision!.reviewedAt).getTime(),
    );
  const latestRejection = decided[0]?.decision?.decision === "REJECTED" ? decided[0] : null;
  const gateReason = HARD_GATES[data.status] ?? null;
  const disabledReason = gateReason ?? genError?.message ?? null;

  async function saveDirection() {
    if (!draft?.trim()) return;
    setSavingDirection(true);
    setDirectionError(null);
    try {
      await api(`/requests/${id}/directions`, { method: "POST", body: { content: draft.trim() } });
      setGenError(null);
      await load();
    } catch (err) {
      setDirectionError(errorMessage(err));
    } finally {
      setSavingDirection(false);
    }
  }

  async function generate(count: number) {
    setGenBusy(true);
    try {
      await api(`/requests/${id}/generate`, { method: "POST", body: { count } });
      setGenError(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setGenError({ code: err.code, message: err.message });
      } else {
        setGenError({ code: null, message: errorMessage(err) });
      }
    } finally {
      setGenBusy(false);
    }
  }

  async function clearBudget() {
    setActionBusy(true);
    try {
      await api("/budget/clear", { method: "POST", body: {} });
      setGenError(null);
      await load();
    } finally {
      setActionBusy(false);
    }
  }

  async function setRequiredApprovals(value: number) {
    if (value < 1 || value > 10) return;
    setActionBusy(true);
    try {
      await api(`/requests/${id}/required-approvals`, { method: "POST", body: { value } });
      await load();
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function closeRequest() {
    const reason = window.prompt("Optional reason for closing (leave empty to skip):");
    if (reason === null) return;
    setActionBusy(true);
    try {
      await api(`/requests/${id}/close`, {
        method: "POST",
        body: reason.trim() ? { reason: reason.trim() } : {},
      });
      await load();
    } finally {
      setActionBusy(false);
    }
  }

  async function reopenRequest() {
    setActionBusy(true);
    try {
      await api(`/requests/${id}/reopen`, { method: "POST", body: {} });
      await load();
    } finally {
      setActionBusy(false);
    }
  }

  async function retryCopy(publicId: string) {
    setRetrying(publicId);
    try {
      await api(`/assets/${publicId}/retry-copy`, { method: "POST", body: {} });
      await load();
    } finally {
      setRetrying(null);
    }
  }

  return (
    <Shell>
      <Link href={`/imports/${data.importId}`} className="backlink">
        ← Back to import
      </Link>

      <div className="page-head">
        <h1>{data.product.name ?? data.product.sku}</h1>
        <div className="page-meta">
          <span className="mono">{data.product.sku}</span>
          <span className={statusChipClass(data.status)}>{STATUS_LABELS[data.status]}</span>
          <span>{STATUS_EXPLANATIONS[data.status]}</span>
        </div>
        {data.closedAt ? (
          <p className="small muted" style={{ marginTop: 6 }}>
            Closed {dateTime(data.closedAt)}
            {data.closeReason ? ` — "${data.closeReason}"` : ""}
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 340px) 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Packshot</h3>
          {data.product.photoUrl ? (
            <img className="packshot" src={data.product.photoUrl} alt={data.product.name ?? "packshot"} />
          ) : (
            <div className="thumb-empty" style={{ borderRadius: 8 }}>
              no source photo
            </div>
          )}
          <table className="table" style={{ marginTop: 12, fontSize: 13 }}>
            <tbody>
              {[
                ["Category", data.product.category],
                ["Color / finish", data.product.colorFinish],
                ["Material", data.product.material],
                ["Price", data.product.priceRaw],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <tr key={label}>
                    <td className="muted" style={{ width: 110 }}>
                      {label}
                    </td>
                    <td>{value}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="row spread">
              <h3>Shot idea</h3>
              <span className="badge badge-neutral">immutable — the customer's words</span>
            </div>
            <p className="quote" style={{ marginBottom: 0 }}>
              &ldquo;{data.shotIdea}&rdquo;
            </p>
          </div>

          {data.notes ? (
            <div className="card card-pad">
              <h3>Notes</h3>
              <p className="verbatim" style={{ margin: "8px 0 0" }}>
                {data.notes}
              </p>
            </div>
          ) : null}

          <div className="card card-pad">
            <div className="row row-wrap spread">
              <div className="row row-wrap" style={{ gap: 22 }}>
                <div>
                  <div className="tiny muted" style={{ fontWeight: 600 }}>
                    APPROVED
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600 }}>
                    {data.approvedCount} / {data.requiredApprovals}
                  </div>
                </div>
                <div>
                  <div className="tiny muted" style={{ fontWeight: 600 }}>
                    SPEND
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 600 }}>
                    {usd(data.spendUsd)}
                  </div>
                </div>
                <div>
                  <div className="tiny muted" style={{ fontWeight: 600 }}>
                    REQUIRED APPROVALS
                  </div>
                  <div className="stepper" style={{ marginTop: 2 }}>
                    <button
                      disabled={actionBusy || data.requiredApprovals <= 1}
                      onClick={() => void setRequiredApprovals(data.requiredApprovals - 1)}
                    >
                      −
                    </button>
                    <span className="value">{data.requiredApprovals}</span>
                    <button
                      disabled={actionBusy || data.requiredApprovals >= 10}
                      onClick={() => void setRequiredApprovals(data.requiredApprovals + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              {data.closedAt ? (
                <button className="btn" disabled={actionBusy} onClick={() => void reopenRequest()}>
                  Reopen request
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  disabled={actionBusy}
                  onClick={() => void closeRequest()}
                >
                  Close request
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section card card-pad">
        <div className="row spread row-wrap">
          <h2>Execution direction</h2>
          {latestDirection ? (
            <span className="tiny muted">
              v{latestDirection.version} ·{" "}
              {latestDirection.provenance === "INITIAL" ? "original idea" : "operator edit"} ·{" "}
              {dateTime(latestDirection.createdAt)}
            </span>
          ) : null}
        </div>
        <p className="small muted" style={{ margin: "4px 0 10px" }}>
          The one thing you edit. Only the current version is sent to the provider — revising it
          lifts a rejection gate.
        </p>
        <textarea
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          disabled={data.closedAt !== null}
        />
        <div className="row row-wrap" style={{ marginTop: 10 }}>
          <button
            className="btn btn-primary"
            disabled={
              savingDirection ||
              data.closedAt !== null ||
              !draft?.trim() ||
              draft.trim() === latestDirection?.content
            }
            onClick={() => void saveDirection()}
          >
            {savingDirection ? "Saving…" : "Save as new version"}
          </button>
          {directionError ? <span className="error-text small">{directionError}</span> : null}
        </div>
        {data.directions.length > 1 ? (
          <details className="history" style={{ marginTop: 14 }}>
            <summary>History ({data.directions.length} versions)</summary>
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>V</th>
                  <th style={{ width: 130 }}>Provenance</th>
                  <th style={{ width: 150 }}>Date</th>
                  <th>Content</th>
                </tr>
              </thead>
              <tbody>
                {[...data.directions].reverse().map((d) => (
                  <tr key={d.id}>
                    <td className="mono">v{d.version}</td>
                    <td>
                      {d.provenance === "INITIAL" ? (
                        <span className="badge badge-neutral">original idea</span>
                      ) : (
                        <span className="badge badge-info">operator edit</span>
                      )}
                    </td>
                    <td className="muted">{dateTime(d.createdAt)}</td>
                    <td className="verbatim">{d.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Candidates ({data.candidates.length})</h2>
        </div>

        <div className="card card-pad" style={{ marginBottom: 14 }}>
          {latestRejection?.decision ? (
            <div className="note note-warn" style={{ marginBottom: 12 }}>
              <strong>Latest rejection:</strong>{" "}
              {latestRejection.decision.reason
                ? REASON_LABELS[latestRejection.decision.reason]
                : "No reason given"}
              {latestRejection.decision.comment ? (
                <span className="verbatim"> — &ldquo;{latestRejection.decision.comment}&rdquo;</span>
              ) : null}
              <span className="tiny muted"> · {dateTime(latestRejection.decision.reviewedAt)}</span>
            </div>
          ) : null}

          <div className="row row-wrap">
            <button
              className="btn btn-primary"
              disabled={genBusy || disabledReason !== null}
              onClick={() => void generate(1)}
            >
              {genBusy ? "Queuing…" : "Generate next candidate"}
              <span className="btn-cost">≈ ${PRICE_PER_IMAGE.toFixed(2)}/image</span>
            </button>
            {remainingClamped > 1 ? (
              <button
                className="btn"
                disabled={genBusy || disabledReason !== null}
                onClick={() => void generate(remainingClamped)}
              >
                Generate remaining {remainingClamped}
                <span className="btn-cost">
                  ≈ ${PRICE_PER_IMAGE.toFixed(2)}/image · {usd(remainingClamped * PRICE_PER_IMAGE)}{" "}
                  total
                </span>
              </button>
            ) : null}
            {data.status === "NEEDS_INPUT" && !disabledReason ? (
              <span className="small muted">
                The server re-checks the source photo when you generate.
              </span>
            ) : null}
          </div>

          {disabledReason ? (
            <div className="row row-wrap" style={{ marginTop: 10 }}>
              <span className="error-text small">{disabledReason}</span>
              {genError?.code === "BUDGET_EXHAUSTED" ? (
                <button
                  className="btn btn-small btn-danger"
                  disabled={actionBusy}
                  onClick={() => void clearBudget()}
                >
                  Clear & retry
                </button>
              ) : null}
              {genError && !gateReason ? (
                <button className="btn btn-small" onClick={() => setGenError(null)}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {data.candidates.length === 0 ? (
          <div className="card card-pad muted">No candidates yet.</div>
        ) : (
          <div className="candidate-grid">
            {data.candidates.map((c) => (
              <div key={c.id} className="candidate-card">
                {c.assetState === "STORED" && c.assetPublicId ? (
                  <a href={`/api/assets/${c.assetPublicId}`} target="_blank" rel="noreferrer">
                    <img src={`/api/assets/${c.assetPublicId}`} alt="candidate" />
                  </a>
                ) : c.assetState === "FAILED" ? (
                  <div className="candidate-placeholder">copy failed</div>
                ) : (
                  <div className="candidate-placeholder">storing…</div>
                )}
                <div className="body stack" style={{ gap: 6 }}>
                  <div className="row spread row-wrap">
                    <DecisionBadge candidate={c} />
                    <span className="tiny muted">{dateTime(c.createdAt)}</span>
                  </div>
                  {c.decision?.comment ? (
                    <div className="small verbatim">&ldquo;{c.decision.comment}&rdquo;</div>
                  ) : null}
                  {c.assetState === "FAILED" && c.assetPublicId ? (
                    <button
                      className="btn btn-small btn-danger"
                      disabled={retrying !== null}
                      onClick={() => void retryCopy(c.assetPublicId!)}
                    >
                      {retrying === c.assetPublicId ? "Retrying…" : "Retry copy"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Attempts ({data.attempts.length})</h2>
          <span className="section-sub">
            Provider truth, verbatim. Failures never auto-retry — a click here is new spend.
          </span>
        </div>
        {data.attempts.length === 0 ? (
          <div className="card card-pad muted">No attempts yet.</div>
        ) : (
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Failure</th>
                  <th>Latency</th>
                  <th>Cost</th>
                  <th>Provider ID</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {[...data.attempts]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.state === "COMPLETED" ? (
                          <span className="badge badge-info">COMPLETED</span>
                        ) : a.state === "FAILED" ? (
                          <span className="badge badge-danger">FAILED</span>
                        ) : a.state === "UNKNOWN" ? (
                          <span className="badge badge-danger" title="Lost during a restart before the provider confirmed — never auto re-posted.">
                            UNKNOWN — retry manually
                          </span>
                        ) : (
                          <span className="badge badge-neutral">{a.state}</span>
                        )}
                      </td>
                      <td className="small">
                        {a.failureCode ? (
                          <>
                            <span className="mono">{a.failureCode}</span>
                            {a.failureReason ? <span className="muted"> — {a.failureReason}</span> : null}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{latency(a.submittedAt, a.completedAt)}</td>
                      <td>{usdExact(Number(a.priceSnapshotUsd))}</td>
                      <td className="mono tiny">{a.providerGenerationId ?? "—"}</td>
                      <td className="muted small">{dateTime(a.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
