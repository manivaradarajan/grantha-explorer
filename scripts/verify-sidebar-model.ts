/**
 * Verifies getSidebarFlatModel invariants against every grantha in
 * public/data. Run: npx tsx scripts/verify-sidebar-model.ts
 *
 * Checks:
 *   - depth matches structure_levels recursive depth
 *   - depth 1 → no sections; flatPassages cover all main passages
 *   - depth >= 2 → sections in ascending ref order
 *   - markerRef == firstVerseRef minus last component
 *   - markerRefs are unique
 *   - sections group parent-of-leaves; firstVerseRef is the min of the section
 *   - path[last] numeric tail == last component of markerRef
 *   - partIds match getPassageHierarchy's PassageGroup.partIds
 *   - every main/passage ref appears in exactly one section (or flatPassages)
 */
import * as fs from "fs";
import * as path from "path";
import {
  Grantha,
  getPassageHierarchy,
  getSidebarFlatModel,
  StructureLevel,
} from "../lib/data";

const ROOT = path.join(__dirname, "..");

function structureDepth(structure: StructureLevel[]): number {
  if (!structure.length) return 0;
  let depth = 1;
  let level = structure[0];
  while (level.children && level.children.length > 0) {
    level = level.children[0];
    depth += 1;
  }
  return depth;
}

function dropLast(ref: string): string {
  const parts = ref.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : ref;
}

function numericTail(label: string): string {
  return label.split(" ").pop() ?? "";
}

function cmpRefs(a: string, b: string): number {
  const na = a.split(".").map(Number);
  const nb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] ?? 0) - (nb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

interface IndexEntry {
  id: string;
  path: string;
}

function loadIndex(): IndexEntry[] {
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public/data/generated/granthas.json"), "utf-8"),
  );
  const list = Array.isArray(raw) ? raw : raw.granthas;
  return list as IndexEntry[];
}

function loadGrantha(entry: IndexEntry): Grantha {
  const libRoot = path.join(ROOT, "public/data/library", entry.path);
  const isSingleFile = entry.path.endsWith(".json");

  let structure: StructureLevel[];
  let passages: any[];
  let prefatory: any[];
  let concluding: any[];
  let parts: { file: string; id: string; first_ref: string }[] = [];

  if (isSingleFile) {
    const data = JSON.parse(fs.readFileSync(libRoot, "utf-8"));
    structure = data.structure_levels ?? [];
    passages = data.passages ?? [];
    prefatory = data.prefatory_material ?? [];
    concluding = data.concluding_material ?? [];
    parts = [];
  } else {
    const env = JSON.parse(
      fs.readFileSync(path.join(libRoot, "envelope.json"), "utf-8"),
    );
    structure = env.structure_levels ?? [];
    parts = (env.parts ?? []).map((p: any) => ({
      file: p.file,
      id: (p.first_ref ?? "").split(".")[0],
      first_ref: p.first_ref,
    }));
    passages = [];
    prefatory = [];
    concluding = [];
    for (const part of parts) {
      const partData = JSON.parse(
        fs.readFileSync(path.join(libRoot, part.file), "utf-8"),
      );
      passages.push(...(partData.passages ?? []));
      prefatory.push(...(partData.prefatory_material ?? []));
      concluding.push(...(partData.concluding_material ?? []));
    }
  }

  return {
    grantha_id: entry.id,
    canonical_title: "",
    aliases: [],
    text_type: "upanishad",
    language: "sanskrit",
    metadata: { source_url: null, source_commit: null, source_file: "", processing_pipeline: {}, quality_notes: "", last_updated: "" },
    structure_levels: structure,
    prefatory_material: prefatory,
    passages: passages,
    concluding_material: concluding,
    commentaries: [],
    parts,
  } as unknown as Grantha;
}

let failures = 0;

function check(ok: boolean, message: string) {
  if (!ok) {
    failures += 1;
    console.log(`    ✗ ${message}`);
  }
}

