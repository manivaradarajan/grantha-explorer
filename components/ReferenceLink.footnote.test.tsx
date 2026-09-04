// @vitest-environment jsdom
/**
 * Tests for the `footnote-marker` and `footnote-entry` display modes added
 * to `ReferenceLink`.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

import { createRoot, Root } from "react-dom/client";
import React, { act } from "react";
import { Reference } from "@/lib/data";
import ReferenceLink from "./ReferenceLink";
import { CitationPanelHost } from "./CitationPanel";

const LINKABLE_REF: Reference = {
  start: 0,
  end: 10,
  display_text: "श्वे.उ. १.९",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.9",
  unresolved: false,
};

const UNRESOLVED_REF: Reference = {
  start: 0,
  end: 5,
  display_text: "अज्ञात",
  grantha_id: null,
  locator: null,
  unresolved: true,
};

const NOT_IN_LIBRARY_REF: Reference = {
  start: 0,
  end: 8,
  display_text: "पा.सू. १.१",
  grantha_id: "panini-ashtadhyayi",
  locator: "1.1",
  unresolved: false,
};

const BASE_PROPS = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: vi.fn(),
  availableGranthaIds: ["svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
};

let root: Root;
let el: HTMLDivElement;

beforeAll(() => {
  const RO = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as Record<string, unknown>).ResizeObserver =
    (globalThis as Record<string, unknown>).ResizeObserver ?? RO;
});

beforeEach(() => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  el.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderLink = (
  reference: Reference,
  displayMode: "inline" | "footnote-marker" | "footnote-entry",
  footnoteNumber?: number,
) =>
  act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        <ReferenceLink
          reference={reference}
          displayMode={displayMode}
          footnoteNumber={footnoteNumber}
          {...BASE_PROPS}
        />
      </CitationPanelHost>,
    );
  });

const popoverEl = () => document.querySelector(".citation-popover");

describe("ReferenceLink — footnote-marker mode", () => {
  it("renders a <sup> element containing [n] with Devanagari numerals", async () => {
    await renderLink(LINKABLE_REF, "footnote-marker", 1);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    expect(sup!.textContent).toBe("[१]");
  });

  it("uses Devanagari numeral for number 3 → [३]", async () => {
    await renderLink(LINKABLE_REF, "footnote-marker", 3);
    expect(el.querySelector("sup")!.textContent).toBe("[३]");
  });

  it("contains a link inside the <sup>", async () => {
    await renderLink(LINKABLE_REF, "footnote-marker", 1);
    const sup = el.querySelector("sup");
    expect(sup!.querySelector("a")).not.toBeNull();
  });

  it("hover on marker triggers CitationPanel popover", async () => {
    await renderLink(LINKABLE_REF, "footnote-marker", 1);
    const anchor = el.querySelector("sup a") as HTMLElement;
    expect(anchor).not.toBeNull();
    act(() => {
      anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(popoverEl()).not.toBeNull();
  });

  it("unresolved ref in footnote-marker renders muted <sup> without a link", async () => {
    await renderLink(UNRESOLVED_REF, "footnote-marker", 2);
    const sup = el.querySelector("sup");
    expect(sup).not.toBeNull();
    expect(sup!.textContent).toBe("[२]");
    expect(sup!.querySelector("a")).toBeNull();
  });
});

describe("ReferenceLink — footnote-entry mode", () => {
  it("renders [n] prefix and display_text", async () => {
    await renderLink(LINKABLE_REF, "footnote-entry", 1);
    expect(el.textContent).toContain("[१]");
    expect(el.textContent).toContain("श्वे.उ. १.९");
  });

  it("uses Devanagari numeral for number 2 → [२]", async () => {
    await renderLink(LINKABLE_REF, "footnote-entry", 2);
    expect(el.textContent).toContain("[२]");
  });

  it("renders a link for linkable references", async () => {
    await renderLink(LINKABLE_REF, "footnote-entry", 1);
    expect(el.querySelector("a")).not.toBeNull();
  });

  it("hover on entry triggers CitationPanel popover", async () => {
    await renderLink(LINKABLE_REF, "footnote-entry", 1);
    const anchor = el.querySelector("a") as HTMLElement;
    expect(anchor).not.toBeNull();
    act(() => {
      anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(popoverEl()).not.toBeNull();
  });

  it("unresolved ref in footnote-entry renders plain text without (अज्ञात)", async () => {
    await renderLink(UNRESOLVED_REF, "footnote-entry", 3);
    expect(el.textContent).toContain("[३]");
    expect(el.textContent).not.toContain("(अज्ञात)");
    expect(el.querySelector("a")).toBeNull();
  });

  it("not-in-library ref renders a plain link without (अज्ञात) — hover still works", async () => {
    await renderLink(NOT_IN_LIBRARY_REF, "footnote-entry", 4);
    expect(el.textContent).toContain("[४]");
    expect(el.textContent).not.toContain("(अज्ञात)");
    const anchor = el.querySelector("a") as HTMLElement;
    expect(anchor).not.toBeNull();
    // Hover on not-in-library opens info popover.
    act(() => {
      anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(popoverEl()).not.toBeNull();
  });
});
