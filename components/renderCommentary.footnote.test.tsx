// @vitest-environment jsdom
/**
 * Tests for the `footnoteKey` helper and the optional `footnoteMap` parameter
 * of `renderCommentaryWithReferences`.
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";

import { createRoot, Root } from "react-dom/client";
import React, { act } from "react";
import { Reference } from "@/lib/data";
import {
  footnoteKey,
  renderCommentaryWithReferences,
} from "./renderCommentary";
import { CitationPanelHost } from "./CitationPanel";

beforeAll(() => {
  const RO = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as Record<string, unknown>).ResizeObserver =
    (globalThis as Record<string, unknown>).ResizeObserver ?? RO;
});

const BASE_CONTEXT = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: ["svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
};

const makeRef = (override: Partial<Reference> = {}): Reference => ({
  start: 0,
  end: 5,
  display_text: "श्वे.उ. १.१",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.1",
  unresolved: false,
  ...override,
});

const renderNode = async (
  node: React.ReactNode,
): Promise<{ root: Root; el: HTMLDivElement }> => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        {node}
      </CitationPanelHost>,
    );
  });
  return { root, el };
};

const cleanUp = (root: Root, el: HTMLDivElement) => {
  act(() => root.unmount());
  el.remove();
};

afterEach(() => {
  document.body.innerHTML = "";
});

// Context extended with all granthas used in the trailing-punct tests.
const EXTENDED_CONTEXT = {
  currentGranthaId: "vedarthasangraha",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: [
    "svetasvatara-upanishad",
    "brihadaranyaka-upanishad",
    "taittiriya-upanishad",
  ],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
    "brihadaranyaka-upanishad": { editions: [], default_school: undefined },
    "taittiriya-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: {
    "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्",
    "brihadaranyaka-upanishad": "बृहदारण्यकोपनिषत्",
    "taittiriya-upanishad": "तैत्तिरीयोपनिषत्",
  },
};

// ---

describe("trailing punctuation precedes footnote marker", () => {
  // Reference spanning "(बृ.उ. ६.४.५)" (parens inclusive) followed by ","
  const RAW = "अयमात्मा ब्रह्म (बृ.उ. ६.४.५), अत्र";
  const refStart = RAW.indexOf("(बृ.उ. ६.४.५)");
  const refEnd = refStart + "(बृ.उ. ६.४.५)".length;

  const REF = makeRef({
    start: refStart,
    end: refEnd,
    display_text: "बृ.उ. ६.४.५",
    grantha_id: "brihadaranyaka-upanishad",
    locator: "6.4.5",
  });
  const footnoteMap = new Map([[footnoteKey(REF), 2]]);

  it("comma after ) renders before <sup> in renderCommentaryWithReferences", async () => {
    const node = renderCommentaryWithReferences(
      RAW,
      [REF],
      EXTENDED_CONTEXT,
      undefined,
      footnoteMap,
    );
    const { root, el } = await renderNode(node);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    // The comma must appear in a dedicated node BEFORE the <sup> element.
    // We look for an element whose textContent is exactly "," and that
    // precedes the sup in document order (DOCUMENT_POSITION_FOLLOWING means
    // the sup comes after the candidate node).
    const nodesBeforeSup = Array.from(el.querySelectorAll("*")).filter(
      (n) =>
        n.compareDocumentPosition(sup!) & Node.DOCUMENT_POSITION_FOLLOWING &&
        !(n.compareDocumentPosition(sup!) & Node.DOCUMENT_POSITION_CONTAINED_BY),
    );
    const commaNode = nodesBeforeSup.find((n) => n.textContent === ",");
    expect(commaNode).not.toBeNull();
    cleanUp(root, el);
  });

  it("दण्ड (।) after ) renders before <sup>", async () => {
    const raw2 = "एष आत्मा (श्वे.उ. ४.१)। अत्र";
    const r2start = raw2.indexOf("(श्वे.उ. ४.१)");
    const r2end = r2start + "(श्वे.उ. ४.१)".length;
    const ref2 = makeRef({
      start: r2start,
      end: r2end,
      display_text: "श्वे.उ. ४.१",
      grantha_id: "svetasvatara-upanishad",
      locator: "4.1",
    });
    const map2 = new Map([[footnoteKey(ref2), 1]]);
    const node = renderCommentaryWithReferences(
      raw2,
      [ref2],
      EXTENDED_CONTEXT,
      undefined,
      map2,
    );
    const { root, el } = await renderNode(node);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    const nodesBeforeSup = Array.from(el.querySelectorAll("*")).filter(
      (n) => n.compareDocumentPosition(sup!) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const dandaNode = nodesBeforeSup.find((n) => n.textContent === "।");
    expect(dandaNode).not.toBeNull();
    cleanUp(root, el);
  });

  it("no trailing punct → no spurious node inserted before <sup>", async () => {
    const raw3 = "ब्रह्मविदाप्नोति परम् (तै.उ. २.१.१) इति";
    const r3start = raw3.indexOf("(तै.उ. २.१.१)");
    const r3end = r3start + "(तै.उ. २.१.१)".length;
    const ref3 = makeRef({
      start: r3start,
      end: r3end,
      display_text: "तै.उ. २.१.१",
      grantha_id: "taittiriya-upanishad",
      locator: "2.1.1",
    });
    const map3 = new Map([[footnoteKey(ref3), 6]]);
    const node = renderCommentaryWithReferences(
      raw3,
      [ref3],
      EXTENDED_CONTEXT,
      undefined,
      map3,
    );
    const { root, el } = await renderNode(node);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    // Collect element nodes before the sup.
    const nodesBeforeSup = Array.from(el.querySelectorAll("*")).filter(
      (n) => n.compareDocumentPosition(sup!) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const lastBefore = nodesBeforeSup[nodesBeforeSup.length - 1];
    // The node immediately before sup must NOT be a lone punctuation character.
    const LONE_PUNCT = /^[,;:.?!।॥]$/;
    expect(LONE_PUNCT.test(lastBefore?.textContent?.trim() ?? "x")).toBe(false);
    cleanUp(root, el);
  });

  it("inline mode unchanged: no punct reordering when not footnote-marker", async () => {
    // No footnoteMap → inline mode
    const node = renderCommentaryWithReferences(RAW, [REF], EXTENDED_CONTEXT);
    const { root, el } = await renderNode(node);
    // Should render an <a> tag (inline link), not <sup>.
    const sup = el.querySelector("sup");
    expect(sup).toBeNull();
    const link = el.querySelector("a");
    expect(link).not.toBeNull();
    cleanUp(root, el);
  });
});

// ---

describe("footnoteKey()", () => {
  it("same grantha_id + locator + display_text → same key", () => {
    const r1 = makeRef();
    const r2 = makeRef();
    expect(footnoteKey(r1)).toBe(footnoteKey(r2));
  });

  it("different display_text → different key", () => {
    const r1 = makeRef({ display_text: "श्वे.उ. १.१" });
    const r2 = makeRef({ display_text: "श्वे.उ. १.२" });
    expect(footnoteKey(r1)).not.toBe(footnoteKey(r2));
  });

  it("different locator → different key", () => {
    const r1 = makeRef({ locator: "1.1" });
    const r2 = makeRef({ locator: "1.2" });
    expect(footnoteKey(r1)).not.toBe(footnoteKey(r2));
  });

  it("different grantha_id → different key", () => {
    const r1 = makeRef({ grantha_id: "svetasvatara-upanishad" });
    const r2 = makeRef({ grantha_id: "brihadaranyaka-upanishad" });
    expect(footnoteKey(r1)).not.toBe(footnoteKey(r2));
  });

  it("null grantha_id is handled without crash", () => {
    const r = makeRef({ grantha_id: null });
    expect(() => footnoteKey(r)).not.toThrow();
  });
});

// ---

describe("renderCommentaryWithReferences with footnoteMap", () => {
  it("without footnoteMap: emits inline reference link (regression)", async () => {
    // Raw text: "ABC DEF GHI" with ref at [4, 7) = "DEF"
    const rawText = "ABC DEF GHI";
    const refs: Reference[] = [makeRef({ start: 4, end: 7, display_text: "DEF" })];
    const node = renderCommentaryWithReferences(rawText, refs, BASE_CONTEXT);
    const { root, el } = await renderNode(node);
    // Should render an anchor with class reference-link.
    expect(el.querySelector("a.reference-link, a.external-reference")).not.toBeNull();
    expect(el.querySelector("sup")).toBeNull();
    cleanUp(root, el);
  });

  it("with footnoteMap containing ref key: emits <sup> marker, not inline link", async () => {
    const rawText = "ABC DEF GHI";
    const ref = makeRef({ start: 4, end: 7, display_text: "DEF" });
    const refs: Reference[] = [ref];
    const map = new Map([[footnoteKey(ref), 1]]);
    const node = renderCommentaryWithReferences(rawText, refs, BASE_CONTEXT, undefined, map);
    const { root, el } = await renderNode(node);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    expect(sup!.textContent).toBe("[१]");
    // No inline reference-link in this mode.
    expect(el.querySelector("a.reference-link")).toBeNull();
    cleanUp(root, el);
  });

  it("text segments before and after the ref are unaffected", async () => {
    const rawText = "ABC DEF GHI";
    const ref = makeRef({ start: 4, end: 7, display_text: "DEF" });
    const map = new Map([[footnoteKey(ref), 1]]);
    const node = renderCommentaryWithReferences(rawText, [ref], BASE_CONTEXT, undefined, map);
    const { root, el } = await renderNode(node);
    // Both surrounding segments should appear as text.
    expect(el.textContent).toContain("ABC");
    expect(el.textContent).toContain("GHI");
    cleanUp(root, el);
  });

  it("ref not in footnoteMap renders as normal inline link", async () => {
    const rawText = "ABC DEF GHI";
    const ref1 = makeRef({ start: 4, end: 7, display_text: "DEF", locator: "1.1" });
    const ref2 = makeRef({ start: 8, end: 11, display_text: "GHI", locator: "1.2" });
    // Only ref1 is in the map.
    const map = new Map([[footnoteKey(ref1), 1]]);
    const node = renderCommentaryWithReferences(
      rawText,
      [ref1, ref2],
      BASE_CONTEXT,
      undefined,
      map,
    );
    const { root, el } = await renderNode(node);
    // ref1 → sup marker; ref2 → inline link.
    expect(el.querySelector("sup")).not.toBeNull();
    expect(el.querySelector("a.reference-link, a.external-reference")).not.toBeNull();
    cleanUp(root, el);
  });

  it("empty footnoteMap: all refs render as normal inline links", async () => {
    const rawText = "ABC DEF GHI";
    const ref = makeRef({ start: 4, end: 7, display_text: "DEF" });
    const map = new Map<string, number>(); // empty
    const node = renderCommentaryWithReferences(rawText, [ref], BASE_CONTEXT, undefined, map);
    const { root, el } = await renderNode(node);
    expect(el.querySelector("sup")).toBeNull();
    expect(el.querySelector("a.reference-link, a.external-reference")).not.toBeNull();
    cleanUp(root, el);
  });
});
