"use client";

import { Fragment, useState } from "react";
import { api, ApiError, errorMessage } from "../../lib/api";
import { PRICE_PER_IMAGE, usd } from "../../lib/status";
import type { ImportDetail, ImportRow, ProductRecord } from "../../lib/types";

const DIFF_FIELDS: Array<{
  label: string;
  imported: (r: ImportRow) => string | null;
  current: (p: ProductRecord) => string | null;
}> = [
  { label: "Name", imported: (r) => r.productName, current: (p) => p.name },
  { label: "Category", imported: (r) => r.category, current: (p) => p.category },
  { label: "Color / finish", imported: (r) => r.colorFinish, current: (p) => p.colorFinish },
  { label: "Material", imported: (r) => r.material, current: (p) => p.material },
  { label: "Price", imported: (r) => r.priceRaw, current: (p) => p.priceRaw },
  { label: "Photo URL", imported: (r) => r.photoUrl, current: (p) => p.photoUrl },
];

function DispositionBadges({ row }: { row: ImportRow }) {
  return (
    <div className="row row-wrap" style={{ gap: 4 }}>
      {row.productReconciliation === "NEW_PRODUCT" ? (
        <span className="badge badge-info">new product</span>
      ) : null}
      {row.productReconciliation === "PRODUCT_UNCHANGED" ? (
        <span className="badge badge-neutral">unchanged</span>
      ) : null}
      {row.productReconciliation === "PRODUCT_CHANGED" ? (
        <span className="badge badge-warn">product changed</span>
      ) : null}
      {row.productReconciliation === "INVALID" ? (
        <span className="badge badge-danger">
          invalid{row.invalidReason ? ` — ${row.invalidReason}` : ""}
        </span>
      ) : null}
      {row.creativeWork === "NO_REQUEST" ? (
        <span className="badge badge-neutral">no shot idea</span>
      ) : null}
      {row.creativeWork === "NEEDS_INPUT" ? (
        <span className="badge badge-danger">needs input</span>
      ) : null}
      {row.photoChanged ? <span className="badge badge-warn">photo changed</span> : null}
      {row.photoPreflight === "FAILED" ? (
        <span className="badge badge-danger">photo preflight failed</span>
      ) : null}
    </div>
  );
}

