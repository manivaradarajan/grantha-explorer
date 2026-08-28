// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import {
  visibleMap,
  mapVisibleSelectionToRaw,
  locateSelectionInPassage,
  selectionToOffset,
  SelectionMappingError,
  SelectionMappingErrorCode,
} from "./selectionToOffset";

// Real on-disk data: vedarthasangraha Para 17 (has verse-quotes + references).
// Loaded synchronously so describe-body fixtures (evaluated at collection time,
// before beforeAll runs) can read them.
const _DATA = JSON.parse(
  fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"),
);
const PARA17 = _DATA.passages.find((x: { ref: string }) => x.ref === "17")
  .content.sanskrit.devanagari as string;
const PARA1 = _DATA.passages.find((x: { ref: string }) => x.ref === "1")
  .content.sanskrit.devanagari as string;

describe("visibleMap — markdown-stripping inverse map", () => {
  it("maps a plain Devanagari slice 1:1 (no markers)", () => {
    const { visible, rawForVisible } = visibleMap("अयम् आत्मा ब्रह्म");
    expect(visible).toBe("अयम् आत्मा ब्रह्म");
    expect(rawForVisible.length).toBe(visible.length);
    expect(rawForVisible[0]).toBe(0);
    expect(rawForVisible[visible.length - 1]).toBe(visible.length - 1);
  });

  it("drops ** markers, keeping the parallel raw indices aligned", () => {
    const { visible, rawForVisible } = visibleMap("अ **ब** ग");
    // raw: अ(0) sp(1) *(2) *(3) ब(4) *(5) *(6) sp(7) ग(8)
    expect(visible).toBe("अ ब ग");
    expect(rawForVisible).toEqual([0, 1, 4, 7, 8]);
  });

  it("drops a line-leading #### (the sanitize caption transform)", () => {
    const { visible } = visibleMap("#### शिरोरत्नम्\nनमः");
    expect(visible).toBe("शिरोरत्नम्\nनमः");
  });

  it("preserves NBSP (protectLineBreaks glue) as a normal visible char", () => {
    const { visible } = visibleMap("सूर्यः\u00A0।");
    expect(visible).toBe("सूर्यः\u00A0।");
  });
});

describe("mapVisibleSelectionToRaw — exact in-span mapping", () => {
  const raw = PARA17;
  const { visible, rawForVisible } = visibleMap(raw);

  it("maps a known selection boundary to exact raw offsets (Para 17)", () => {
    // "वेदशब्देभ्य एवादौ" occurs in Para 17 (a verse pāda).
    const needle = "वेदशब्देभ्य एवादौ";
    const visStart = visible.indexOf(needle);
    expect(visStart).toBeGreaterThanOrEqual(0);
    const r = mapVisibleSelectionToRaw({
      spanRawStart: 0,
      rawSlice: raw,
      selectedText: needle,
      selStartVisible: visStart,
      selEndVisible: visStart + needle.length,
    });
    expect(r.snippet).toBe(needle);
    // Snippet round-trips against the real passage raw.
    expect(raw.slice(r.start, r.end)).toBe(needle);
    // The mapping is exact (identity for marker-free text).
    expect(r.start).toBe(rawForVisible[visStart]);
    expect(r.end).toBe(rawForVisible[visStart + needle.length - 1] + 1);
  });

  it("rejects a selection that crosses the span bounds", () => {
    expect(() =>
      mapVisibleSelectionToRaw({
        spanRawStart: 0,
        rawSlice: raw,
        selectedText: "x",
        selStartVisible: -1,
        selEndVisible: 5,
      }),
    ).toThrow(SelectionMappingError);
  });

  it("rejects a zero-length or inverted selection", () => {
    expect(() =>
      mapVisibleSelectionToRaw({
        spanRawStart: 0,
        rawSlice: raw,
        selectedText: "x",
        selStartVisible: 10,
        selEndVisible: 10,
      }),
    ).toThrow(SelectionMappingError);
    expect(() =>
      mapVisibleSelectionToRaw({
        spanRawStart: 0,
        rawSlice: raw,
        selectedText: "x",
        selStartVisible: 10,
        selEndVisible: 5,
      }),
    ).toThrow(SelectionMappingError);
  });
});

