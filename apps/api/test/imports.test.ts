import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CsvParseError, parseCatalogCsv } from "../src/imports/parse.js";
import { computeDisposition, type CurrentProduct } from "../src/imports/stage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const realCatalog = () => readFileSync(path.join(repoRoot, "data/catalog.csv"));

describe("parseCatalogCsv on the real customer export", () => {
  const parsed = parseCatalogCsv(realCatalog());

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

  it("parses all 40 rows, all valid", () => {
    expect(parsed.rows).toHaveLength(40);
    expect(parsed.rows.every((r) => r.validity === "VALID")).toBe(true);
  });

  it("keeps the customer's quirks intact", () => {
    const mug = parsed.rows.find((r) => r.sku === "HG-002")!;
    expect(mug.shotIdea).toBe("morning kitchen counter, steam, warm light");
    expect(mug.notes).toBe("El: bestseller, do this one first");

    const bowl = parsed.rows.find((r) => r.sku === "HG-005")!;
    expect(bowl.shotIdea).toBe("on a set dinner table, with food in it?");

    const canisters = parsed.rows.find((r) => r.sku === "HG-018")!;
    expect(canisters.colorFinish).toBe("Cream Terracotta Sage");
  });

  it("finds exactly the 16 shot ideas the brief mentions", () => {
    expect(parsed.rows.filter((r) => r.shotIdea !== null)).toHaveLength(16);
  });

  it("keeps raw values verbatim per row for export round-trip", () => {
    const basket = parsed.rows.find((r) => r.sku === "HG-022")!;
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
