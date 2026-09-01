"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { api, errorMessage } from "../lib/api";
import { productChip } from "../lib/status";
import { Shell } from "../lib/Shell";
import { StatusChip } from "../lib/StatusChip";
import { PaginationFooter } from "../lib/PaginationFooter";
import type { ProductListItem } from "../lib/types";

const PAGE_SIZE = 12;

function ProductCard({ product }: { product: ProductListItem }) {
  const [thumbError, setThumbError] = useState(false);
  const chip = productChip(product.statusCounts);
  const attrs = [product.category, product.material].filter(Boolean);

  return (
    <Link href={`/products/${product.id}`} className="product-card">
      {product.photoUrl ? (
        <img className="photo" src={product.photoUrl} alt={product.name ?? product.sku} />
      ) : (
        <div className="photo-empty">No photo</div>
      )}
      <div className="p-name">{product.name ?? <span className="muted">Unnamed</span>}</div>
      <div className="p-sku">{product.sku}</div>
      <div className="p-attrs">
        {attrs.length > 0 ? (
          attrs.map((a) => <div key={a}>{a}</div>)
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="p-chip">
        <StatusChip tone={chip.tone} label={chip.label} />
      </div>
      <div className="shot-strip">
        {product.approvedAssetPublicId && !thumbError ? (
          <>
            <img
              src={`/api/assets/${product.approvedAssetPublicId}`}
              alt="Latest approved shot"
              onError={() => setThumbError(true)}
            />
            {product.approvedCount > 1 ? (
              <span className="shot-more">+{product.approvedCount - 1}</span>
            ) : null}
          </>
        ) : product.approvedCount > 0 ? (
          <span className="shot-more">{product.approvedCount} approved</span>
        ) : (
          <span className="shot-none">No approved shots</span>
        )}
      </div>
    </Link>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  useEffect(() => {
    api<{ products: ProductListItem[] }>("/products")
      .then((data) => setProducts(data.products))
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const filtered = useMemo(() => {
    if (!products) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) =>
      [p.sku, p.name, p.category, p.material]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [products, q]);

  const pageItems = filtered?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Shell>
      <div className="page-top">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Products</h1>
          <p className="page-meta">The canonical catalog — one card per SKU, reconciled across imports.</p>
        </div>
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search products…"
            value={q}
            onChange={(e) => {
              void setQ(e.target.value || null);
              void setPage(null);
            }}
          />
        </div>
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        {loadError ? (
          <p className="error-text">Could not load products: {loadError}</p>
        ) : filtered === null || pageItems === undefined ? (
          <p className="muted">Loading…</p>
        ) : products?.length === 0 ? (
          <div className="card card-pad muted">
            No products yet — they appear once an import is confirmed.
          </div>
        ) : filtered.length === 0 ? (
          <div className="card card-pad muted">No products match the search.</div>
        ) : (
          <>
            <div className="catalog-grid">
              {pageItems.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <PaginationFooter
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              noun="products"
              onPage={(p) => void setPage(p === 1 ? null : p)}
            />
          </>
        )}
      </div>
    </Shell>
  );
}
