// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * CSS-invariant guard: the reading-surface source highlight must stay
 * PAINT-ONLY.
 *
 * `mark.citation-source-mark` is inserted into live reading text while its
 * citation popover is open. Any layout-affecting declaration reflows the
 * paragraph — measured: `box-decoration-break: clone` changed how an unbroken
 * Devanagari run wraps (word-break: break-word), shifting the hovered footnote
 * marker ~36px, so the cursor was no longer over it → mouseleave closed the
 * popover → the mark was removed → the text re-wrapped back → re-hover → an
 * infinite open/reflow/close flicker (vedarthasangraha §81, footnotes ९–१३).
 *
 * This test encodes that invariant so a future edit cannot silently reintroduce
 * a layout-affecting property. Adding a genuinely paint-only property (e.g.
 * `box-shadow` for a paint-only underline) is an explicit, reviewed allowlist
 * change — which is the intent.
 *
 * `mark.review-mark` (edit mode) intentionally keeps `box-decoration-break:
 * clone` and is NOT covered: it is not hover-driven, so it cannot oscillate.
 */
// Vitest runs from the repo root (matching the integration tests' use of
// __dirname two levels up), so anchor on process.cwd() — the repo root — and
// read the committed stylesheet from its app/ location.
const ROOT = process.cwd();
const GLOBALS = path.join(ROOT, "app", "globals.css");

/** Paint-only declarations permitted on the reading-surface highlight rules. */
const PAINT_ONLY = new Set(["background-color", "color", "border-radius"]);

/** A parsed CSS rule: the full selector text and the raw declaration block. */
interface CssRule {
  selector: string;
  declarations: string;
}

/** Parse `css` into flat (selector, declarations) pairs, recursing into block
 *  rules such as `@media` so that nested simple rules are always surfaced.
 *  Assumes no braces appear inside string values or comments (true for the
 *  hand-maintained `globals.css`). Also assumes the file has no top-level
 *  text before the first `{` (no `@charset`, no bare leading comment). */
function extractRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const selector = css.slice(i, open).trim();
    // Find the matching close brace using depth tracking.
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (body.includes("{")) {
      // Block rule (@media, @supports, etc.) — recurse into its body so inner
      // simple rules are surfaced with their own selectors.
      rules.push(...extractRules(body));
    } else {
      rules.push({ selector, declarations: body });
    }
    i = j;
  }
  return rules;
}

// Parse once at module load; all test cases share this extraction.
const ALL_RULES: CssRule[] = extractRules(fs.readFileSync(GLOBALS, "utf8"));

/** Extract every rule whose selector mentions `needle`. */
function rulesMentioning(needle: string): CssRule[] {
  return ALL_RULES.filter((r) => r.selector.includes(needle));
}

describe("reading-surface source highlight stays paint-only", () => {
  const target = ".citation-source-mark";

  it("has at least one .citation-source-mark rule (guards against rename/delete)", () => {
    expect(rulesMentioning(target).length).toBeGreaterThan(0);
  });

  it("allows only paint-only declarations on .citation-source-mark rules", () => {
    const rules = rulesMentioning(target);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const decls = rule.declarations
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);
      expect(decls.length).toBeGreaterThan(0);
      for (const decl of decls) {
        const prop = decl.split(":")[0]?.trim() ?? decl;
        expect(
          PAINT_ONLY.has(prop),
          `[${rule.selector}] '${decl}' is not paint-only — a layout-affecting ` +
            `declaration on the source highlight reflows the reading text and ` +
            `causes the hover flicker (§81 footnote repro).`,
        ).toBe(true);
      }
    }
  });

  it("never sets box-decoration-break on .citation-source-mark", () => {
    for (const rule of rulesMentioning(target)) {
      expect(
        rule.declarations,
        `[${rule.selector}] box-decoration-break: clone reflows unbroken ` +
          `Devanagari wrapping and shifts the hovered marker under the cursor.`,
      ).not.toMatch(/box-decoration-break/);
    }
  });
});
