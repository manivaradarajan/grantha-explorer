import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { getPassagePreview } from "@/lib/references";
import { getAvailableGranthas, type Reference } from "@/lib/data";
import { findQuotedSpan, buildSourceWindow } from "@/lib/quotedMatch";

/**
 * Real-corpus integration test for `findQuotedSpan`.
 *
 * Tests the fuzzy quote-highlight against the ACTUAL committed library under
 * `public/data/library/`, exercising the real production resolution path
 * (`getPassagePreview` → `loadGrantha` → `resolveReferenceTarget` →
 * `getPassageByRef`) via a fetch shim that reads real bytes off disk — no
 * fixtures, no mocked data.
 *
 * Sampling is seeded and the pool deterministically sorted, so a given run
 * reproduces the exact same sample every time. A dedicated Desika stratum
 * (references from the vedāntadeśika Īśāvāsya-bhāṣya) is forced into the
 * sample, per the feature's originating corpus.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const LIB_DIR = path.join(ROOT, "public", "data", "library");

/** The fetch shim: maps `/data/<rest>` to `public/data/<rest>` on disk. */
function readJsonAsset(url: string): Promise<Response> {
  const pathname = new URL(url, "http://localhost").pathname;
  if (!pathname.startsWith("/data/")) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  const abs = path.join(ROOT, "public", "data", pathname.replace(/^\/data\//, ""));
  if (!fs.existsSync(abs)) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  const text = fs.readFileSync(abs, "utf-8");
  return Promise.resolve(new Response(text, { status: 200 }));
}

/** A single reference with its source context, collected from the corpus. */
interface CorpusRef {
  sourcePath: string;
  sourceGranthaId: string;
  sourcePassageRef: string;
  sourceText: string;
  reference: Reference;
}

/** Deterministically sorted pool of every on-disk, resolvable reference. */
function collectCorpusRefs(): CorpusRef[] {
  const out: CorpusRef[] = [];
  const walk = (data: unknown, sourcePath: string): void => {
    if (Array.isArray(data)) {
      for (const item of data) {
        walk(item, sourcePath);
      }
      return;
    }
    if (data === null || typeof data !== "object") {
      return;
    }
    const obj = data as Record<string, unknown>;
    if (
      obj.references !== undefined &&
      obj.content !== undefined &&
      typeof obj.ref === "string"
    ) {
      const content = obj.content as { sanskrit?: { devanagari?: string } };
      const text = content.sanskrit?.devanagari;
      const sourceGranthaId = (obj.grantha_id as string) ?? path.basename(path.dirname(sourcePath));
      if (typeof text === "string" && Array.isArray(obj.references)) {
        for (const ref of obj.references as Reference[]) {
          if (
            typeof ref.grantha_id === "string" &&
            ref.locator != null &&
            typeof ref.start === "number"
          ) {
            out.push({
              sourcePath,
              sourceGranthaId,
              sourcePassageRef: obj.ref,
              sourceText: text,
              reference: ref,
            });
          }
        }
      }
    }
    for (const value of Object.values(obj)) {
      walk(value, sourcePath);
    }
  };
  for (const file of fs.readdirSync(LIB_DIR, { recursive: true })) {
    const rel = file as string;
    if (!rel.endsWith(".json")) {
      continue;
    }
    const abs = path.join(LIB_DIR, rel);
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(abs, "utf-8"));
    } catch {
      continue;
    }
    walk(data, abs);
  }
  out.sort((a, b) => {
    const p = a.sourcePath.localeCompare(b.sourcePath);
    if (p !== 0) return p;
    const r = a.sourcePassageRef.localeCompare(b.sourcePassageRef);
    if (r !== 0) return r;
    return a.reference.start - b.reference.start;
  });
  return out;
}

/** Deterministic PRNG (mulberry32) for reproducible sampling. */
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(pool: T[], count: number, rand: () => number): T[] {
  const remaining = pool.slice();
  const out: T[] = [];
  while (out.length < count && remaining.length > 0) {
    out.push(remaining.splice(Math.floor(rand() * remaining.length), 1)[0]);
  }
  return out;
}

