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
  partLevelFor,
  partRanges,
  partBacksPrefix,
  buildPartHierarchy,
  PartSectionInfo,
  StructureLevel,
  Passage,
  PrefatoryMaterial,
  GranthaSection,
  presentationFor,
  deriveEditionKind,
  KNOWN_PASSAGE_KINDS,
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

describe("partLevelFor (depth-based part level)", () => {
  const lv = (key: string, children?: StructureLevel[]): StructureLevel => ({
    key,
    scriptNames: { devanagari: key },
    children,
  });

  it("returns the parent of the leaf level for depth >= 2", () => {
    const kandaSargaShloka = [lv("Kanda", [lv("Sarga", [lv("Shloka")])])];
    expect(partLevelFor(kandaSargaShloka)).toBe(1);
    const adhyayaVerse = [lv("Adhyaya", [lv("Verse")])];
    expect(partLevelFor(adhyayaVerse)).toBe(0);
  });

  it("returns -1 for depth-1 texts", () => {
    expect(partLevelFor([lv("Mantra")])).toBe(-1);
  });
});

describe("partRanges (tiling part ranges)", () => {
  const parts = (refs: string[]): PartSectionInfo[] =>
    refs.map((r) => ({ file: `${r}.json`, first_ref: r }));

  it("tiles from first_refs and precomputes prefixes; last part open-ended", () => {
    const ranges = partRanges(parts(["3.1.1", "3.3.20", "3.4.15"]), 1);
    expect(ranges[0].endRef).toBe("3.3.20");
    expect(ranges[0].startPrefix).toEqual([3, 1]);
    expect(ranges[0].endPrefix).toEqual([3, 3]);
    expect(ranges[0].endFinalSegment).toBe(20);
    expect(ranges[2].endRef).toBeNull();
    expect(ranges[2].endPrefix).toBeNull();
  });

  it("throws on duplicate first_refs", () => {
    expect(() => partRanges(parts(["1.1.1", "1.1.1"]), 1)).toThrow();
  });

  it("does not throw on an adjacent kāṇḍa boundary or the gita 0.1→1.1 prefatory", () => {
    expect(() => partRanges(parts(["1.77.1", "2.1.1"]), 1)).not.toThrow();
    expect(() => partRanges(parts(["0.1", "1.1"]), 0)).not.toThrow();
  });

  it("throws on a non-adjacent top-level skip", () => {
    expect(() => partRanges(parts(["1.77.1", "3.1.1"]), 1)).toThrow();
  });

  it("throws on partLevel < 0", () => {
    expect(() => partRanges(parts(["1.1.1"]), -1)).toThrow();
  });
});

describe("partBacksPrefix (range intersects prefix)", () => {
  // Contiguous first_refs mirroring real BA part boundaries (each endRef is the
  // next part's first_ref; no top-level skips).
  const ranges = partRanges(
    [
      { file: "p1.json", first_ref: "3.1.1" },
      { file: "p2.json", first_ref: "3.3.20" }, // →3.4.15, last 3.4.14
      { file: "p3.json", first_ref: "3.4.15" },
      { file: "p4.json", first_ref: "3.5.13" }, // →4.1.1, last 3.6.3
      { file: "p5.json", first_ref: "4.1.1" }, // →5.1.1, last 4.6.3
      { file: "p6.json", first_ref: "5.1.1" },
      { file: "p7.json", first_ref: "5.6.1" },
      { file: "p8.json", first_ref: "6.1.1" },
      { file: "p9.json", first_ref: "7.1.1" }, // →8.1.1, last 7.15.1
      { file: "p10.json", first_ref: "8.1.1" }, // open-ended
    ],
    1,
  );
  const p = (i: number) => ranges[i];

  it("part2 backs its own and the next section (tail)", () => {
    expect(partBacksPrefix(p(1), [3, 3])).toBe(true); // 3.3
    expect(partBacksPrefix(p(1), [3, 4])).toBe(true); // 3.4 (ends 3.4.14)
    expect(partBacksPrefix(p(1), [3, 5])).toBe(false);
  });

  it("part4 ends before the next top-level (final segment 1 exclusion)", () => {
    // 3.5.13 → 4.1.1, last passage 3.6.3
    expect(partBacksPrefix(p(3), [3, 5])).toBe(true);
    expect(partBacksPrefix(p(3), [3, 6])).toBe(true);
    expect(partBacksPrefix(p(3), [4, 1])).toBe(false);
  });

  it("part5 spans many middle brāhmaṇas but excludes the next head", () => {
    // 4.1.1 → 5.1.1, last passage 4.6.3
    for (const b of [1, 2, 3, 4, 5, 6]) {
      expect(partBacksPrefix(p(4), [4, b])).toBe(true);
    }
    expect(partBacksPrefix(p(4), [5, 1])).toBe(false);
  });

  it("part9 (7.1.1) backs all 15 brāhmaṇas of adhyāya 7 but not adhyāya 8", () => {
    for (const b of [1, 15]) {
      expect(partBacksPrefix(p(8), [7, b])).toBe(true);
    }
    expect(partBacksPrefix(p(8), [8, 1])).toBe(false);
  });

  it("the last part is open-ended above", () => {
    expect(partBacksPrefix(p(9), [9, 1])).toBe(true);
  });
});

