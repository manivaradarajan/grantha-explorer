import { describe, it, expect } from "vitest";
import {
  Commentary,
  CommentaryPassage,
  Grantha,
  commentaryPassageForRef,
  nestSubcommentaries,
  compareRefs,
  sortPassagesByRef,
  nextUnloadedPartFirstRef,
  previousUnloadedPartFirstRef,
  getPassageFragment,
  getCuratedSidebarSections,
  getCuratedActiveSubsection,
  sectionPartsToLoad,
  PartSectionInfo,
  Passage,
  PrefatoryMaterial,
  GranthaSection,
} from "./data";
import { makePassage } from "@/tests/fixtures";

const pass = (ref: string): CommentaryPassage => ({
  ref,
  content: { sanskrit: { devanagari: ref }, english: "" },
});

const commentary = (id: string, refs: string[], parentId?: string): Commentary => ({
  commentary_id: id,
  commentary_title: id,
  commentator: { devanagari: "X" },
  parent_commentary_id: parentId,
  passages: refs.map(pass),
});

describe("commentaryPassageForRef", () => {
  it("matches an exact ref", () => {
    const passages = [pass("1.26"), pass("1.27")];
    expect(commentaryPassageForRef(passages, "1.26")?.ref).toBe("1.26");
  });

  it("prefers an exact ref over a covering range", () => {
    const passages = [pass("1.26-39"), pass("1.26")];
    expect(commentaryPassageForRef(passages, "1.26")?.ref).toBe("1.26");
  });

  it.each(["1.26", "1.30", "1.39"])(
    "matches a 2-part range at its bound/inside: %s",
    (ref) => {
      expect(commentaryPassageForRef([pass("1.26-39")], ref)?.ref).toBe("1.26-39");
    },
  );

  it.each(["1.25", "1.40", "2.34"])(
    "excludes a 2-part range just outside its bounds/other sections: %s",
    (ref) => {
      expect(commentaryPassageForRef([pass("1.26-39")], ref)).toBeUndefined();
    },
  );

  it.each(["8.3.8", "8.3.10", "8.3.12"])(
    "matches a 3-part range at its bound/inside: %s",
    (ref) => {
      expect(commentaryPassageForRef([pass("8.3.8-12")], ref)?.ref).toBe("8.3.8-12");
    },
  );

  it.each(["8.3.7", "8.3.13", "8.4.8", "8.2.9"])(
    "does not match a 3-part range across section/chapter bounds: %s",
    (ref) => {
      expect(commentaryPassageForRef([pass("8.3.8-12")], ref)).toBeUndefined();
    },
  );

  it("does not match when segment counts differ", () => {
    const passages = [pass("1.26-39")];
    expect(commentaryPassageForRef(passages, "1.2.30")).toBeUndefined();
  });

  it("returns undefined for empty passages or refs with mismatched depth", () => {
    expect(commentaryPassageForRef([], "1.1")).toBeUndefined();
    // selected ref deeper than the range (3 segments vs 2) is not covered
    expect(commentaryPassageForRef([pass("1.2-30")], "1.2.3")).toBeUndefined();
    // selected ref shallower than the range is not covered
    expect(commentaryPassageForRef([pass("1.2-30")], "1")).toBeUndefined();
  });
});

describe("nestSubcommentaries", () => {
  it("nests a subcommentary under its parent by parent_commentary_id", () => {
    const subs = [
      commentary("gita-bhashyam", ["1.1"]),
      commentary("tatparya-chandrika", ["1.1"], "gita-bhashyam"),
    ];
    const top = nestSubcommentaries(subs);
    expect(top.map((c) => c.commentary_id)).toEqual(["gita-bhashyam"]);
    expect(top[0].subcommentaries?.map((c) => c.commentary_id)).toEqual([
      "tatparya-chandrika",
    ]);
  });

  it("supports multiple subcommentaries on the same parent", () => {
    const subs = [
      commentary("parent", ["1.1"]),
      commentary("sub-a", ["1.1"], "parent"),
      commentary("sub-b", ["1.1"], "parent"),
    ];
    const top = nestSubcommentaries(subs);
    expect(top.length).toBe(1);
    expect(top[0].subcommentaries?.map((c) => c.commentary_id)).toEqual(["sub-a", "sub-b"]);
  });

  it("keeps an orphaned subcommentary at the top level (nothing is dropped)", () => {
    const subs = [commentary("orphan", ["1.1"], "missing-parent")];
    const top = nestSubcommentaries(subs);
    expect(top.map((c) => c.commentary_id)).toEqual(["orphan"]);
  });

  it("leaves a flat list unchanged when no parent_commentary_id is set", () => {
    const subs = [commentary("a", ["1.1"]), commentary("b", ["1.2"])];
    const top = nestSubcommentaries(subs);
    expect(top.map((c) => c.commentary_id)).toEqual(["a", "b"]);
    expect(top.every((c) => c.subcommentaries === undefined)).toBe(true);
  });
});

