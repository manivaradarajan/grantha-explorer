// @vitest-environment node
import { describe, it, expect } from "vitest";
import { locateSnippet, resolveAnchor, resolveReviewMarks } from "./reviewAnchor";

const norm = (s: string) => s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

describe("locateSnippet", () => {
  it("returns exact match offsets", () => {
    const raw = "अयं पाठः सम् । सर्वम् ॥";
    const r = locateSnippet(raw, "पाठः सम्");
    expect(r).toEqual({ start: 4, end: 12 });
  });

  it("strips decorative quotes the raw passage lacks (para 6)", () => {
    const raw = "अपहतपाप्मा ब्रह्म";
    const r = locateSnippet(raw, "अ“पहतपाप्मा”");
    expect(r).not.toBeNull();
    expect(raw.slice(r!.start, r!.end)).toBe("अपहतपाप्मा");
  });

  it("normalizes NBSP + newline + danda spacing (para 100 style)", () => {
    const raw = "निर्वाणमय एवायमात्मा ज्ञानमयोऽमलः ।\nदुःखाज्ञानमला धर्मा प्रकृतेस्ते न चात्मनः ॥";
    const snippet = "निर्वाणमय एवायमात्मा ज्ञानमयोऽमलः\u00A0।दुःखाज्ञानमला धर्मा प्रकृतेस्ते न चात्मनः ॥";
    const r = locateSnippet(raw, snippet)!;
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeGreaterThan(r.start);
    expect(norm(raw.slice(r.start, r.end)))
      .toBe("निर्वाणमय एवायमात्मा ज्ञानमयोऽमलः । दुःखाज्ञानमला धर्मा प्रकृतेस्ते न चात्मनः ॥");
    expect(raw.slice(r.start, r.end).trim().endsWith("॥")).toBe(true);
  });

  it("handles a verse ending in ॥ as the anchor tail (para 133)", () => {
    const raw = "शिव एव केवलः । तदक्षरं च यत् पुराणी ॥ (श्वे.उ.";
    const snippet = "शिव एव केवलः\u00A0।तदक्षरं च यत् पुराणी ॥";
    const r = locateSnippet(raw, snippet)!;
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeGreaterThan(r.start);
    const seg = raw.slice(r.start, r.end);
    expect(seg).toContain("पुराणी");
    expect(seg.trim().endsWith("॥")).toBe(true);
  });
});

describe("resolveAnchor", () => {
  it("prefers stored offsets even when the snippet repeats (para 72)", () => {
    const raw = "क्रिया देवा वैकारिकाः स्मृताः ॥ अन्ते देवा वैकारिकाः स्मृताः ॥";
    const snippet = "देवा वैकारिकाः स्मृताः";
    const second = raw.indexOf(snippet, raw.indexOf(snippet) + 1);
    const r = resolveAnchor(raw, snippet, second, second + snippet.length);
    expect(r).toEqual({ start: second, end: second + snippet.length });
    expect(raw.slice(r!.start, r!.end)).toBe(snippet);
  });

  it("falls back to locateSnippet when stored offsets are stale", () => {
    const raw = "अयम् आत्मा ब्रह्म";
    const r = resolveAnchor(raw, "आत्मा ब्रह्म", 100, 110);
    expect(r!.start).toBeGreaterThanOrEqual(0);
    expect(raw.slice(r!.start, r!.end)).toBe("आत्मा ब्रह्म");
  });
});

describe("resolveReviewMarks", () => {
  it("resolves valid comments and skips deleted or detached ones", () => {
    const passageTexts = {
      "1": "अयम् आत्मा ब्रह्म",
      "2": "सर्वं खल्विदं ब्रह्म",
    };
    const comments = [
      {
        id: "c1",
        passage_ref: "1",
        type: "note" as const,
        status: "open" as const,
        anchor: { start: 0, end: 10, snippet: "आत्मा ब्रह्म" },
      },
      {
        id: "c2",
        passage_ref: "1",
        type: "note" as const,
        status: "deleted" as const,
        anchor: { start: 0, end: 4, snippet: "अयम्" },
      },
      {
        id: "c3",
        passage_ref: "2",
        type: "citation-fix" as const,
        status: "open" as const,
        anchor: { start: 0, end: 5, snippet: "सर्वं" },
      },
      {
        id: "c4",
        passage_ref: "2",
        type: "quote-locate" as const,
        status: "open" as const,
        anchor: { start: 0, end: 5, snippet: "गायत्री" }, // not in passage
      },
    ];

    const marks = resolveReviewMarks(comments, passageTexts, ["c4"]);
    expect(marks["1"]).toHaveLength(1);
    expect(marks["1"][0].commentId).toBe("c1");
    expect(marks["1"][0].start).toBe(5);
    expect(marks["1"][0].end).toBe(17);

    expect(marks["2"]).toHaveLength(1);
    expect(marks["2"][0].commentId).toBe("c3");
    expect(marks["2"][0].start).toBe(0);
    expect(marks["2"][0].end).toBe(5);
  });
});