describe("buildPartHierarchy (section-scoped placeholder tree)", () => {
  const structure = [
    { key: "Kanda", scriptNames: { devanagari: "काण्डः" }, children: [
      { key: "Sarga", scriptNames: { devanagari: "सर्गः" }, children: [
        { key: "Shloka", scriptNames: { devanagari: "श्लोकः" } },
      ]},
    ]},
  ] as unknown as StructureLevel[];
  const balaParts = Array.from({ length: 75 }, (_, i) => ({
    file: `part${i + 1}.json`,
    first_ref: `1.${i + 1}.1`,
  }));
  const passage = (ref: string, partId: string): Passage => ({
    ref,
    passage_type: "main",
    content: { sanskrit: { devanagari: ref }, english_translation: "" },
    part_id: partId,
  });
  const shlokas = (n: number, partId: string): Passage[] =>
    Array.from({ length: n }, (_, i) => passage(`1.1.${i + 1}`, partId));

  it("places loaded passages at the sarga leaf with its partId", () => {
    const tree = buildPartHierarchy(
      structure,
      balaParts,
      shlokas(3, "1.1.1"),
      new Set(["1.1.1"]),
    );
    expect(tree.length).toBe(1); // one kāṇḍa
    const sarga = tree[0].children![0];
    expect(sarga.level).toBe("सर्गः 1");
    expect(sarga.partIds).toEqual(["1.1.1"]);
    expect(sarga.children!.length).toBe(3);
  });

  it("regression: unloaded sargas are separate placeholder leaves, one partId each", () => {
    const tree = buildPartHierarchy(structure, balaParts, [], new Set());
    const sargas = tree[0].children!;
    expect(sargas.length).toBe(75);
    for (const s of sargas) {
      expect(s.partIds!.length).toBe(1);
      expect(s.children!.length).toBe(0);
    }
  });

  it("groups a multi-section part's head and lets middle sections appear post-load", () => {
    // part5 spans 4.1–4.6; head-only enumeration shows only 4.1 until loaded.
    const baStructure = [
      { key: "Adhyaya", scriptNames: { devanagari: "अध्यायः" }, children: [
        { key: "Brahmana", scriptNames: { devanagari: "ब्राह्मणम्" }, children: [
          { key: "Mantra", scriptNames: { devanagari: "मन्त्रः" } },
        ]},
      ]},
    ] as unknown as StructureLevel[];
    const baParts = [
      { file: "p1.json", first_ref: "4.1.1" },
      { file: "p2.json", first_ref: "5.1.1" },
    ];
    const unloadedTree = buildPartHierarchy(baStructure, baParts, [], new Set());
    // two top-level adhyāya containers, each with a single head brāhmaṇa
    expect(unloadedTree.map((a) => a.level)).toEqual(["अध्यायः 4", "अध्यायः 5"]);
    expect(unloadedTree[0].children!.map((b) => b.level)).toEqual(["ब्राह्मणम् 1"]);
    expect(unloadedTree[0].children![0].partIds).toEqual(["4.1.1"]);
    expect(unloadedTree[1].children![0].partIds).toEqual(["5.1.1"]);

    const loadedTree = buildPartHierarchy(
      baStructure,
      baParts,
      [passage("4.1.1", "4.1.1"), passage("4.2.1", "4.1.1"), passage("4.3.1", "4.1.1")],
      new Set(["4.1.1"]),
    );
    // middle brāhmaṇas appear once their part is loaded (via passage prefixes)
    expect(loadedTree[0].children!.map((b) => b.level)).toEqual([
      "ब्राह्मणम् 1", "ब्राह्मणम् 2", "ब्राह्मणम् 3",
    ]);
    expect(loadedTree[0].children![1].partIds).toEqual(["4.1.1"]);
    expect(loadedTree[0].children![2].partIds).toEqual(["4.1.1"]);
  });

  it("supports a partially-loaded section carrying its unloaded tail part", () => {
    // BA brāhmaṇa 3.3: part1 (3.1.1) loaded, part2 (3.3.20) unloaded tail.
    const baStructure = [
      { key: "Adhyaya", scriptNames: { devanagari: "अध्यायः" }, children: [
        { key: "Brahmana", scriptNames: { devanagari: "ब्राह्मणम्" }, children: [
          { key: "Mantra", scriptNames: { devanagari: "मन्त्रः" } },
        ]},
      ]},
    ] as unknown as StructureLevel[];
    const parts = [
      { file: "p1.json", first_ref: "3.1.1" },
      { file: "p2.json", first_ref: "3.3.20" },
      { file: "p3.json", first_ref: "3.4.15" },
    ];
    const loaded = [passage("3.1.1", "3.1.1"), passage("3.3.19", "3.1.1")];
    const tree = buildPartHierarchy(
      baStructure,
      parts,
      loaded,
      new Set(["3.1.1"]),
    );
    // the adhyāya 3 container holds the brāhmaṇa groups
    expect(tree.map((a) => a.level)).toEqual(["अध्यायः 3"]);
    const brahmana3 = tree[0].children!.find((b) => b.level === "ब्राह्मणम् 3")!;
    // the loaded brāhmaṇa 3.3 carries both its own part and the unloaded tail
    expect(brahmana3.partIds!.sort()).toEqual(["3.1.1", "3.3.20"]);
    expect(brahmana3.children!.length).toBe(1); // the loaded mantra 3.3.19
  });
});