describe("compareRefs / sortPassagesByRef", () => {
  it("sorts numerically per segment, not lexicographically", () => {
    const refs = ["10.1", "2.1", "1.10", "1.2"];
    expect(refs.sort(compareRefs)).toEqual(["1.2", "1.10", "2.1", "10.1"]);
  });

  it("orders a shorter ref before its extension", () => {
    expect(compareRefs("1.1", "1.1.2")).toBeLessThan(0);
    expect(compareRefs("1.1.2", "1.1")).toBeGreaterThan(0);
  });

  it("falls back to string comparison for non-numeric segments", () => {
    expect(compareRefs("1.A", "1.B")).toBeLessThan(0);
    expect(compareRefs("1.2", "1.A")).toBeLessThan(0);
  });

  it("sortPassagesByRef returns a new array (does not mutate input)", () => {
    const input = [{ ref: "2.1" }, { ref: "1.1" }];
    const sorted = sortPassagesByRef(input);
    expect(sorted.map((p) => p.ref)).toEqual(["1.1", "2.1"]);
    expect(input.map((p) => p.ref)).toEqual(["2.1", "1.1"]);
    expect(sorted).not.toBe(input);
  });

  it("sortPassagesByRef is stable for equal refs", () => {
    const a = { ref: "1.1" };
    const b = { ref: "1.1" };
    const input = [a, b];
    const sorted = sortPassagesByRef(input);
    expect(sorted[0]).toBe(a);
    expect(sorted[1]).toBe(b);
  });
});

describe("lazy part loading (nextUnloadedPartFirstRef / previousUnloadedPartFirstRef)", () => {
  const parts = [
    { file: "part1.json", id: "0", first_ref: "0.1" },
    { file: "part2.json", id: "1", first_ref: "1.1" },
    { file: "part3.json", id: "2", first_ref: "2.1" },
    { file: "part4.json", id: "3", first_ref: "3.1" },
  ];

  const multiPartGrantha = (): Grantha =>
    ({
      parts,
      prefatory_material: [],
      concluding_material: [],
    } as unknown as Grantha);

  const loaded = (refs: string[]): (Passage | PrefatoryMaterial)[] =>
    refs.map(makePassage);

  it("returns the next unloaded part after the last loaded one", () => {
    const g = multiPartGrantha();
    expect(nextUnloadedPartFirstRef(g, loaded(["0.1", "1.1"]))).toBe("2.1");
  });

  it("returns undefined when every part is loaded", () => {
    const g = multiPartGrantha();
    expect(nextUnloadedPartFirstRef(g, loaded(["0.1", "1.1", "2.1", "3.1"]))).toBeUndefined();
  });

  it("returns undefined for a grantha with no parts", () => {
    const g = { parts: [], passages: [] } as unknown as Grantha;
    expect(nextUnloadedPartFirstRef(g, [])).toBeUndefined();
  });

  it("backward loading returns the part before the earliest loaded part", () => {
    // ch3 (3.1) loaded, ch1-2 not -> return 2.1 first
    const g = multiPartGrantha();
    expect(previousUnloadedPartFirstRef(g, loaded(["3.1"]))).toBe("2.1");
  });

  it("backward loading is undefined when the first part is loaded", () => {
    const g = multiPartGrantha();
    expect(previousUnloadedPartFirstRef(g, loaded(["0.1"]))).toBeUndefined();
  });

  it("backward loading handles a gap (preface + ch3 loaded, ch1-2 not)", () => {
    const g = multiPartGrantha();
    expect(previousUnloadedPartFirstRef(g, loaded(["0.1", "3.1"]))).toBe("2.1");
  });
});

describe("getPassageFragment", () => {
  it("returns an empty fragment for a label-only anchor with no content", () => {
    const anchor = {
      ref: "0.1",
      passage_type: "prefatory",
      label: { devanagari: "मङ्गलाचरणम्" },
    } as unknown as PrefatoryMaterial;
    expect(getPassageFragment(anchor)).toBe("");
  });

  it("truncates long text with an ellipsis at maxLength", () => {
    const passage: Passage = {
      ...makePassage("1.1"),
      content: { sanskrit: { devanagari: "अ" + "ब".repeat(200) }, english_translation: "" },
    };
    expect(getPassageFragment(passage, 80)).toBe("अ" + "ब".repeat(79) + "...");
  });

  it("normalizes newlines and whitespace", () => {
    const passage: Passage = {
      ...makePassage("1.1"),
      content: { sanskrit: { devanagari: "अ\nब   ग" }, english_translation: "" },
    };
    expect(getPassageFragment(passage)).toBe("अ ब ग");
  });
});

