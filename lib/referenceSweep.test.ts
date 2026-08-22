import { describe, it, expect } from "vitest";
import { checkSweepReadiness } from "./referenceSweep";
import type { CommittedReference } from "./referenceSweep";

const SCHOOL = new Set(["brahma-sutra", "isavasya-upanishad"]);

const ref = (over: Partial<CommittedReference> = {}): CommittedReference => ({
  targetGranthaId: "vishnu-purana",
  editionId: undefined,
  ...over,
});

describe("checkSweepReadiness", () => {
  it("reports unswept refs but does not fail while the gate is off", () => {
    const refs = [
      ref({ targetGranthaId: "brahma-sutra" }), // school-flavored, no edition
      ref({ targetGranthaId: "isavasya-upanishad", editionId: "isavasya-upanishad-sankara-bhashya" }),
    ];
    const result = checkSweepReadiness(false, SCHOOL, refs);
    expect(result.unswept).toHaveLength(1);
    expect(result.unswept[0].targetGranthaId).toBe("brahma-sutra");
    expect(result.errors).toEqual([]);
    expect(result.report.join("\n")).toContain("1 lack edition_id");
  });

  it("fails when the gate is on and a school-flavored ref lacks edition_id", () => {
    const refs = [ref({ targetGranthaId: "isavasya-upanishad" })];
    const result = checkSweepReadiness(true, SCHOOL, refs);
    expect(result.unswept).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("edition-aware gate is enabled");
    expect(result.errors[0]).toContain("1 committed reference(s)");
  });

  it("passes when every school-flavored ref carries an edition_id", () => {
    const refs = [
      ref({ targetGranthaId: "brahma-sutra", editionId: "brahma-sutra-sribhashya" }),
      ref({ targetGranthaId: "isavasya-upanishad", editionId: "isavasya-upanishad-vedantadesika" }),
    ];
    const result = checkSweepReadiness(true, SCHOOL, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("never flags mula / school-neutral targets for a missing edition", () => {
    const refs = [ref({ targetGranthaId: "vishnu-purana" })]; // no edition_id, mula default
    const result = checkSweepReadiness(true, SCHOOL, refs); // SCHOOL excludes vishnu-purana
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("ignores undefined abbreviations (targetGranthaId null)", () => {
    const refs = [ref({ targetGranthaId: null })];
    const result = checkSweepReadiness(true, SCHOOL, refs);
    expect(result.unswept).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
