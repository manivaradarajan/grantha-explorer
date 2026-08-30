// @vitest-environment jsdom
/**
 * Tests for the `footnoteKey` helper and the optional `footnoteMap` parameter
 * of `renderCommentaryWithReferences`.
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
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
