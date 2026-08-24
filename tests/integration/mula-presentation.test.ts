import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { KNOWN_PASSAGE_KINDS, presentationFor } from "@/lib/data";

/**
 * On-disk artifact pins for the per-block mula presentation design (IDEA.md).
 *
 * The presentation of a mula passage is a total, pinned function of the
 * passage's declared `kind`. For that to hold, the committed
 * `public/data/library` JSON must carry, for every edition:
 *
 *  - `passage.kind` (the markdown heading word) on every `passage_type: "main"`
 *    passage, drawn from the pinned classification; absent on prefatory/
 *    concluding passages; and
 *  - `edition_kind` (`"mula-only" | "commentarial"`) on the edition envelope
 *    (multipart) or grantha file (flat), consistent with commentary presence:
 *    a commentarial edition carries a commentary in every part, a mula-only
 *    edition in none.
 *
 * These are data-invariant checks — a failure means the committed artifact
 * drifted from the model, not that the code is wrong. They mirror the
 * `validate:data` checks (validate-data.ts) but live in the test suite so they
 * run in CI on their own.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const LIBRARY = path.join(ROOT, "public", "data", "library");

interface JsonObject {
  [k: string]: unknown;
}

interface Passage {
  ref: string;
  passage_type: string;
  kind?: string;
  content?: JsonObject;
}

interface EditionInfo {
  editionId: string;
  flat: boolean;
  editionKind?: string;
  parts: { file: string; passages: Passage[] }[];
  /** true if any part carries a commentary/commentaries. */
  hasCommentary: boolean;
}

function hasCommentary(obj: JsonObject): boolean {
  const commentary = obj["commentary"] as JsonObject | undefined;
  const commentaries = obj["commentaries"];
  if (commentary && Object.keys(commentary).length > 0) return true;
  return Array.isArray(commentaries) && commentaries.length > 0;
}

function collectEditions(): EditionInfo[] {
  const editions: EditionInfo[] = [];

  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      const data = JSON.parse(fs.readFileSync(full, "utf-8")) as JsonObject;
      if (data["kind"] === "grantha") {
        // Flat single-file edition.
        editions.push({
          editionId: (data["edition_id"] as string) ?? (data["grantha_id"] as string),
          flat: true,
          editionKind: data["edition_kind"] as string | undefined,
          parts: [{ file: path.basename(full), passages: passagesOf(data) }],
          hasCommentary: hasCommentary(data),
        });
      } else if (data["kind"] === "edition-sub-envelope") {
        // Multipart edition: envelope.json + part files in the same directory.
        const dirOf = path.dirname(full);
        const editionId = (data["edition_id"] as string) ?? "";
        const partsArr = (data["parts"] as { file: string }[]) ?? [];
        const parts: EditionInfo["parts"] = [];
        for (const p of partsArr) {
          const partPath = path.join(dirOf, p.file);
          if (!fs.existsSync(partPath)) continue;
          const part = JSON.parse(fs.readFileSync(partPath, "utf-8")) as JsonObject;
          parts.push({ file: p.file, passages: passagesOf(part) });
        }
        editions.push({
          editionId,
          flat: false,
          editionKind: data["edition_kind"] as string | undefined,
          parts,
          hasCommentary: parts.some((p) => hasCommentary(JSON.parse(fs.readFileSync(path.join(dirOf, p.file), "utf-8")) as JsonObject)),
        });
      }
    }
  };

  visit(LIBRARY);
  return editions;
}

function passagesOf(obj: JsonObject): Passage[] {
  const lists = ["passages", "prefatory_material", "concluding_material"];
  const out: Passage[] = [];
  for (const key of lists) {
    const arr = obj[key];
    if (Array.isArray(arr)) {
      out.push(...(arr as Passage[]));
    }
  }
  return out;
}

