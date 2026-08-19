import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Grantha, Reference } from "./data";
import {
  getPassagePreview,
  isReferenceInLibrary,
  resolveReferenceTarget,
} from "./references";
import { makePassage } from "@/tests/fixtures";

/** A nested depth-3 structure tree, matching the on-disk `structure_levels`
 *  shape (children chain, NOT a flat array). `structure_levels.length` is 1;
 *  the real depth is 3. Regression guard: depth must be computed by walking
 *  children, or partial locators overflow. */
const depth3Structure = (): Grantha["structure_levels"] => [
  {
    key: "Mundaka",
    scriptNames: { devanagari: "मुण्डकः" },
    children: [
      {
        key: "Khanda",
        scriptNames: { devanagari: "खण्डः" },
        children: [
          { key: "Mantra", scriptNames: { devanagari: "मन्त्रः" } },
        ],
      },
    ],
  },
];

const metadata: Grantha["metadata"] = {
  source_url: null,
  source_commit: null,
  source_file: "test.md",
  processing_pipeline: {},
  quality_notes: "",
  last_updated: "2026-01-01",
};

/** A depth-3 target with passages, a curated section, and one part. */
const depth3Grantha: Grantha = {
  id: "test-grantha",
  path: "test-grantha",
  title: "Test",
  title_deva: "परीक्षा",
  title_iast: "Test",
  categories: [],
  grantha_id: "test-grantha",
  canonical_title: "Test",
  aliases: [],
  text_type: "upanishad",
  metadata,
  structure_levels: depth3Structure(),
  prefatory_material: [],
  passages: [makePassage("1.1.1"), makePassage("1.1.2"), makePassage("1.2.1")],
  concluding_material: [],
  commentaries: [],
  sections: [{ id: "s1", label: { devanagari: "खण्ड", english: "k" }, start_ref: "1.1", end_ref: "1.1.2" }],
  parts: [{ file: "part1.json", id: "1", first_ref: "1.1.1" }],
};

const ref = (partial: Partial<Reference>): Reference => ({
  start: 0,
  end: 1,
  display_text: "x",
  grantha_id: "test-grantha",
  locator: null,
  unresolved: false,
  ...partial,
});

describe("resolveReferenceTarget", () => {
  it("resolves a full locator to an exact leaf", () => {
    const r = resolveReferenceTarget(depth3Grantha, "1.1.2");
    expect(r).toEqual({ kind: "passage", ref: "1.1.2", isSection: false });
  });

  it("resolves a partial locator to a matching section marker (isSection)", () => {
    // Section marker whose start_ref equals the partial locator.
    const r = resolveReferenceTarget(depth3Grantha, "1.1");
    expect(r).toEqual({ kind: "passage", ref: "1.1", isSection: true });
  });

  it("resolves a partial locator to a loaded leaf when no section marker matches", () => {
    // Locator "1.2" has no section marker; first loaded leaf under "1.2" is 1.2.1.
    const grantha = {
      ...depth3Grantha,
      sections: [],
    };
    const r = resolveReferenceTarget(grantha, "1.2");
    expect(r).toEqual({ kind: "passage", ref: "1.2.1", isSection: false });
  });

  it("resolves a partial locator to a part first_ref when the leaf is in a later part", () => {
    // Only part 1 is loaded; the partial locator "2" names a later part whose
    // first_ref is "2.1.1".
    const grantha = {
      ...depth3Grantha,
      sections: [],
      passages: [makePassage("1.1.1")], // part 2's leaves not loaded
      parts: [
        { file: "part1.json", id: "1", first_ref: "1.1.1" },
        { file: "part2.json", id: "2", first_ref: "2.1.1" },
      ],
    };
    const r = resolveReferenceTarget(grantha, "2");
    expect(r).toEqual({ kind: "passage", ref: "2.1.1", isSection: false });
  });

  it("resolves a 2-segment partial locator on a depth-3 nested tree (mundaka regression)", () => {
    // मु. उ. १.१ → locator "1.1". The structure_levels is a NESTED tree whose
    // .length is 1; the true depth is 3. Regression: depth must be computed by
    // walking children, or "1.1" (2 segs) wrongly overflows a depth-1 view.
    const grantha = {
      ...depth3Grantha,
      sections: [],
      parts: [{ file: "part1.json", id: "1", first_ref: "1.1.1" }],
    };
    const r = resolveReferenceTarget(grantha, "1.1");
    expect(r.kind).not.toBe("unresolved");
    expect(r).toEqual({ kind: "passage", ref: "1.1.1", isSection: false });
  });

  it("resolves a full-depth locator in a later, unloaded part (chandogya regression)", () => {
    // छा. उ. ६.८.७ → locator "6.8.7" (full depth 3). Only part 1 is loaded;
    // the leaf lives in part 6. Must resolve to the exact ref (the reader's
    // section loader fetches the containing part on navigation), NOT
    // REF-RUNTIME-UNRESOLVED.
    const grantha: Grantha = {
      ...depth3Grantha,
      sections: [],
      passages: [makePassage("1.1.1")], // only part 1's leaves loaded
      parts: Array.from({ length: 8 }, (_, i) => ({
        file: `part${i + 1}.json`,
        id: String(i + 1),
        first_ref: `${i + 1}.1.1`,
      })),
    };
    const r = resolveReferenceTarget(grantha, "6.8.7");
    expect(r.kind).not.toBe("unresolved");
    expect(r).toEqual({ kind: "passage", ref: "6.8.7", isSection: false });
  });

  it("resolves a whole-work locator to the grantha root", () => {
    const r = resolveReferenceTarget(depth3Grantha, null);
    expect(r).toEqual({ kind: "root", ref: "1.1.1" });
  });

  it("falls back to the first main passage ref for the root without parts", () => {
    const grantha = { ...depth3Grantha, parts: undefined };
    const r = resolveReferenceTarget(grantha, null);
    expect(r).toEqual({ kind: "root", ref: "1.1.1" });
  });

  it("flags a depth overflow as unresolved", () => {
    const r = resolveReferenceTarget(depth3Grantha, "1.1.1.9");
    expect(r).toEqual({ kind: "unresolved", code: "REF-RUNTIME-DEPTH-OVERFLOW" });
  });

  it("flags an unmatched locator as unresolved", () => {
    const r = resolveReferenceTarget(depth3Grantha, "3.3");
    expect(r).toEqual({ kind: "unresolved", code: "REF-RUNTIME-UNRESOLVED" });
  });

  it("keeps range refs on their first endpoint (locator is already the first)", () => {
    // A range reference's locator is the first endpoint; it resolves as a leaf.
    const grantha = {
      ...depth3Grantha,
      passages: [
        makePassage("1.1.7"),
        makePassage("1.1.11"),
        makePassage("1.1.35"),
      ],
    };
    const r = resolveReferenceTarget(grantha, "1.1.7");
    expect(r).toEqual({ kind: "passage", ref: "1.1.7", isSection: false });
  });
});

