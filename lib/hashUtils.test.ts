import { describe, it, expect } from "vitest";
import {
  UrlState,
  parseHash,
  buildHash,
  validateAndNormalizeHash,
  parseEditionIds,
  getFirstVerseRef,
} from "./hashUtils";
import { Grantha } from "./data";
import { makePassage } from "@/tests/fixtures";

describe("parseHash", () => {
  it("parses grantha:verse", () => {
    expect(parseHash("#kena-upanishad:1.1")).toEqual({
      granthaId: "kena-upanishad",
      verseRef: "1.1",
    });
  });

  it("tolerates a leading #", () => {
    expect(parseHash("kena-upanishad:1.1")?.granthaId).toBe("kena-upanishad");
  });

  it("parses edition, subcommentary, mode, script, and commentary-open params", () => {
    const state = parseHash(
      "#bhagavad-gita:1.11?e=bhagavad-gita&sc=tatparya-chandrika,other&m=flow&s=roman&co=1",
    );
    expect(state).toEqual({
      granthaId: "bhagavad-gita",
      verseRef: "1.11",
      editionId: "bhagavad-gita",
      subcommentaryIds: "tatparya-chandrika,other",
      mode: "flow",
      script: "roman",
      commentaryOpen: true,
    });
  });

  it("returns null when grantha or verse is missing", () => {
    expect(parseHash("")).toBeNull();
    expect(parseHash("#kena-upanishad")).toBeNull();
    expect(parseHash("#:1.1")).toBeNull();
    expect(parseHash("#kena-upanishad:")).toBeNull();
  });
});

describe("buildHash / parseHash round-trip", () => {
  const base: UrlState = {
    granthaId: "bhagavad-gita",
    verseRef: "1.1",
  };

  it("round-trips edition, subcommentary, and mode", () => {
    const state: UrlState = {
      ...base,
      editionId: "bhagavad-gita",
      subcommentaryIds: "tatparya-chandrika",
      mode: "flow",
      commentaryOpen: true,
    };
    expect(parseHash(buildHash(state))).toEqual(state);
  });

  it("omits display prefs unless includePreferences is set", () => {
    const withPrefs: UrlState = { ...base, script: "roman", darkMode: true, fontSize: 120 };
    expect(parseHash(buildHash(withPrefs, false))?.script).toBeUndefined();
    expect(parseHash(buildHash(withPrefs, true))).toEqual(withPrefs);
  });

  it("omits default-ish values (panes mode, deva script, fontSize 100)", () => {
    const state: UrlState = { ...base, mode: "panes", script: "deva", fontSize: 100 };
    expect(buildHash(state, true)).toBe("#bhagavad-gita:1.1");
  });
});

describe("validateAndNormalizeHash", () => {
  const multiEditionGrantha = (): Grantha =>
    ({
      passages: [makePassage("1.1"), makePassage("1.2")],
      prefatory_material: [],
      concluding_material: [],
      editions: [
        { edition_id: "ed-a", path: "a", isDefault: true },
        { edition_id: "ed-b", path: "b" },
      ],
    } as unknown as Grantha);

  const singleEditionGrantha = (): Grantha =>
    ({
      passages: [makePassage("1.1"), makePassage("1.2")],
      prefatory_material: [],
      concluding_material: [],
    } as unknown as Grantha);

  it("passes through unchanged when grantha is not yet loaded", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.1", editionId: "ed-a" };
    expect(validateAndNormalizeHash(state, null)).toEqual({ ...state, needsCorrection: false });
  });

  it("keeps a valid edition", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.1", editionId: "ed-b" };
    expect(validateAndNormalizeHash(state, multiEditionGrantha())).toEqual({
      ...state,
      needsCorrection: false,
    });
  });

  it("corrects an invalid edition to the default", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.1", editionId: "nope" };
    expect(validateAndNormalizeHash(state, multiEditionGrantha())).toEqual({
      granthaId: "g",
      verseRef: "1.1",
      editionId: "ed-a",
      needsCorrection: true,
    });
  });

  it("keeps the valid entries of a partially-valid compare-mode edition list", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.1", editionId: "ed-a,nope" };
    expect(validateAndNormalizeHash(state, multiEditionGrantha())).toEqual({
      ...state,
      editionId: "ed-a",
      needsCorrection: true,
    });
  });

  it("drops a stray ?e= on a single-edition grantha", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.1", editionId: "stray" };
    expect(validateAndNormalizeHash(state, singleEditionGrantha())).toEqual({
      granthaId: "g",
      verseRef: "1.1",
      needsCorrection: true,
    });
  });

  it("corrects an invalid verse ref to the first verse", () => {
    const state: UrlState = { granthaId: "g", verseRef: "9.9" };
    const result = validateAndNormalizeHash(state, singleEditionGrantha());
    expect(result.verseRef).toBe("1.1");
    expect(result.needsCorrection).toBe(true);
  });

  it("leaves a valid verse ref unchanged", () => {
    const state: UrlState = { granthaId: "g", verseRef: "1.2" };
    expect(validateAndNormalizeHash(state, singleEditionGrantha())).toEqual({
      ...state,
      needsCorrection: false,
    });
  });
});

describe("parseEditionIds", () => {
  it("splits, trims, and de-duplicates", () => {
    expect(parseEditionIds("a, b ,a,c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty for absent or blank input", () => {
    expect(parseEditionIds()).toEqual([]);
    expect(parseEditionIds("")).toEqual([]);
    expect(parseEditionIds("  ,  ")).toEqual([]);
  });
});

describe("getFirstVerseRef", () => {
  it("prefers prefatory material over main passages", () => {
    const grantha = {
      prefatory_material: [{ ref: "0.1" }],
      passages: [makePassage("1.1")],
    } as unknown as Grantha;
    expect(getFirstVerseRef(grantha)).toBe("0.1");
  });

  it("falls back to the first main passage", () => {
    const grantha = {
      prefatory_material: [],
      passages: [makePassage("1.1")],
    } as unknown as Grantha;
    expect(getFirstVerseRef(grantha)).toBe("1.1");
  });
});
