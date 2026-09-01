import { describe, expect, it } from "vitest";
import { assembleGenerationBody, assemblePrompt } from "../src/luma/assemble.js";

const facts = {
  name: "Stoneware Mug 12oz",
  colorFinish: "Sage",
  material: "Stoneware",
  photoUrl: "https://example.com/hg-002.jpg",
};

describe("prompt assembly (ADR-0002 template)", () => {
  it("assembles direction + facts + preservation + style", () => {
    expect(assemblePrompt("morning kitchen counter, steam, warm light", facts)).toBe(
      [
        "morning kitchen counter, steam, warm light",
        "Product: Stoneware Mug 12oz, Sage, Stoneware.",
        "Preserve the exact shape, color, and material of the product from the source image.",
        "Photorealistic lifestyle product photograph.",
      ].join("\n"),
    );
  });

  it("skips the facts line when no facts are present", () => {
    const prompt = assemblePrompt("on a shelf", {
      name: null,
      colorFinish: null,
      material: null,
      photoUrl: facts.photoUrl,
    });
    expect(prompt).not.toContain("Product:");
    expect(prompt.startsWith("on a shelf\n")).toBe(true);
  });

  it("builds the image_edit body with the source photo", () => {
    const body = assembleGenerationBody("idea", facts);
    expect(body).toMatchObject({
      model: "uni-1",
      type: "image_edit",
      source: { url: facts.photoUrl },
      output_format: "jpeg",
    });
  });
});