describe("on-disk mula presentation invariants", () => {
  const editions = collectEditions();

  it("has at least the two known mula-only editions present", () => {
    const ids = editions.map((e) => e.editionId);
    expect(ids).toContain("vedarthasangraha");
    expect(ids).toContain("vishnu-purana");
  });

  it("every main passage carries a classified kind; framing passages carry none", () => {
    let mainCount = 0;
    let framingCount = 0;
    for (const edition of editions) {
      for (const part of edition.parts) {
        for (const passage of part.passages) {
          if (passage.passage_type === "main") {
            mainCount += 1;
            expect(
              KNOWN_PASSAGE_KINDS.includes(passage.kind as string),
              `main passage ${edition.editionId}:${part.file}:${passage.ref} has unclassified kind ${JSON.stringify(passage.kind)}`,
            ).toBe(true);
            // The classification is total over known kinds — no throw.
            expect(() => presentationFor(passage.kind as string)).not.toThrow();
          } else {
            framingCount += 1;
            expect(passage.kind, `framing passage ${edition.editionId}:${passage.ref} must not carry kind`).toBeUndefined();
          }
        }
      }
    }
    expect(mainCount).toBeGreaterThan(1000);
    expect(framingCount).toBeGreaterThan(0);
  });

  it("every edition carries an edition_kind consistent with commentary presence", () => {
    for (const edition of editions) {
      expect(edition.editionKind, `edition ${edition.editionId} missing edition_kind`).toBeDefined();
      expect(["mula-only", "commentarial"]).toContain(edition.editionKind);
      const expected = edition.hasCommentary ? "commentarial" : "mula-only";
      expect(edition.editionKind, `edition ${edition.editionId} edition_kind mismatch`).toBe(expected);
    }
  });

  it("a commentarial edition carries a commentary in at least one part; a mula-only edition in none", () => {
    for (const edition of editions) {
      const editionRoot = edition.flat ? LIBRARY : findEditionRoot(edition.editionId);
      const perPart: boolean[] = edition.flat
        ? [edition.hasCommentary]
        : edition.parts.map((part) => {
            const partData = JSON.parse(fs.readFileSync(path.join(editionRoot, part.file), "utf-8")) as JsonObject;
            return hasCommentary(partData);
          });
      if (edition.editionKind === "commentarial") {
        // A commentarial edition may have a commentary-free part (e.g. a
        // sarga whose whole text is one un-glossed passage), but must have a
        // commentary somewhere — a uniform drop now fails against the stamp.
        expect(perPart.some(Boolean), `commentarial edition ${edition.editionId} must have commentary in at least one part`).toBe(true);
      } else {
        for (const has of perPart) {
          expect(has, `mula-only edition ${edition.editionId} must have no commentary in any part`).toBe(false);
        }
      }
    }
  });

  it("vedarthasangraha's main passages are all Para (prose presentation)", () => {
    const v = editions.find((e) => e.editionId === "vedarthasangraha")!;
    const mains = v.parts[0].passages.filter((p) => p.passage_type === "main");
    expect(mains.length).toBeGreaterThan(100);
    for (const p of mains) {
      expect(p.kind).toBe("Para");
      expect(presentationFor(p.kind!)).toBe("prose");
    }
  });

  it("vishnu-purana's main passages are all Shloka (verse presentation)", () => {
    const v = editions.find((e) => e.editionId === "vishnu-purana")!;
    const mains = v.parts.flatMap((p) => p.passages.filter((x) => x.passage_type === "main"));
    expect(mains.length).toBeGreaterThan(1000);
    for (const p of mains) {
      expect(p.kind).toBe("Shloka");
      expect(presentationFor(p.kind!)).toBe("verse");
    }
  });
});

function findEditionRoot(editionId: string): string {
  const walk = (dir: string): string | null => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry.name === "envelope.json") {
        const env = JSON.parse(fs.readFileSync(full, "utf-8")) as JsonObject;
        if (env["edition_id"] === editionId) return dir;
      }
    }
    return null;
  };
  const root = walk(LIBRARY);
  if (!root) throw new Error(`edition root not found for ${editionId}`);
  return root;
}
