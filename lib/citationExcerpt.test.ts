import { describe, it, expect } from "vitest";
import { buildCitationExcerpt, splitUnits } from "./citationExcerpt";

/** A short-unit passage where every unit is 2 chars: "क।ख।ग।घ।ङ।च।छ।"
 *  units: 0 क। [0,2) · 1 ख। [2,4) · 2 ग। [4,6) · 3 घ। [6,8) · 4 ङ। [8,10)
 *         5 च। [10,12) · 6 छ। [12,14) — the passage length is 14. */
const SHORT = "क।ख।ग।घ।ङ।च।छ।";

describe("splitUnits", () => {
  it("splits into danda-delimited units with their trailing delimiter", () => {
    const units = splitUnits(SHORT);
    expect(units.map((u) => u.text)).toEqual([
      "क।",
      "ख।",
      "ग।",
      "घ।",
      "ङ।",
      "च।",
      "छ।",
    ]);
    expect(units[0]).toEqual({ start: 0, end: 2, text: "क।" });
    expect(units[6]).toEqual({ start: 12, end: 14, text: "छ।" });
  });

  it("treats a newline (pāda break) as a unit boundary too", () => {
    const text = "अम्भः\nनाकः।गर्भे";
    const units = splitUnits(text);
    // The newline is consumed as the first unit's trailing delimiter; the
    // leading whitespace of later units is skipped (no blank units).
    expect(units.map((u) => u.text)).toEqual(["अम्भः\n", "नाकः।", "गर्भे"]);
    expect(units[0].start).toBe(0);
    expect(units[1].text).toBe("नाकः।");
  });

  it("returns a single unit for a delimiter-less passage", () => {
    const units = splitUnits("अम्भः");
    expect(units).toEqual([{ start: 0, end: 5, text: "अम्भः" }]);
  });
});

describe("buildCitationExcerpt", () => {
  const hl = (needle: string) => {
    const start = SHORT.indexOf(needle);
    return { hlStart: start, hlEnd: start + needle.length };
  };

  it("windows around a deep quote and prepends the short opening unit", () => {
    // ङ is unit 4 (≥3 deep); first unit क। is short → opener + window.
    const { hlStart, hlEnd } = hl("ङ");
    const ex = buildCitationExcerpt(SHORT, hlStart, hlEnd);
    expect(ex.opener).toBe("क।");
    // Window: whole unit before (घ। [6,8)) through whole unit after (च। [10,12)).
    expect(ex.windowStart).toBe(6);
    expect(ex.windowEnd).toBe(12);
    expect(ex.leadEllipsis).toBe(true);
    expect(ex.trailEllipsis).toBe(true);
    // The quote must be inside the window.
    expect(ex.windowStart <= hlStart && hlEnd <= ex.windowEnd).toBe(true);
  });

  it("renders from the start for a shallow quote (unit ≤ 2) — no opener, no lead ellipsis", () => {
    const { hlStart, hlEnd } = hl("क"); // unit 0
    const ex = buildCitationExcerpt(SHORT, hlStart, hlEnd);
    expect(ex.opener).toBeUndefined();
    expect(ex.windowStart).toBe(0);
    expect(ex.windowEnd).toBe(4); // whole unit 1 as trailing context
    expect(ex.leadEllipsis).toBe(false);
    expect(ex.trailEllipsis).toBe(true);
  });

  it("includes the opening unit naturally for a quote at unit 2 (no ellipsis)", () => {
    const { hlStart, hlEnd } = hl("ग"); // unit 2
    const ex = buildCitationExcerpt(SHORT, hlStart, hlEnd);
    expect(ex.opener).toBeUndefined();
    expect(ex.windowStart).toBe(0);
    expect(ex.leadEllipsis).toBe(false);
  });

  it("shows no truncation when the quote spans the whole passage", () => {
    const ex = buildCitationExcerpt(SHORT, 0, SHORT.length);
    expect(ex.opener).toBeUndefined();
    expect(ex.windowStart).toBe(0);
    expect(ex.windowEnd).toBe(SHORT.length);
    expect(ex.leadEllipsis).toBe(false);
    expect(ex.trailEllipsis).toBe(false);
  });

  it("keeps every unit the quote spans (multi-unit quote) whole", () => {
    // ङ।च spans units 4 and 5.
    const { hlStart, hlEnd } = hl("ङ।च");
    const ex = buildCitationExcerpt(SHORT, hlStart, hlEnd);
    expect(ex.opener).toBe("क।");
    expect(ex.windowStart).toBe(6); // घ। whole
    expect(ex.windowEnd).toBe(14); // …छ। — no trailing truncation (end of passage)
    expect(ex.trailEllipsis).toBe(false);
  });

  it("omits the opening anchor when the first unit is longer than a line", () => {
    const longOpen = "क".repeat(40) + "।";
    const text = longOpen + "ग।घ।ङ।च।छ।";
    const start = text.indexOf("ङ");
    const ex = buildCitationExcerpt(text, start, start + 1);
    expect(ex.opener).toBeUndefined(); // first unit too long to anchor
    expect(ex.leadEllipsis).toBe(true); // text before the window was skipped
    expect(ex.windowStart).toBeGreaterThan(0);
  });

  it("still prepends the opener for a short first unit with a trailing pad", () => {
    const text = "क।ख।ग।घ।ङ।च।छ।ज।";
    const start = text.indexOf("ङ");
    const ex = buildCitationExcerpt(text, start, start + 1);
    expect(ex.opener).toBe("क।");
    expect(ex.trailEllipsis).toBe(true); // झ… beyond window exists
  });

  it("returns a single window for a one-unit passage (never ellipses)", () => {
    const text = "अम्भः";
    const ex = buildCitationExcerpt(text, 0, 2);
    expect(ex.opener).toBeUndefined();
    expect(ex.windowStart).toBe(0);
    expect(ex.windowEnd).toBe(5);
    expect(ex.leadEllipsis).toBe(false);
    expect(ex.trailEllipsis).toBe(false);
  });
});
