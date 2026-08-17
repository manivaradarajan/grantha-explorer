import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  Commentary,
  commentaryPassageForRef,
  nestSubcommentaries,
} from "@/lib/data";

// Resolve the repo root (this file lives at tests/integration/).
const ROOT = path.resolve(__dirname, "..", "..");
const LIB_DIR = path.join(
  ROOT,
  "public/data/library/bhagavad-gita/bhagavad-gita",
);

/**
 * Load every part file and merge commentaries across parts the same way the
 * runtime loader does: group by commentary_id, concatenate passages, then nest
 * subcommentaries under their parent. Returns the nested top-level list plus
 * every verse ref present in the grantha (prefatory + main passages).
 */
function loadBhagavadGita(): { topLevel: Commentary[]; verseRefs: string[] } {
  const merged: Record<string, Commentary> = {};
  const verseRefs: string[] = [];
  const partFiles = fs
    .readdirSync(LIB_DIR)
    .filter((f) => /^part\d+\.json$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)![0]);
      const nb = Number(b.match(/\d+/)![0]);
      return na - nb;
    });
  expect(partFiles).toHaveLength(19); // guard against a silently shrinking fixture set
  for (const file of partFiles) {
    const part = JSON.parse(fs.readFileSync(path.join(LIB_DIR, file), "utf-8")) as {
      passages?: { ref: string }[];
      prefatory_material?: { ref: string }[];
      commentary?: Commentary;
      commentaries?: Commentary[];
    };
    const cs = part.commentaries || (part.commentary ? [part.commentary] : []);
    for (const c of cs) {
      if (!c) continue;
      merged[c.commentary_id] = merged[c.commentary_id] || { ...c, passages: [] };
      merged[c.commentary_id].passages.push(...(c.passages ?? []));
    }
    for (const p of part.passages ?? []) verseRefs.push(p.ref);
    for (const p of part.prefatory_material ?? []) verseRefs.push(p.ref);
  }
  return { topLevel: nestSubcommentaries(Object.values(merged)), verseRefs };
}

function tikaOf(topLevel: Commentary[]): Commentary {
  const parent = topLevel.find((c) => c.commentary_id === "gita-bhashyam");
  const tika = parent?.subcommentaries?.find(
    (s) => s.commentary_id === "tatparya-chandrika",
  );
  if (!tika) throw new Error("tatparya-chandrika missing from gita-bhashyam");
  return tika;
}

describe("bhagavad-gita real-data subcommentary contract", () => {
  const { topLevel, verseRefs } = loadBhagavadGita();

  it("loads every verse of the Gita (prefatory + all 18 adhyayas)", () => {
    // 0.1 preface + 1.1..1.47 + 2.1..2.72 + ... + 18.1..18.78 = 701 verses
    expect(verseRefs).toContain("0.1");
    expect(verseRefs).toContain("1.1");
    expect(verseRefs).toContain("18.78");
    expect(verseRefs).toHaveLength(701);
  });

  it("nests tatparya-chandrika under gita-bhashyam", () => {
    expect(topLevel.map((c) => c.commentary_id)).toEqual(["gita-bhashyam"]);
    const parent = topLevel[0];
    const subs = parent.subcommentaries ?? [];
    expect(subs.map((s) => s.commentary_id)).toEqual(["tatparya-chandrika"]);
  });

  it("gives every verse a commentary passage in the subcommentary", () => {
    const tika = tikaOf(topLevel);
    // 619 gloss passages; many cover ranges (e.g. 1.26-39), so they resolve all 701 verses.
    expect(tika.passages.length).toBe(619);
    const missing = verseRefs.filter(
      (ref) => commentaryPassageForRef(tika.passages, ref) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("resolves every verse to its subcommentary gloss quickly (perf canary)", () => {
    const tika = tikaOf(topLevel);
    const start = performance.now();
    for (const ref of verseRefs) {
      commentaryPassageForRef(tika.passages, ref);
    }
    const elapsedMs = performance.now() - start;
    // Canary, not a benchmark: catches accidental O(n^2) regressions (e.g. a
    // naive per-verse scan over every passage). Generous bound for slow CI.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
