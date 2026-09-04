// @vitest-environment jsdom
/**
 * Tests for the `FootnoteBlock` component.
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";

import { createRoot, Root } from "react-dom/client";
import React, { act } from "react";
import { Reference } from "@/lib/data";
import { FootnoteBlock, type FootnoteEntry } from "./FootnoteBlock";
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

const LINK_CONTEXT = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: ["svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
};

const makeRef = (locator: string, displayText: string): Reference => ({
  start: 0,
  end: displayText.length,
  display_text: displayText,
  grantha_id: "svetasvatara-upanishad",
  locator,
  unresolved: false,
});

const makeEntry = (number: number, locator: string, displayText: string): FootnoteEntry => ({
  number,
  reference: makeRef(locator, displayText),
});

const renderBlock = async (
  footnotes: FootnoteEntry[],
): Promise<{ root: Root; el: HTMLDivElement }> => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        <FootnoteBlock footnotes={footnotes} linkContext={LINK_CONTEXT} />
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

describe("FootnoteBlock", () => {
  it("returns null (renders nothing) when footnotes is empty", async () => {
    const { root, el } = await renderBlock([]);
    // The CitationPanelHost wraps; the inner div from FootnoteBlock is absent.
    expect(el.querySelector(".mt-4")).toBeNull();
    cleanUp(root, el);
  });

  it("renders an <hr> separator when footnotes are present", async () => {
    const { root, el } = await renderBlock([makeEntry(1, "1.1", "श्वे.उ. १.१")]);
    expect(el.querySelector("hr")).not.toBeNull();
    cleanUp(root, el);
  });

  it("renders one <li> per unique footnote entry", async () => {
    const entries = [
      makeEntry(1, "1.1", "श्वे.उ. १.१"),
      makeEntry(2, "1.2", "श्वे.उ. १.२"),
      makeEntry(3, "2.1", "श्वे.उ. २.१"),
    ];
    const { root, el } = await renderBlock(entries);
    const items = el.querySelectorAll("li");
    expect(items.length).toBe(3);
    cleanUp(root, el);
  });

  it("each entry renders a ReferenceLink in footnote-entry mode (link present)", async () => {
    const { root, el } = await renderBlock([makeEntry(1, "1.1", "श्वे.उ. १.१")]);
    // footnote-entry mode renders an <a> element (for linkable refs).
    expect(el.querySelector("a")).not.toBeNull();
    cleanUp(root, el);
  });

  it("each entry shows the Devanagari numeral prefix", async () => {
    const { root, el } = await renderBlock([makeEntry(2, "1.1", "श्वे.उ. १.१")]);
    expect(el.textContent).toContain("[२]");
    cleanUp(root, el);
  });

  it("unresolved ref renders muted entry (no <a> link)", async () => {
    const unresolvedEntry: FootnoteEntry = {
      number: 1,
      reference: {
        start: 0,
        end: 5,
        display_text: "अज्ञात",
        grantha_id: null,
        locator: null,
        unresolved: true,
      },
    };
    const { root, el } = await renderBlock([unresolvedEntry]);
    // Unresolved refs in footnote-entry mode render a plain <span>, not an <a>.
    expect(el.querySelector("a")).toBeNull();
    // No (अज्ञात) label — the absence of a link is the only signal needed.
    expect(el.textContent).not.toContain("(अज्ञात)");
    cleanUp(root, el);
  });
});