describe("sectionPartsToLoad (section-based eager part loading)", () => {
  // The regression fixture is deliberately adversarial: every part shares the
  // same kāṇḍa `id` ("1") because the Rāmāyaṇa's bala parts are all in kāṇḍa 1.
  // Section identity MUST be derived from `first_ref` (the sarga), never from
  // `id`, or selecting any verse would eager-load the whole kāṇḍa.
  const balaParts: PartSectionInfo[] = Array.from({ length: 75 }, (_, i) => ({
    file: `part${i + 1}.json`,
    first_ref: `1.${i + 1}.1`,
  }));

  const loaded = (...refs: string[]) => new Set(refs);

  it("eager-loads only the selected sarga, not the whole kāṇḍa (regression)", () => {
    const toLoad = sectionPartsToLoad(balaParts, "1.1.2", loaded(), 1);
    expect(toLoad).toEqual(["1.1.1"]);
  });

  it("matches a different sarga within the same kāṇḍa", () => {
    const toLoad = sectionPartsToLoad(balaParts, "1.18.5", loaded(), 1);
    expect(toLoad).toEqual(["1.18.1"]);
  });

  it("skips parts that are already loaded", () => {
    const toLoad = sectionPartsToLoad(balaParts, "1.2.3", loaded("1.2.1"), 1);
    expect(toLoad).toEqual([]);
  });

  it("returns an empty array when no part opens the section", () => {
    // kāṇḍa 0 (before the first part's kāṇḍa 1) is backed by no part.
    const toLoad = sectionPartsToLoad(balaParts, "0.5.1", loaded(), 1);
    expect(toLoad).toEqual([]);
  });

  it("supports chapter→verse texts where the section is the top-level segment", () => {
    const gitaParts: PartSectionInfo[] = Array.from({ length: 18 }, (_, i) => ({
      file: `part${i + 1}.json`,
      first_ref: `${i + 1}.1`,
    }));
    expect(sectionPartsToLoad(gitaParts, "2.14", loaded(), 0)).toEqual(["2.1"]);
    expect(sectionPartsToLoad(gitaParts, "2.14", loaded("2.1"), 0)).toEqual([]);
  });

  it("returns [] for depth-1 (partLevel < 0)", () => {
    expect(sectionPartsToLoad([{ file: "p.json", first_ref: "1" }], "1", loaded(), -1)).toEqual([]);
  });

  it("BA misaligned: a tail part backs the section it ends in", () => {
    const baParts = [
      { file: "p1.json", first_ref: "3.1.1" },
      { file: "p2.json", first_ref: "3.3.20" },
      { file: "p3.json", first_ref: "3.4.15" },
      { file: "p4.json", first_ref: "3.5.13" },
    ];
    // 3.4.1 and 3.4.15 are both in brāhmaṇa 3.4 → part2 (tail) + part3 (head)
    expect(sectionPartsToLoad(baParts, "3.4.1", loaded(), 1)).toEqual(["3.3.20", "3.4.15"]);
    expect(sectionPartsToLoad(baParts, "3.4.15", loaded(), 1)).toEqual(["3.3.20", "3.4.15"]);
  });

  it("BA long-span: a middle brāhmaṇa resolves to its spanning part", () => {
    const baParts = [
      { file: "p4.json", first_ref: "4.1.1" },
      { file: "p5.json", first_ref: "5.1.1" },
    ];
    expect(sectionPartsToLoad(baParts, "4.3.1", loaded(), 1)).toEqual(["4.1.1"]);
  });

  it("BA exclusive boundary: part5 does not back brāhmaṇa 5.1", () => {
    const baParts = [
      { file: "p4.json", first_ref: "4.1.1" },
      { file: "p5.json", first_ref: "5.1.1" },
    ];
    expect(sectionPartsToLoad(baParts, "5.1.1", loaded(), 1)).toEqual(["5.1.1"]);
  });
});

