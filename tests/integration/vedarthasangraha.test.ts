import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  Grantha,
  getAllPassagesForNavigation,
  getCuratedSidebarSections,
  getCuratedActiveSubsection,
} from "@/lib/data";

const ROOT = path.resolve(__dirname, "..", "..");
const ENVELOPE = path.join(
  ROOT,
  "public/data/library/vedarthasangraha/envelope.json",
);
const PART1 = path.join(
  ROOT,
  "public/data/library/vedarthasangraha/part1.json",
);

function loadVedarthasangraha(): Grantha {
  const envelope = JSON.parse(fs.readFileSync(ENVELOPE, "utf-8"));
  const part = JSON.parse(fs.readFileSync(PART1, "utf-8"));
  return {
    ...envelope,
    ...part,
    grantha_id: "vedarthasangraha",
    commentaries: [],
    parts: envelope.parts,
  } as Grantha;
}

describe("vedarthasangraha curated sidebar contract", () => {
  const grantha = loadVedarthasangraha();
  const navPassages = getAllPassagesForNavigation(grantha);

  it("builds the expected number of curated sections", () => {
    const sections = getCuratedSidebarSections(grantha);
    expect(sections).not.toBeNull();
    // 22 = the 16 Raghavachar sections with their nested subsections flattened
    // into the sidebar's section list (s1, s5a, s5b, s6, s7, s8a-f, s9, s10,
    // s11, s12, s13, s14, s16, etc. — each subsection-bearing section is one
    // entry). Bump deliberately if the curated data changes.
    expect(sections!.length).toBe(22);
  });

  it("partitions every navigation passage into exactly one bucket", () => {
    const sections = getCuratedSidebarSections(grantha)!;
    const seen = new Set<string>();
    for (const section of sections) {
      for (const p of section.passages) {
        expect(seen.has(p.ref), `duplicate direct ${p.ref}`).toBe(false);
        seen.add(p.ref);
      }
      for (const sub of section.subsections ?? []) {
        for (const p of sub.passages) {
          expect(seen.has(p.ref), `duplicate sub ${p.ref}`).toBe(false);
          seen.add(p.ref);
        }
      }
    }
    expect(seen.size).toBe(navPassages.length);
    for (const p of navPassages) {
      expect(seen.has(p.ref), `uncovered ${p.ref}`).toBe(true);
    }
  });

  it("resolves the active subsection for a ref inside one", () => {
    const sections = getCuratedSidebarSections(grantha)!;
    // s5a "निर्विशेषवादपरीक्षा — श्रुत्या" spans 6..44; its first subsection is
    // 6..17 (तत्त्वमस्यर्थविमर्शः).
    const s5a = sections.find(
      (s) => s.boundary.path[0] === "निर्विशेषवादपरीक्षा — श्रुत्या",
    );
    expect(s5a).toBeDefined();
    expect(getCuratedActiveSubsection(s5a!, "10")?.label).toBe("तत्त्वमस्यर्थविमर्शः");
  });

  it("returns undefined for a direct (non-subsection) ref", () => {
    const sections = getCuratedSidebarSections(grantha)!;
    // s2 "निर्विशेषवादसङ्ग्रहः" spans only 3..3 with no subsections.
    const s2 = sections.find(
      (s) => s.boundary.path[0] === "निर्विशेषवादसङ्ग्रहः",
    );
    expect(s2).toBeDefined();
    expect(getCuratedActiveSubsection(s2!, "3")).toBeUndefined();
  });
});
