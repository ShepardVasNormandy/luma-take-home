"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, errorMessage } from "../../lib/api";
import { STATUS_LABELS, shortDate, statusChipClass, usd } from "../../lib/status";
import { Shell } from "../../lib/Shell";
import type { ProductAppearance, ProductDetail } from "../../lib/types";

const RECONCILIATION_BADGES: Record<
  ProductAppearance["productReconciliation"],
  { label: string; className: string }
> = {
  NEW_PRODUCT: { label: "New product", className: "badge badge-info" },
  PRODUCT_UNCHANGED: { label: "Unchanged", className: "badge badge-neutral" },
  PRODUCT_CHANGED: { label: "Changed", className: "badge badge-warn" },
  INVALID: { label: "Invalid", className: "badge badge-danger" },
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<ProductDetail>(`/products/${id}`)
      .then(setData)
      .catch((err) => setLoadError(errorMessage(err)));
  }, [id]);

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

  const { product, requests, appearances } = data;

  return (
    <Shell>
      <Link href="/products" className="backlink">
        ← Products
      </Link>

      <div className="page-head">
        <h1>{product.name ?? product.sku}</h1>
        <p className="page-meta">
          <span className="mono">{product.sku}</span>
          {product.category ? <span>{product.category}</span> : null}
        </p>
      </div>

      <div className="product-grid">
        <div className="card card-pad">
          {product.photoUrl ? (
            <img src={product.photoUrl} alt={product.name ?? product.sku} className="packshot" />
          ) : (
            <div className="thumb-empty" style={{ borderBottom: "none", borderRadius: 8 }}>
              No source photo
            </div>
          )}
        </div>
        <div className="card card-pad">
          <dl className="facts">
            <dt>SKU</dt>
            <dd className="mono">{product.sku}</dd>
            <dt>Category</dt>
            <dd>{product.category ?? "—"}</dd>
            <dt>Color / finish</dt>
            <dd>{product.colorFinish ?? "—"}</dd>
            <dt>Material</dt>
            <dd>{product.material ?? "—"}</dd>
            <dt>Price</dt>
            <dd>{product.priceRaw ?? "—"}</dd>
            <dt>First seen</dt>
            <dd>{shortDate(product.createdAt)}</dd>
            <dt>Last updated</dt>
            <dd>{shortDate(product.updatedAt)}</dd>
          </dl>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Shot requests</h2>
          <span className="section-sub">
            Creative work for this product — each request belongs to one import.
          </span>
        </div>
        {requests.length === 0 ? (
          <div className="card card-pad muted">
            No shot requests yet — creative work starts from an import.
          </div>
        ) : (
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Shot idea</th>
                  <th>Import</th>
                  <th>Status</th>
                  <th>Approved</th>
                  <th>Spend</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/requests/${r.id}`} className="clamp-2 verbatim">
                        {r.shotIdea}
                      </Link>
                    </td>
                    <td className="muted">
                      <Link href={`/imports/${r.importId}`}>{r.importFilename ?? "Import"}</Link>
                    </td>
                    <td>
                      <span className={statusChipClass(r.status)}>{STATUS_LABELS[r.status]}</span>
                    </td>
                    <td className="muted">
                      {r.approvedCount} of {r.requiredApprovals}
                    </td>
                    <td className="muted">{usd(r.spendUsd)}</td>
                    <td className="muted">{shortDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Import appearances</h2>
          <span className="section-sub">Every row snapshot received for this SKU, verbatim.</span>
        </div>
        {appearances.length === 0 ? (
          <div className="card card-pad muted">This SKU has not appeared in any import.</div>
        ) : (
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Import file</th>
                  <th>Uploaded</th>
                  <th>Row</th>
                  <th>Reconciliation</th>
                  <th>Shot idea</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {appearances.map((a) => {
                  const badge = RECONCILIATION_BADGES[a.productReconciliation];
                  return (
                    <tr key={`${a.importId}-${a.rowIndex}`}>
                      <td>
                        <Link href={`/imports/${a.importId}`}>{a.importFilename}</Link>
                      </td>
                      <td className="muted">{shortDate(a.importedAt)}</td>
                      <td className="muted">{a.rowIndex + 1}</td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="muted verbatim">{a.shotIdea ?? "—"}</td>
                      <td className="muted verbatim">{a.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
