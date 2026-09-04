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

/** Extract every rule whose selector mentions `needle` (crude but sufficient
 *  for this hand-maintained file: comments and values contain no braces). */
function rulesMentioning(needle: string): CssRule[] {
  const css = fs.readFileSync(GLOBALS, "utf8");
  const rules: CssRule[] = [];
  const re = /([^{}]*)[^{}]*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim();
    if (selector.includes(needle)) {
      rules.push({ selector, declarations: m[2] });
    }
  }
  return rules;
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
