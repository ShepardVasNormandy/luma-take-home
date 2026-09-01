import type { ParsedRow } from "./parse.js";

export interface CurrentProduct {
  sku: string;
  name: string | null;
  category: string | null;
  colorFinish: string | null;
  material: string | null;
  priceRaw: string | null;
  photoUrl: string | null;
}

export type ProductReconciliation =
  | "NEW_PRODUCT"
  | "PRODUCT_UNCHANGED"
  | "PRODUCT_CHANGED"
  | "INVALID";

export type CreativeWork = "NO_REQUEST" | "REQUEST_ELIGIBLE" | "NEEDS_INPUT";

export interface RowDisposition {
  productReconciliation: ProductReconciliation;
  creativeWork: CreativeWork;
  photoChanged: boolean;
}

const ATTRS = [
  ["productName", "name"],
  ["category", "category"],
  ["colorFinish", "colorFinish"],
  ["material", "material"],
  ["priceRaw", "priceRaw"],
  ["photoUrl", "photoUrl"],
] as const;

export function computeDisposition(
  row: ParsedRow,
  current: CurrentProduct | undefined,
): RowDisposition {
  if (row.validity === "INVALID") {
    return { productReconciliation: "INVALID", creativeWork: "NO_REQUEST", photoChanged: false };
  }

  let productReconciliation: ProductReconciliation;
  let photoChanged = false;
  if (!current) {
    productReconciliation = "NEW_PRODUCT";
  } else {
    const changed = ATTRS.some(([rowKey, productKey]) => row[rowKey] !== current[productKey]);
    productReconciliation = changed ? "PRODUCT_CHANGED" : "PRODUCT_UNCHANGED";
    photoChanged = row.photoUrl !== current.photoUrl;
  }

  // CONTEXT.md "Generation eligibility": SKU + Shot Idea + usable photo.
  // Preflight (async, network) can still downgrade REQUEST_ELIGIBLE to
  // NEEDS_INPUT after this synchronous pass.
  const creativeWork: CreativeWork = !row.shotIdea
    ? "NO_REQUEST"
    : row.photoUrl
      ? "REQUEST_ELIGIBLE"
      : "NEEDS_INPUT";

  return { productReconciliation, creativeWork, photoChanged };
}
