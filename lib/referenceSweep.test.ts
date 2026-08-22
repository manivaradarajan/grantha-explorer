import { describe, it, expect } from "vitest";
import { checkSweepReadiness } from "./referenceSweep";
import type { CommittedReference } from "./referenceSweep";

const ref = (over: Partial<CommittedReference> = {}): CommittedReference => ({
  targetGranthaId: "brihadaranyaka-upanishad",
  editionId: undefined,
  sourceSchool: "ramanuja",
  targetDefaultSchool: "ramanuja",
  ...over,
});

describe("checkSweepReadiness", () => {
  it("flags a same-school-target ref that lacks edition_id", () => {
    // ramanuja text citing a ramanuja-default grantha → should be stamped.
    const refs = [
      ref({ targetGranthaId: "brihadaranyaka-upanishad" }),
    ];
    const result = checkSweepReadiness(false, refs);
    expect(result.unswept).toHaveLength(1);
    expect(result.unswept[0].targetGranthaId).toBe("brihadaranyaka-upanishad");
    expect(result.errors).toEqual([]);
    expect(result.report.join("\n")).toContain("1 same-school-targeted");
  });

  it("fails when the gate is on and a same-school ref lacks edition_id", () => {
    const refs = [ref({ targetGranthaId: "isavasya-upanishad" })];
    const result = checkSweepReadiness(true, refs);
    expect(result.unswept).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("edition-aware gate is enabled");
    expect(result.errors[0]).toContain("1 committed reference(s)");
  });

  it("passes when every same-school ref carries an edition_id", () => {
    const refs = [
      ref({ targetGranthaId: "brihadaranyaka-upanishad", editionId: "brihadaranyaka-upanishad" }),
      ref({ targetGranthaId: "isavasya-upanishad", editionId: "isavasya-upanishad-vedantadesika" }),
    ];
    const result = checkSweepReadiness(true, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("never flags a cross-school deferral (GR#7 legitimate)", () => {
    // sankara text citing a ramanuja-default grantha with no sankara edition
    // → edition-less by design, the runtime defers.
    const refs = [
      ref({ sourceSchool: "sankara", targetDefaultSchool: "ramanuja", targetGranthaId: "mandukya-karika" }),
    ];
    const result = checkSweepReadiness(true, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("never flags mula / school-neutral targets for a missing edition", () => {
    const refs = [
      ref({ targetGranthaId: "vishnu-purana", targetDefaultSchool: "" }),
      ref({ sourceSchool: "", targetDefaultSchool: "ramanuja" }), // neutral source
    ];
    const result = checkSweepReadiness(true, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("ignores undefined abbreviations (targetGranthaId null)", () => {
    const refs = [ref({ targetGranthaId: null })];
    const result = checkSweepReadiness(true, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