describe("locateSelectionInPassage — widened unambiguous search", () => {
  const raw = PARA17;

  it("locates a unique occurrence in the passage", () => {
    const needle = "संस्थाः संस्थानानि रूपाणीति यावत्";
    const r = locateSelectionInPassage(raw, needle);
    expect(r.snippet).toBe(needle);
    expect(raw.slice(r.start, r.end)).toBe(needle);
  });

  it("locates a unique occurrence even when markdown would be stripped", () => {
    const rawMd = "प्रथमं **अयम् आत्मा** ब्रह्म";
    const r = locateSelectionInPassage(rawMd, "अयम् आत्मा");
    expect(r.snippet).toBe("अयम् आत्मा");
    expect(rawMd.slice(r.start, r.end)).toBe("अयम् आत्मा");
  });

  it("throws AMBIGUOUS when the text repeats in the passage (never silently picks)", () => {
    const rawDup = "अयम् आत्मा ब्रह्म । अयम् आत्मा ब्रह्म ।";
    let code: SelectionMappingErrorCode | null = null;
    try {
      locateSelectionInPassage(rawDup, "अयम् आत्मा ब्रह्म");
    } catch (e) {
      if (e instanceof SelectionMappingError) code = e.code;
    }
    expect(code).toBe("ambiguous");
  });

  it("throws NOT_FOUND when absent", () => {
    let code: SelectionMappingErrorCode | null = null;
    try {
      locateSelectionInPassage(raw, "गगनचुम्बीप्रासाद");
    } catch (e) {
      if (e instanceof SelectionMappingError) code = e.code;
    }
    expect(code).toBe("not_found");
  });
});

describe("selectionToOffset — DOM Range → raw offsets (jsdom)", () => {
  // A span annotated with raw offsets, containing visible text with NBSP glue
  // and a strip of markdown, mirroring the renderer's annotated spans.
  function makeAnnotatedSpan(
    rawStart: number,
    rawEnd: number,
    rawSlice: string,
  ): HTMLSpanElement {
    const span = document.createElement("span");
    span.setAttribute("data-offset-start", String(rawStart));
    span.setAttribute("data-offset-end", String(rawEnd));
    span.textContent = visibleMap(rawSlice).visible;
    document.body.appendChild(span);
    return span;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("maps a selection within one annotated span to absolute raw offsets", () => {
    const rawPassage = PARA1;
    const slice = rawPassage.slice(0, 60);
    const span = makeAnnotatedSpan(0, 60, slice);
    const textNode = span.firstChild as Text;
    // Select visible chars 10..20 of the span.
    const range = document.createRange();
    range.setStart(textNode, 10);
    range.setEnd(textNode, 20);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const r = selectionToOffset({
      range,
      passageRaw: rawPassage,
      annotatedSelector: "span[data-offset-start]",
    });
    const selected = range.toString().replace(/\u00A0/g, " ");
    expect(rawPassage.slice(r.start, r.end)).toBe(selected);
    expect(r.source).toBe("exact");
    sel.removeAllRanges();
  });

  it("widens across two annotated spans and locates the selection in the passage", () => {
    const rawPassage = PARA17;
    // Split the passage into two adjacent spans at index 220.
    const cut = 220;
    const s1 = makeAnnotatedSpan(0, cut, rawPassage.slice(0, cut));
    const s2 = makeAnnotatedSpan(cut, rawPassage.length, rawPassage.slice(cut));
    // Select across the boundary: last 6 chars of span 1 + first 6 of span 2.
    const tn1 = s1.firstChild as Text;
    const tn2 = s2.firstChild as Text;
    const selText1 = tn1.textContent!.slice(-6);
    const selText2 = tn2.textContent!.slice(0, 6);
    const range = document.createRange();
    range.setStart(tn1, tn1.textContent!.length - 6);
    range.setEnd(tn2, 6);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const joined = (selText1 + selText2).replace(/\u00A0/g, " ");
    const r = selectionToOffset({
      range,
      passageRaw: rawPassage,
      annotatedSelector: "span[data-offset-start]",
    });
    expect(r.source).toBe("widened");
    expect(rawPassage.slice(r.start, r.end)).toBe(joined);
    sel.removeAllRanges();
  });

  it("throws a clean error when the selected text is absent from the passage", () => {
    const rawPassage = PARA1;
    const span = makeAnnotatedSpan(0, 30, rawPassage.slice(0, 30));
    const tn = span.firstChild as Text;
    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, Math.min(5, tn.textContent!.length));
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    // Force NOT_FOUND by passing a passage that lacks the selected text.
    expect(() =>
      selectionToOffset({
        range,
        passageRaw: "अन्यतमः पाठः",
        annotatedSelector: "span[data-offset-start]",
      }),
    ).toThrow(SelectionMappingError);
    sel.removeAllRanges();
  });
});