describe("curated sidebar sections", () => {
  const curatedGrantha = (refs: string[], sections: GranthaSection[]): Grantha =>
    ({
      grantha_id: "g",
      canonical_title: "",
      aliases: [],
      text_type: "prakarana",
      metadata: {} as Grantha["metadata"],
      structure_levels: [{ key: "Pada", scriptNames: { devanagari: "पादः" } }],
      prefatory_material: [],
      passages: refs.map(makePassage),
      concluding_material: [],
      commentaries: [],
      sections,
      parts: [],
    } as unknown as Grantha);

  it("builds curated sections and partitions every navigation passage exactly once", () => {
    const sections: GranthaSection[] = [
      {
        id: "s1",
        label: { devanagari: "एक", english: "one" },
        start_ref: "1",
        end_ref: "3",
        subsections: [
          { label: { devanagari: "१", english: "1" }, start_ref: "1", end_ref: "1" },
          { label: { devanagari: "२", english: "2" }, start_ref: "2", end_ref: "3" },
        ],
      },
      {
        id: "s2",
        label: { devanagari: "द्वि", english: "two" },
        start_ref: "4",
        end_ref: "4",
      },
    ];
    const g = curatedGrantha(["1", "2", "3", "4"], sections);
    const model = getCuratedSidebarSections(g);
    expect(model).not.toBeNull();
    const seen = new Set<string>();
    for (const section of model!) {
      for (const p of section.passages) {
        expect(seen.has(p.ref)).toBe(false);
        seen.add(p.ref);
      }
      for (const sub of section.subsections ?? []) {
        for (const p of sub.passages) {
          expect(seen.has(p.ref)).toBe(false);
          seen.add(p.ref);
        }
      }
    }
    expect([...seen].sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("throws when a curated section start_ref is unknown", () => {
    const sections: GranthaSection[] = [
      { id: "s1", label: { devanagari: "x", english: "x" }, start_ref: "99", end_ref: "1" },
    ];
    const g = curatedGrantha(["1", "2"], sections);
    expect(() => getCuratedSidebarSections(g)).toThrow(/not found in grantha passages/);
  });

  it("throws when a subsection overlaps another", () => {
    const sections: GranthaSection[] = [
      {
        id: "s1",
        label: { devanagari: "x", english: "x" },
        start_ref: "1",
        end_ref: "3",
        subsections: [
          { label: { devanagari: "१", english: "1" }, start_ref: "1", end_ref: "2" },
          { label: { devanagari: "२", english: "2" }, start_ref: "2", end_ref: "3" },
        ],
      },
    ];
    const g = curatedGrantha(["1", "2", "3"], sections);
    expect(() => getCuratedSidebarSections(g)).toThrow(/covered by more than one subsection/);
  });

  it("resolves the active subsection for a selected ref", () => {
    const sections: GranthaSection[] = [
      {
        id: "s1",
        label: { devanagari: "एक", english: "one" },
        start_ref: "1",
        end_ref: "3",
        subsections: [
          { label: { devanagari: "१", english: "1" }, start_ref: "1", end_ref: "1" },
          { label: { devanagari: "२", english: "2" }, start_ref: "2", end_ref: "3" },
        ],
      },
    ];
    const g = curatedGrantha(["1", "2", "3"], sections);
    const model = getCuratedSidebarSections(g)!;
    expect(getCuratedActiveSubsection(model[0], "2")?.label).toBe("२");
    expect(getCuratedActiveSubsection(model[0], "1")?.label).toBe("१");
  });
});

describe("sectionPartsToLoad (section-based eager part loading)", () => {
  // The regression fixture is deliberately adversarial: every part shares the
  // same kāṇḍa `id` ("1") because the Rāmāyaṇa's bala parts are all in kāṇḍa 1.
  // Section identity MUST be derived from `first_ref` (the sarga), never from
  // `id`, or selecting any verse would eager-load the whole kāṇḍa.
  const balaParts: PartSectionInfo[] = Array.from({ length: 75 }, (_, i) => ({
    file: `part${i + 1}.json`,
    // kāṇḍa 1, sarga (i+1); sarga 3 is absent from the source (76 files for
    // sargas 1–77 minus 3 and the excluded 8), so part i maps to sarga i for
    // the first two and jumps after that — the exact shape doesn't matter.
    first_ref: `1.${i + 1}.1`,
  }));

  const loaded = (...refs: string[]) => new Set(refs);

  it("eager-loads only the selected sarga, not the whole kāṇḍa (regression)", () => {
    const toLoad = sectionPartsToLoad(balaParts, "1.1.2", loaded());
    expect(toLoad).toEqual(["1.1.1"]);
  });

  it("matches a different sarga within the same kāṇḍa", () => {
    const toLoad = sectionPartsToLoad(balaParts, "1.18.5", loaded());
    expect(toLoad).toEqual(["1.18.1"]);
  });

  it("skips parts that are already loaded", () => {
    const toLoad = sectionPartsToLoad(
      balaParts,
      "1.2.3",
      loaded("1.2.1"),
    );
    expect(toLoad).toEqual([]);
  });

  it("returns an empty array when no part opens the section", () => {
    const toLoad = sectionPartsToLoad(balaParts, "5.1.1", loaded());
    expect(toLoad).toEqual([]);
  });

  it("supports chapter→verse texts where the section is the top-level segment", () => {
    const gitaParts: PartSectionInfo[] = Array.from({ length: 18 }, (_, i) => ({
      file: `part${i + 1}.json`,
      first_ref: `${i + 1}.1`,
    }));
    expect(sectionPartsToLoad(gitaParts, "2.14", loaded())).toEqual(["2.1"]);
    expect(sectionPartsToLoad(gitaParts, "2.14", loaded("2.1"))).toEqual([]);
  });
});
