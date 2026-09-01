import { parse } from "csv-parse/sync";

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  sku: string | null;
  productName: string | null;
  category: string | null;
  colorFinish: string | null;
  material: string | null;
  priceRaw: string | null;
  photoUrl: string | null;
  shotIdea: string | null;
  notes: string | null;
  validity: "VALID" | "INVALID";
  invalidReason: string | null;
}

export interface ParsedCatalog {
  headers: string[];
  rows: ParsedRow[];
}

// The customer's known column names. Unknown columns are preserved in `raw`
// untouched; missing known columns just yield null parsed views.
const COLUMNS = {
  sku: "SKU",
  productName: "Product Name",
  category: "Category",
  colorFinish: "Color / Finish",
  material: "Material",
  priceRaw: "Price",
  photoUrl: "Photo",
  shotIdea: "Shot Idea",
  notes: "Notes",
} as const;

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export class CsvParseError extends Error {}

export function parseCatalogCsv(buffer: Buffer): ParsedCatalog {
  let records: string[][];
  try {
    records = parse(buffer, {
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    });
  } catch (err) {
    throw new CsvParseError(`Could not parse CSV: ${(err as Error).message}`);
  }

  const [headerRow, ...dataRows] = records;
  if (!headerRow || headerRow.length === 0) {
    throw new CsvParseError("CSV has no header row");
  }
  const headers = headerRow.map((h) => h.trim());
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) throw new CsvParseError(`Duplicate column header: "${h}"`);
    seen.add(h);
  }

  const rows = dataRows.map((cells, i): ParsedRow => {
    const raw: Record<string, string> = {};
    headers.forEach((header, col) => {
      raw[header] = cells[col] ?? "";
    });

    const field = (key: keyof typeof COLUMNS) => clean(raw[COLUMNS[key]]);
    const sku = field("sku");

    return {
      rowIndex: i,
      raw,
      sku,
      productName: field("productName"),
      category: field("category"),
      colorFinish: field("colorFinish"),
      material: field("material"),
      priceRaw: field("priceRaw"),
      photoUrl: field("photoUrl"),
      shotIdea: field("shotIdea"),
      notes: field("notes"),
      validity: sku ? "VALID" : "INVALID",
      invalidReason: sku ? null : "Missing SKU",
    };
  });

  return { headers, rows };
}
