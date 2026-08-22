import { describe, it, expect } from "vitest";
import { assertCodePointOffsetAligned } from "./stringUtils";

describe("assertCodePointOffsetAligned (SPEC §7)", () => {
  it("accepts offsets inside BMP Devanagari (the normal corpus case)", () => {
    // "श्वे. उ. १.९" — all BMP, any offset is a valid UTF-16 boundary.
    const text = "इति (श्वे. उ. १.९) उक्तम्";
    for (let i = 0; i <= text.length; i++) {
      expect(() => assertCodePointOffsetAligned(text, i)).not.toThrow();
    }
  });

  it("fails loudly when an offset would split a non-BMP (astral) char", () => {
    // "अ😀ब": अ=0, 😀 = surrogate pair at UTF-16 indices 1-2, ब=3. Offset 2
    // (between the pair's halves) splits the non-BMP char.
    const text = "अ😀ब";
    expect(() => assertCodePointOffsetAligned(text, 2)).toThrow(/non-BMP/);
    expect(() => assertCodePointOffsetAligned(text, 1)).not.toThrow();
    expect(() => assertCodePointOffsetAligned(text, 3)).not.toThrow();
  });

  it("is a no-op at the string edges", () => {
    const text = "अ😀ब";
    expect(() => assertCodePointOffsetAligned(text, 0)).not.toThrow();
    expect(() => assertCodePointOffsetAligned(text, text.length)).not.toThrow();
  });
});
