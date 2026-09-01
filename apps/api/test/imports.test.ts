import { describe, expect, it } from "vitest";
import { CsvParseError, parseCatalogCsv } from "../src/imports/parse.js";
import { computeDisposition, type CurrentProduct } from "../src/imports/stage.js";

// Synthetic fixture replicating the shape and quirks of the customer's
// export (quoted commas, multi-value colors, tentative ideas, SKU gaps,
// blank cells) without shipping customer data in the repo.
const SYNTHETIC_CATALOG = [
  "SKU,Product Name,Category,Color / Finish,Material,Price,Photo,Shot Idea,Notes",
  'SY-001,Test Mug 12oz,Ceramics,Sage,Stoneware,$28,https://example.com/sy-001.jpg,"morning kitchen counter, steam, warm light","EL: bestseller, do this one first"',
  "SY-002,Test Vase,Ceramics,Terracotta,Stoneware,$48,https://example.com/sy-002.jpg,,",
  'SY-004,Test Bowl Large,Ceramics,Forest,Stoneware,$52,https://example.com/sy-004.jpg,"on a set dinner table, with food in it?",reordered constantly',
  "SY-005,Test Canister Set (3),Kitchen,Cream Terracotta Sage,Stoneware,$64,https://example.com/sy-005.jpg,,",
  "SY-007,Test Basket,Kitchen,Sage Liner,Rattan + linen,$32,https://example.com/sy-007.jpg,,came out too shiny in last shoot",
].join("\n");

describe("parseCatalogCsv on a customer-shaped export", () => {
  const parsed = parseCatalogCsv(Buffer.from(SYNTHETIC_CATALOG));

  it("preserves header order exactly", () => {
    expect(parsed.headers).toEqual([
      "SKU",
      "Product Name",
      "Category",
      "Color / Finish",
      "Material",
      "Price",
      "Photo",
      "Shot Idea",
      "Notes",
    ]);
  });

  it("parses all rows as valid despite SKU gaps", () => {
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows.every((r) => r.validity === "VALID")).toBe(true);
  });

  it("keeps customer-style quirks intact", () => {
    const mug = parsed.rows.find((r) => r.sku === "SY-001")!;
    expect(mug.shotIdea).toBe("morning kitchen counter, steam, warm light");
    expect(mug.notes).toBe("EL: bestseller, do this one first");

    const bowl = parsed.rows.find((r) => r.sku === "SY-004")!;
    expect(bowl.shotIdea).toBe("on a set dinner table, with food in it?");

    const canisters = parsed.rows.find((r) => r.sku === "SY-005")!;
    expect(canisters.colorFinish).toBe("Cream Terracotta Sage");
  });

  it("counts shot ideas correctly", () => {
    expect(parsed.rows.filter((r) => r.shotIdea !== null)).toHaveLength(2);
  });

  it("keeps raw values verbatim per row for export round-trip", () => {
    const basket = parsed.rows.find((r) => r.sku === "SY-007")!;
    expect(basket.raw["Notes"]).toBe("came out too shiny in last shoot");
    expect(basket.raw["Shot Idea"]).toBe("");
    expect(basket.shotIdea).toBeNull();
  });
});

describe("parseCatalogCsv edge cases", () => {
  it("flags rows without SKU as INVALID without failing the file", () => {
    const csv = Buffer.from("SKU,Product Name,Shot Idea\nHG-1,Vase,idea\n,Ghost,\n");
    const parsed = parseCatalogCsv(csv);
    expect(parsed.rows[0]!.validity).toBe("VALID");
    expect(parsed.rows[1]).toMatchObject({ validity: "INVALID", invalidReason: "Missing SKU" });
  });

  it("preserves unknown columns in raw", () => {
    const csv = Buffer.from("SKU,Mystery Column\nHG-1,keep me\n");
    expect(parseCatalogCsv(csv).rows[0]!.raw["Mystery Column"]).toBe("keep me");
  });

  it("rejects duplicate headers", () => {
    expect(() => parseCatalogCsv(Buffer.from("SKU,SKU\na,b\n"))).toThrow(CsvParseError);
  });

  it("tolerates short rows", () => {
    const parsed = parseCatalogCsv(Buffer.from("SKU,Product Name,Notes\nHG-1,Vase\n"));
    expect(parsed.rows[0]!.raw["Notes"]).toBe("");
  });
});

describe("computeDisposition", () => {
  const row = (over: Partial<ReturnType<typeof parseCatalogCsv>["rows"][number]> = {}) => ({
    rowIndex: 0,
    raw: {},
    sku: "HG-1",
    productName: "Vase",
    category: "Ceramics",
    colorFinish: "Terracotta",
    material: "Stoneware",
    priceRaw: "$48",
    photoUrl: "https://example.com/p.jpg",
    shotIdea: "on a shelf",
    notes: null,
    validity: "VALID" as const,
    invalidReason: null,
    ...over,
  });

  const product: CurrentProduct = {
    sku: "HG-1",
    name: "Vase",
    category: "Ceramics",
    colorFinish: "Terracotta",
    material: "Stoneware",
    priceRaw: "$48",
    photoUrl: "https://example.com/p.jpg",
  };

  it("unknown SKU → NEW_PRODUCT", () => {
    expect(computeDisposition(row(), undefined).productReconciliation).toBe("NEW_PRODUCT");
  });

  it("identical attrs → PRODUCT_UNCHANGED", () => {
    expect(computeDisposition(row(), product).productReconciliation).toBe("PRODUCT_UNCHANGED");
  });

  it("any attr differs → PRODUCT_CHANGED; photo change flagged separately", () => {
    const d = computeDisposition(row({ photoUrl: "https://example.com/new.jpg" }), product);
    expect(d.productReconciliation).toBe("PRODUCT_CHANGED");
    expect(d.photoChanged).toBe(true);

    const priceOnly = computeDisposition(row({ priceRaw: "$52" }), product);
    expect(priceOnly.productReconciliation).toBe("PRODUCT_CHANGED");
    expect(priceOnly.photoChanged).toBe(false);
  });

  it("no shot idea → NO_REQUEST; idea without photo → NEEDS_INPUT; both → REQUEST_ELIGIBLE", () => {
    expect(computeDisposition(row({ shotIdea: null }), product).creativeWork).toBe("NO_REQUEST");
    expect(computeDisposition(row({ photoUrl: null }), product).creativeWork).toBe("NEEDS_INPUT");
    expect(computeDisposition(row(), product).creativeWork).toBe("REQUEST_ELIGIBLE");
  });

  it("INVALID row → INVALID + NO_REQUEST regardless of content", () => {
    const d = computeDisposition(row({ sku: null, validity: "INVALID" }), undefined);
    expect(d.productReconciliation).toBe("INVALID");
    expect(d.creativeWork).toBe("NO_REQUEST");
  });
});