export function StagedView({
  detail,
  reload,
}: {
  detail: ImportDetail;
  reload: () => Promise<void>;
}) {
  const rows = detail.rows;
  const eligibleIds = rows.filter((r) => r.creativeWork === "REQUEST_ELIGIBLE").map((r) => r.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleIds));
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);

  const changedRows = rows.filter((r) => r.productReconciliation === "PRODUCT_CHANGED");
  const unresolvedCount = changedRows.filter((r) => r.reconciliationChoice === null).length;
  const selectedCount = eligibleIds.filter((id) => selected.has(id)).length;
  const deferredCount = eligibleIds.length - selectedCount;

  function toggle(rowId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function reconcile(rowIds: string[], choice: "USE_IMPORTED" | "KEEP_EXISTING", key: string) {
    setReconciling(key);
    setActionError(null);
    try {
      await api(`/imports/${detail.import.id}/reconcile`, {
        method: "POST",
        body: { rowIds, choice },
      });
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setReconciling(null);
    }
  }

  async function confirm() {
    setConfirming(true);
    setActionError(null);
    setHighlight(new Set());
    try {
      await api(`/imports/${detail.import.id}/confirm`, {
        method: "POST",
        body: { selectedRowIds: eligibleIds.filter((id) => selected.has(id)) },
      });
      await reload();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.body.rowIds)) {
        setHighlight(new Set(err.body.rowIds as string[]));
      }
      setActionError(errorMessage(err));
      setConfirming(false);
    }
  }

  return (
    <>
      {changedRows.length > 0 ? (
        <div className="note note-warn row spread row-wrap" style={{ marginBottom: 16 }}>
          <span>
            {changedRows.length} row{changedRows.length === 1 ? "" : "s"} differ from the current
            catalog — {unresolvedCount === 0 ? "all resolved" : `${unresolvedCount} still need a decision`}.
            Nothing overwrites canon until you confirm.
          </span>
          <button
            className="btn btn-small"
            disabled={reconciling !== null}
            onClick={() =>
              void reconcile(
                changedRows.map((r) => r.id),
                "USE_IMPORTED",
                "bulk",
              )
            }
          >
            {reconciling === "bulk"
              ? "Applying…"
              : `Use imported for all ${changedRows.length} changed`}
          </button>
        </div>
      ) : null}

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={selectedCount === eligibleIds.length && eligibleIds.length > 0}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(eligibleIds) : new Set())
                  }
                  title="Select all eligible rows"
                />
              </th>
              <th>SKU</th>
              <th>Product</th>
              <th>Shot idea</th>
              <th>Notes</th>
              <th>Dispositions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const eligible = row.creativeWork === "REQUEST_ELIGIBLE";
              const current = row.sku ? detail.currentProducts[row.sku] : undefined;
              const flagged = highlight.has(row.id);
              return (
                <Fragment key={row.id}>
                  <tr
                    className={
                      flagged ? "row-flagged" : row.validity === "INVALID" ? "row-dim" : undefined
                    }
                  >
                    <td>
                      {eligible ? (
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      ) : null}
                    </td>
                    <td className="mono">{row.sku ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{row.productName ?? "—"}</td>
                    <td className="verbatim" style={{ maxWidth: 260 }}>
                      {row.shotIdea ?? <span className="muted">—</span>}
                    </td>
                    <td className="verbatim" style={{ maxWidth: 280 }}>
                      {row.notes ?? <span className="muted">—</span>}
                    </td>
                    <td>
                      <DispositionBadges row={row} />
                    </td>
                  </tr>
                  {row.productReconciliation === "PRODUCT_CHANGED" && current ? (
                    <tr className={flagged ? "row-flagged" : undefined}>
                      <td />
                      <td colSpan={5} style={{ paddingTop: 0 }}>
                        <div className="diff">
                          <table>
                            <thead>
                              <tr>
                                <th style={{ width: 120 }}>Field</th>
                                <th>Existing (canon)</th>
                                <th>Imported</th>
                              </tr>
                            </thead>
                            <tbody>
                              {DIFF_FIELDS.filter(
                                (f) => (f.current(current) ?? "") !== (f.imported(row) ?? ""),
                              ).map((f) => (
                                <tr key={f.label}>
                                  <td className="muted">{f.label}</td>
                                  <td>{f.current(current) ?? <span className="muted">empty</span>}</td>
                                  <td>
                                    <span className="changed">
                                      {f.imported(row) ?? <span className="muted">empty</span>}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="row" style={{ marginTop: 10 }}>
                            <button
                              className={`btn btn-small${row.reconciliationChoice === "KEEP_EXISTING" ? " btn-primary" : ""}`}
                              disabled={reconciling !== null}
                              onClick={() => void reconcile([row.id], "KEEP_EXISTING", row.id)}
                            >
                              Keep existing
                            </button>
                            <button
                              className={`btn btn-small${row.reconciliationChoice === "USE_IMPORTED" ? " btn-primary" : ""}`}
                              disabled={reconciling !== null}
                              onClick={() => void reconcile([row.id], "USE_IMPORTED", row.id)}
                            >
                              Use imported
                            </button>
                            {row.reconciliationChoice === null ? (
                              <span className="tiny error-text">Decision required before confirm</span>
                            ) : (
                              <span className="tiny muted">
                                {row.reconciliationChoice === "USE_IMPORTED"
                                  ? "Will update the catalog on confirm"
                                  : "Catalog stays as-is"}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="confirm-bar">
        <div className="small muted">
          {selectedCount} of {eligibleIds.length} eligible row{eligibleIds.length === 1 ? "" : "s"}{" "}
          selected
          {deferredCount > 0 ? ` · ${deferredCount} will be deferred (start them later)` : ""}
          {unresolvedCount > 0 ? (
            <span className="error-text"> · {unresolvedCount} unresolved product change(s)</span>
          ) : null}
        </div>
        <div className="row row-wrap">
          {actionError ? <span className="error-text small">{actionError}</span> : null}
          <button className="btn btn-primary" disabled={confirming} onClick={() => void confirm()}>
            {confirming
              ? "Confirming…"
              : `Confirm & generate ${selectedCount} first candidate${selectedCount === 1 ? "" : "s"} · est ${usd(selectedCount * PRICE_PER_IMAGE)}`}
          </button>
        </div>
      </div>
    </>
  );
}