describe("isReferenceInLibrary", () => {
  it("checks membership via a Set over the available ids", () => {
    const ids = ["bhagavad-gita", "taittiriya-upanishad"];
    expect(isReferenceInLibrary("bhagavad-gita", ids)).toBe(true);
    expect(isReferenceInLibrary("missing", ids)).toBe(false);
  });
});

// Reference artifacts keep their schema shape end-to-end (used by renderer).
describe("Reference artifact shape", () => {
  it("carries the producer-emitted fields", () => {
    const r = ref({
      start: 807,
      end: 819,
      display_text: "श्वे. उ. १.९",
      grantha_id: "svetasvatara-upanishad",
      locator: "1.9",
    });
    expect(r).toMatchObject({
      start: 807,
      end: 819,
      display_text: "श्वे. उ. १.९",
      grantha_id: "svetasvatara-upanishad",
      locator: "1.9",
    });
    expect(r.locator_end).toBeUndefined();
    expect(r.group_id).toBeUndefined();
  });

  it("supports whole-work references (locator null, resolved)", () => {
    const r = ref({
      grantha_id: "shatapatha-brahmana",
      locator: null,
      unresolved: false,
    });
    expect(r.locator).toBeNull();
    expect(r.unresolved).toBe(false);
  });

  it("supports unresolved references (grantha_id null, unresolved true)", () => {
    const r = ref({ grantha_id: null, locator: null, unresolved: true });
    expect(r.grantha_id).toBeNull();
    expect(r.unresolved).toBe(true);
  });
});

describe("getPassagePreview (later-part fetch)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const part1 = {
      kind: "grantha-part",
      passages: [makePassage("1.1"), makePassage("1.2")],
      prefatory_material: [],
      concluding_material: [],
    };
    const part4 = {
      kind: "grantha-part",
      passages: [
        { ...makePassage("4.1"), content: { sanskrit: { devanagari: "चतुर्थ अध्याय" }, english_translation: "" } },
        { ...makePassage("4.6"), content: { sanskrit: { devanagari: "श्वे. उ. ४.६ का मन्त्र" }, english_translation: "" } },
      ],
      prefatory_material: [],
      concluding_material: [],
    };
    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url.endsWith("granthas.json")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: "svetasvatara-upanishad", path: "svetasvatara-upanishad", title: "s", title_deva: "श्वे", title_iast: "s", categories: [] }]))
        );
      }
      if (url.endsWith("envelope.json")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            kind: "edition-sub-envelope",
            grantha_id: "svetasvatara-upanishad",
            canonical_title: "श्वेताश्वतरोपनिषत्",
            text_type: "upanishad",
            metadata,
            structure_levels: [
              {
                key: "Adhyaya",
                scriptNames: { devanagari: "अध्यायः" },
                children: [{ key: "Mantra", scriptNames: { devanagari: "मन्त्रः" } }],
              },
            ],
            parts: [
              { file: "part1.json", first_ref: "1.1" },
              { file: "part2.json", first_ref: "2.1" },
              { file: "part3.json", first_ref: "3.1" },
              { file: "part4.json", first_ref: "4.1" },
              { file: "part5.json", first_ref: "5.1" },
              { file: "part6.json", first_ref: "6.1" },
            ],
          }))
        );
      }
      if (url.endsWith("part1.json")) return Promise.resolve(new Response(JSON.stringify(part1)));
      if (url.endsWith("part4.json")) return Promise.resolve(new Response(JSON.stringify(part4)));
      return Promise.reject(new Error(`no route ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the cited passage from a later part by fetching it on demand", async () => {
    const r = ref({
      grantha_id: "svetasvatara-upanishad",
      locator: "4.6",
    });
    const preview = await getPassagePreview(
      "svetasvatara-upanishad",
      r,
      ["svetasvatara-upanishad"],
    );
    expect(preview).toContain("श्वे. उ. ४.६ का मन्त्र");
    // part4.json was fetched for the preview.
    const part4Calls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("part4.json"));
    expect(part4Calls.length).toBe(1);
  });
});