function verifyGrantha(entry: IndexEntry) {
  const grantha = loadGrantha(entry);
  const model = getSidebarFlatModel(grantha);
  const expectedDepth = structureDepth(grantha.structure_levels);

  console.log(`\n  ${entry.id} (depth ${model.depth})`);
  if (model.depth !== expectedDepth) {
    check(false, `depth mismatch: model=${model.depth} expected=${expectedDepth}`);
    return;
  }

  const mainRefs = grantha.passages.map((p) => p.ref);
  const allModelRefs: string[] =
    model.depth === 1
      ? model.flatPassages.map((p) => p.ref)
      : model.sections.flatMap((s) => s.passages.map((p) => p.ref));

  check(
    allModelRefs.length === mainRefs.length,
    `verse count: model=${allModelRefs.length} grantha=${mainRefs.length}`,
  );
  check(
    mainRefs.every((r) => allModelRefs.includes(r)) &&
      allModelRefs.every((r) => mainRefs.includes(r)),
    "every main passage ref present exactly once in the model",
  );

  if (model.depth === 1) {
    check(model.sections.length === 0, "depth 1 → sections empty");
    check(model.flatPassages.length === mainRefs.length, "depth 1 → flatPassages cover all");
  } else {
    check(model.sections.length > 0 || mainRefs.length === 0, "depth >= 2 → sections present (or no passages)");

    // ascending order by firstVerseRef numeric components
    const refOrder = model.sections.map((s) => s.boundary.firstVerseRef);
    const sorted = [...refOrder].sort((a, b) => {
      const na = a.split(".").map(Number);
      const nb = b.split(".").map(Number);
      for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const diff = (na[i] ?? 0) - (nb[i] ?? 0);
        if (diff) return diff;
      }
      return 0;
    });
    check(JSON.stringify(refOrder) === JSON.stringify(sorted), "sections in ascending ref order");

    // B1: markerRefs must be unique (a per-leaf grouping produced duplicates).
    const markerRefs = model.sections.map((s) => s.boundary.markerRef);
    check(
      new Set(markerRefs).size === markerRefs.length,
      "markerRefs are unique",
    );

    // B1: a section's passages must share the same parent (same markerRef
    // prefix) and firstVerseRef must be the numerically smallest of them.
    for (const s of model.sections) {
      const { boundary } = s;
      check(
        boundary.markerRef === dropLast(boundary.firstVerseRef),
        `markerRef rule: ${boundary.firstVerseRef} → ${boundary.markerRef}`,
      );
      const lastLabel = boundary.path[boundary.path.length - 1];
      check(
        numericTail(lastLabel) === boundary.markerRef.split(".").pop(),
        `path tail matches markerRef: ${lastLabel} vs ${boundary.markerRef}`,
      );
      check(boundary.partIds.length >= 0, "partIds array present");
      if (s.passages.length > 0) {
        const allSharePrefix = s.passages.every(
          (p) => p.ref.startsWith(boundary.markerRef + ".") ||
            p.ref === boundary.firstVerseRef,
        );
        check(allSharePrefix, `section passages share parent: ${boundary.markerRef}`);
        const minRef = [...s.passages]
          .map((p) => p.ref)
          .sort(cmpRefs)[0];
        check(
          minRef === boundary.firstVerseRef,
          `firstVerseRef is min of section: ${boundary.markerRef} (${minRef} vs ${boundary.firstVerseRef})`,
        );
      }
    }

    // partIds must equal the containing top-level group's partIds
    const hierarchy = getPassageHierarchy(grantha);
    const topGroupById = new Map<string, any>();
    for (const g of hierarchy.main) topGroupById.set(g.level, g);

    for (const s of model.sections) {
      const topLevel = s.boundary.path[0];
      const topGroup = topLevel ? topGroupById.get(topLevel) : null;
      const expected = topGroup?.partIds ?? [];
      check(
        JSON.stringify([...s.boundary.partIds].sort()) ===
          JSON.stringify([...expected].sort()),
        `partIds match top group: ${s.boundary.markerRef} vs ${JSON.stringify(expected)}`,
      );
    }
  }
}

const entries = loadIndex();
console.log(`Verifying sidebar flat model across ${entries.length} granthas...`);
for (const entry of entries) {
  try {
    verifyGrantha(entry);
  } catch (e) {
    failures += 1;
    console.log(`\n  ${entry.id}: ERROR ${(e as Error).message}`);
  }
}

console.log(failures === 0 ? "\nALL SIDEBAR MODEL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
