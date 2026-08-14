/**
 * Verifies compareRefs / sortPassagesByRef ordering invariants.
 * Run: npx tsx scripts/verify-passage-order.ts
 *
 * Regression for lazy-load part ordering: Grantha.passages is assembled
 * incrementally in part-load completion order, which can differ from document
 * order; sorting at every assembly point keeps it in natural ref order. This
 * script pins the comparator and sort behavior so that invariant stays true.
 *
 * Checks:
 *   - natural numeric order (2.1 < 10.1, not lexicographic)
 *   - 3-level refs sort correctly
 *   - shorter ref precedes its extension ("1.1" < "1.1.2")
 *   - equal refs compare 0
 *   - sortPassagesByRef returns a sorted copy and never mutates its input
 *   - real Gita corpus: a deliberately-scrambled flat passage list sorts back
 *     to monotonic document order with no refs lost or duplicated
 */
import * as fs from "fs";
import * as path from "path";
import { compareRefs, sortPassagesByRef } from "../lib/data";

const ROOT = path.join(__dirname, "..");
let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
  }
}

// --- compareRefs ---
console.log("compareRefs:");
check(compareRefs("1.1", "1.1") === 0, "equal refs compare 0");
check(compareRefs("1.1", "1.2") < 0, "1.1 < 1.2");
check(compareRefs("2.1", "10.1") < 0, "2.1 < 10.1 (numeric, not lexicographic)");
check(compareRefs("10.1", "2.1") > 0, "10.1 > 2.1");
check(compareRefs("1.1", "1.1.2") < 0, "1.1 < 1.1.2 (shorter sorts before extension)");
check(compareRefs("3.4.2", "3.4.10") < 0, "3.4.2 < 3.4.10 (3-level)");
check(compareRefs("0.1", "1.1") < 0, "0.1 < 1.1 (prefatory precedes chapters)");

// --- sortPassagesByRef immutability + stability ---
console.log("sortPassagesByRef:");
const input = [
  { ref: "10.1" },
  { ref: "2.1" },
  { ref: "1.1" },
  { ref: "10.2" },
  { ref: "2.2" },
];
const inputRefs = input.map((p) => p.ref);
const sorted = sortPassagesByRef(input);
check(
  JSON.stringify(sorted.map((p) => p.ref)) ===
    JSON.stringify(["1.1", "2.1", "2.2", "10.1", "10.2"]),
  "sorts mixed 1.x/2.x/10.x refs into natural order",
);
check(sorted !== input, "returns a new array (not the input reference)");
check(
  JSON.stringify(input.map((p) => p.ref)) === JSON.stringify(inputRefs),
  "does not mutate the input array",
);

// --- real Gita corpus ---
console.log("Gita corpus (scrambled load-order simulation):");
const gitaDir = path.join(ROOT, "public/data/library/bhagavad-gita/bhagavad-gita");
const allMainPassages: { ref: string }[] = [];
for (let i = 1; i <= 19; i++) {
  const part = JSON.parse(
    fs.readFileSync(path.join(gitaDir, `part${i}.json`), "utf-8"),
  );
  for (const p of part.passages ?? []) {
    allMainPassages.push({ ref: p.ref });
  }
}
// Simulate the worst parallel-load race: parts landing in reverse order.
const scrambled = [...allMainPassages].reverse();
const restored = sortPassagesByRef(scrambled);

let monotonic = true;
for (let i = 1; i < restored.length; i++) {
  if (compareRefs(restored[i - 1].ref, restored[i].ref) > 0) {
    monotonic = false;
    break;
  }
}
check(monotonic, "scrambled Gita passages sort to monotonic ref order");

const restoredRefs = restored.map((p) => p.ref);
const scrambledRefs = scrambled.map((p) => p.ref);
check(
  restoredRefs.length === scrambledRefs.length,
  `no refs lost (${restoredRefs.length} of ${scrambledRefs.length})`,
);
check(
  new Set(restoredRefs).size === restoredRefs.length,
  "no duplicate refs introduced",
);
check(restored[0].ref === "1.1", `first main passage is 1.1 (got ${restored[0].ref})`);

console.log(
  failures === 0 ? "\nALL PASSAGE-ORDER CHECKS PASS" : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