/** Independent normalization (plain string) — deliberately NOT the lib's. */
function normForLcs(text: string): string {
  const nfc = text.normalize("NFC").replace(/[।॥*_.'‘’"]/g, "");
  return nfc.replace(/\s+/g, " ").trim();
}

/** Independent LCS length for the self-consistency property check. */
function lcsLength(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Resolve one ref through the real pipeline; returns the preview text. */
async function previewFor(c: CorpusRef, availableIds: string[]): Promise<string | null> {
  return getPassagePreview(c.reference.grantha_id!, c.reference, availableIds);
}

interface ResolvedSample {
  c: CorpusRef;
  window: string;
  passage: string | null;
  span: { start: number; end: number } | null;
}

describe("findQuotedSpan against the real corpus", () => {
  let refs: CorpusRef[];
  let desikaRefs: CorpusRef[];
  let availableIds: string[];

  beforeAll(async () => {
    globalThis.fetch = readJsonAsset as unknown as typeof fetch;
    refs = collectCorpusRefs();
    desikaRefs = refs.filter((c) => c.sourcePath.includes("isavasya-upanishad-vedantadesika"));
    availableIds = (await getAvailableGranthas()).map((g) => g.id);
  });

  afterAll(() => {
    globalThis.fetch = fetch;
  });

  it("finds a non-empty pool with a Desika stratum", () => {
    expect(refs.length).toBeGreaterThan(100);
    expect(desikaRefs.length).toBeGreaterThan(20);
  });

  it("returns only well-formed spans that are independently self-consistent", async () => {
    const rand = mulberry32(20260822);
    const samples = [
      ...sample(refs, 40, rand),
      ...sample(desikaRefs, 20, rand),
    ];

    const resolved: ResolvedSample[] = [];
    for (const c of samples) {
      const window = buildSourceWindow(c.sourceText, c.reference.start).text;
      const passage = await previewFor(c, availableIds);
      const isStatus =
        passage === null ||
        passage === "Reference not available in this library." ||
        passage === "Error fetching preview." ||
        passage === "no preview";
      resolved.push({
        c,
        window,
        passage: isStatus ? null : passage,
        span: null,
      });
    }
    for (const r of resolved) {
      if (r.passage === null) {
        continue;
      }
      r.span = findQuotedSpan(r.window, r.passage);
      if (r.span === null) {
        continue;
      }
      // Well-formed span in the passage's original coordinates.
      expect(r.span.start).toBeGreaterThanOrEqual(0);
      expect(r.span.start).toBeLessThan(r.span.end);
      expect(r.span.end).toBeLessThanOrEqual(r.passage.length);

      // Independent self-consistency: the returned span must largely be
      // contained in the window's content (checked with a plain LCS, not the
      // lib's aligner — so the test never validates the code against itself).
      const spanNorm = normForLcs(r.passage.slice(r.span.start, r.span.end));
      const windowNorm = normForLcs(r.window);
      const sim = spanNorm.length === 0 ? 0 : lcsLength(spanNorm, windowNorm) / spanNorm.length;
      expect(sim).toBeGreaterThanOrEqual(0.7);
    }
    expect(resolved.filter((r) => r.passage !== null).length).toBeGreaterThan(0);
  });

  it("is deterministic across two runs of the same seed", async () => {
    const run = async (): Promise<string[]> => {
      const rand = mulberry32(20260822);
      const samples = [
        ...sample(refs, 40, rand),
        ...sample(desikaRefs, 20, rand),
      ];
      const out: string[] = [];
      for (const c of samples) {
        const window = buildSourceWindow(c.sourceText, c.reference.start).text;
        const passage = await previewFor(c, availableIds);
        const isStatus =
          passage === null ||
          passage === "Reference not available in this library." ||
          passage === "Error fetching preview." ||
          passage === "no preview";
        const span = isStatus ? null : findQuotedSpan(window, passage as string);
        out.push(
          `${c.sourcePath}|${c.sourcePassageRef}|${c.reference.start}|${span?.start ?? "-"}|${span?.end ?? "-"}`,
        );
      }
      return out;
    };
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);
  });

  it("highlights a substantial fraction of resolvable Desika references", async () => {
    // Corpus property (measured 2026-08-22 with MIN_MATCH_CHARS=10,
    // MIN_SIMILARITY=0.7): 37 of 47 resolvable Desika refs carry a quote that
    // fuzzy-matches. This guards the whole feature against silent algorithm
    // regression — if the count drops materially, the constants/aligner
    // drifted, not the corpus.
    const MIN_DESIKA_MATCHES = 30;
    let matches = 0;
    let resolvable = 0;
    for (const c of desikaRefs) {
      const window = buildSourceWindow(c.sourceText, c.reference.start).text;
      const passage = await previewFor(c, availableIds);
      const isStatus =
        passage === null ||
        passage === "Reference not available in this library." ||
        passage === "Error fetching preview." ||
        passage === "no preview";
      if (isStatus) {
        continue;
      }
      resolvable++;
      if (findQuotedSpan(window, passage as string) !== null) {
        matches++;
      }
    }
    // Report the live distribution; the assertion is on the floor only.
    console.log(
      `[quotedMatch.corpus] Desika: ${matches} matches / ${resolvable} resolvable (floor ${MIN_DESIKA_MATCHES})`,
    );
    expect(matches).toBeGreaterThanOrEqual(MIN_DESIKA_MATCHES);
  });
});
