"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "../lib/api";
import { shortDate } from "../lib/status";
import { Shell } from "../lib/Shell";
import type { ProductListItem } from "../lib/types";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<{ products: ProductListItem[] }>("/products")
      .then((data) => setProducts(data.products))
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  return (
    <Shell>
      <div className="page-head">
        <h1>Products</h1>
        <p className="page-meta">The canonical catalog — one row per SKU, reconciled across imports.</p>
      </div>

      <div className="section">
        {loadError ? (
          <p className="error-text">Could not load products: {loadError}</p>
        ) : products === null ? (
          <p className="muted">Loading…</p>
        ) : products.length === 0 ? (
          <div className="card card-pad muted">
            No products yet — they appear once an import is confirmed.
          </div>
        ) : (
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Color / finish</th>
                  <th>Material</th>
                  <th>Price</th>
                  <th>Requests</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="row-link"
                    onClick={() => router.push(`/products/${p.id}`)}
                  >
                    <td className="mono">{p.sku}</td>
                    <td>
                      <Link href={`/products/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        {p.name ?? <span className="muted">—</span>}
                      </Link>
                    </td>
                    <td className="muted">{p.category ?? "—"}</td>
                    <td className="muted">{p.colorFinish ?? "—"}</td>
                    <td className="muted">{p.material ?? "—"}</td>
                    <td className="muted">{p.priceRaw ?? "—"}</td>
                    <td className="muted">{p.requestCount}</td>
                    <td className="muted">{shortDate(p.updatedAt)}</td>
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