describe("presentationFor — total, pinned mapping of passage kind", () => {
  it.each(["Para", "Gadya"])("classifies %s as prose", (kind) => {
    expect(presentationFor(kind)).toBe("prose");
  });

  it.each(["Shloka", "Mantra", "Verse", "Sutra"])("classifies %s as verse", (kind) => {
    expect(presentationFor(kind)).toBe("verse");
  });

  it("throws on an unknown kind — never a silent verse default", () => {
    expect(() => presentationFor("Gadya2")).toThrow(/Unknown passage kind/);
    expect(() => presentationFor("")).toThrow(/Unknown passage kind/);
    expect(() => presentationFor("para")).toThrow(/Unknown passage kind/);
  });

  it("KNOWN_PASSAGE_KINDS covers every classified kind", () => {
    expect(KNOWN_PASSAGE_KINDS).toEqual(
      expect.arrayContaining(["Para", "Gadya", "Shloka", "Mantra", "Verse", "Sutra"]),
    );
    for (const kind of KNOWN_PASSAGE_KINDS) {
      expect(() => presentationFor(kind)).not.toThrow();
    }
  });
});

describe("deriveEditionKind — load-boundary fallback for legacy files", () => {
  it("classifies a commentary-bearing edition as commentarial", () => {
    expect(deriveEditionKind([{ commentary_id: "bhashya" }])).toBe("commentarial");
  });

  it("classifies a commentary-less edition as mula-only", () => {
    expect(deriveEditionKind([])).toBe("mula-only");
  });

  it("is total over any array", () => {
    expect(deriveEditionKind(undefined)).toBe("mula-only");
    expect(deriveEditionKind([])).toBe("mula-only");
  });
});
