import { PRICE_USD, type GenerationModel } from "@shots/shared";

export interface ProductFacts {
  name: string | null;
  colorFinish: string | null;
  material: string | null;
  photoUrl: string;
}

// docs/adr/0002 locks this template: active Direction + selective product
// facts + one short preservation instruction + source image. Changing it
// requires new evidence, not memory.
export function assemblePrompt(direction: string, facts: ProductFacts): string {
  const lines = [direction.trim()];

  const factParts = [facts.name, facts.colorFinish, facts.material].filter(Boolean);
  if (factParts.length > 0) lines.push(`Product: ${factParts.join(", ")}.`);

  lines.push(
    "Preserve the exact shape, color, and material of the product from the source image.",
    "Photorealistic lifestyle product photograph.",
  );
  return lines.join("\n");
}

export const GENERATION_MODEL: GenerationModel = "uni-1";

export function assembleGenerationBody(direction: string, facts: ProductFacts) {
  return {
    model: GENERATION_MODEL,
    type: "image_edit" as const,
    prompt: assemblePrompt(direction, facts),
    source: { url: facts.photoUrl },
    output_format: "jpeg" as const,
  };
}

export const priceSnapshotUsd = () => PRICE_USD[GENERATION_MODEL].imageEdit;
