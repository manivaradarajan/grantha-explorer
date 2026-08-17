import { describe, it, expect } from "vitest";
import { parseReferences, isReferenceInLibrary } from "./references";

const abbrMap: Record<string, string> = {
  "भ.गी.": "bhagavad-gita",
  "तै.उ.": "taittiriya-upanishad",
};

describe("parseReferences", () => {
  it("extracts a grantha ref with a slash path", () => {
    const refs = parseReferences("[see here](ref:तै.उ./3.2)", abbrMap);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      displayText: "see here",
      granthaId: "taittiriya-upanishad",
      path: "3.2",
    });
  });

  it("resolves an abbreviation to its grantha id", () => {
    const [ref] = parseReferences("[भ.गी.](ref:भ.गी./1.1)", abbrMap);
    expect(ref.granthaId).toBe("bhagavad-gita");
  });

  it("keeps the raw token as granthaId when no abbreviation matches", () => {
    const [ref] = parseReferences("[x](ref:some-grantha/2.3)", abbrMap);
    expect(ref.granthaId).toBe("some-grantha");
  });

  it("normalizes - and / in the path to dots", () => {
    const [ref] = parseReferences("[x](ref:तै.उ./3-2-1)", abbrMap);
    expect(ref.path).toBe("3.2.1");
  });

  it("parses multiple references in one string", () => {
    const refs = parseReferences(
      "[a](ref:तै.उ./1.1) and [b](ref:भ.गी./2.2)",
      abbrMap,
    );
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.granthaId)).toEqual([
      "taittiriya-upanishad",
      "bhagavad-gita",
    ]);
  });

  it("returns nothing when there are no ref: links", () => {
    expect(parseReferences("plain text with no links", abbrMap)).toEqual([]);
  });
});

describe("isReferenceInLibrary", () => {
  it("checks membership against the available grantha ids", () => {
    const ids = ["bhagavad-gita", "taittiriya-upanishad"];
    expect(isReferenceInLibrary("bhagavad-gita", ids)).toBe(true);
    expect(isReferenceInLibrary("missing", ids)).toBe(false);
  });
});
