// @vitest-environment jsdom
/**
 * Render regression tests for `renderCommentaryWithReferences` (plan §7).
 *
 * The commentary renderer splits the RAW devanagari at each reference's
 * half-open [start, end) and applies markdown/DOMPurify per segment. These
 * tests pin: correct offset splitting, unresolved references rendering as
 * plain text (never a link), not-in-library references rendering as
 * external-reference links, and the acceptable behavior when a bold pair
 * would straddle a citation boundary (no crash; markers render literally).
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { Reference } from "@/lib/data";
import { renderCommentaryWithReferences, renderMulaWithReferences } from "./renderCommentary";
import { CitationPanelHost } from "./CitationPanel";

// jsdom has no ResizeObserver (the citation popover repositions on resize).
beforeAll(() => {
  const RO = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as Record<string, unknown>).ResizeObserver =
    (globalThis as Record<string, unknown>).ResizeObserver ?? RO;
});

/** Wrap the rendered output in a CitationPanelHost so ReferenceLinks can open
 *  the citation panel (matches the real surfaces' mounting). */
const wrap = (node: React.ReactNode) => (
  <CitationPanelHost className="h-full" surfaceKey="k">
    {node}
  </CitationPanelHost>
);

const container = (): HTMLDivElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

const context = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: ["svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
};

const cleanUp = (root: Root, el: HTMLDivElement) => {
  root.unmount();
  el.remove();
};

describe("renderCommentaryWithReferences", () => {
  it("splits raw text at reference offsets and emits a link", () => {
    const text = "इति (श्वे. उ. १.९) उक्तम्";
    const refs: Reference[] = [
      {
        start: 5,
        end: 17,
        display_text: "श्वे. उ. १.९",
        grantha_id: "svetasvatara-upanishad",
        locator: "1.9",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
        // Empty target metadata → not linkable → renders as external.
        granthaById: {},
      }))
      );
    });
    expect(el.querySelector(".reference-link")).not.toBeNull();
    expect(el.querySelector(".reference-link")?.textContent).toBe("श्वे. उ. १.९");
    expect(el.querySelector(".external-reference")).not.toBeNull();
    cleanUp(root, el);
  });

  it("renders an unresolved reference as plain text, never a link", () => {
    const text = "इति (बघ. च. १.२.३) उक्तम्";
    const refs: Reference[] = [
      {
        start: 5,
        end: 17,
        display_text: "बघ. च. १.२.३",
        grantha_id: null,
        locator: null,
        unresolved: true,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
      root.render(wrap(renderCommentaryWithReferences(text, refs, context)));
    });
    expect(el.querySelector(".reference-link")).toBeNull();
    expect(el.querySelector(".reference-unresolved")?.textContent).toBe("बघ. च. १.२.३");
    cleanUp(root, el);
  });

  it("renders a not-in-library reference as an external link", () => {
    const text = "इति (श्वे. उ. १.९) उक्तम्";
    const refs: Reference[] = [
      {
        start: 5,
        end: 17,
        display_text: "श्वे. उ. १.९",
        grantha_id: "svetasvatara-upanishad",
        locator: "1.9",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
        // Empty target metadata → not linkable → renders as external.
        granthaById: {},
      }))
      );
    });
    expect(el.querySelector(".reference-link")).not.toBeNull();
    expect(el.querySelector(".external-reference")).not.toBeNull();
    cleanUp(root, el);
  });

  it("renders a bold pair straddling a citation without crashing", () => {
    // A `**…**` pair whose close marker falls inside the citation span. The
    // per-segment transform cannot pair the markers, so they render literally
    // (accepted pilot behavior — no pilot citation actually straddles bold).
    const text = "**क्रतो (श्वे. उ. १.९)**";
    const refs: Reference[] = [
      {
        start: 9,
        end: 21,
        display_text: "श्वे. उ. १.९",
        grantha_id: "svetasvatara-upanishad",
        locator: "1.9",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      }))
      );
    });
    expect(el.querySelector(".reference-link")?.textContent).toBe("श्वे. उ. १.९");
    cleanUp(root, el);
  });

  it("renders a whole-work reference as a link to the root", () => {
    const text = "इति (शत. ब्रा.) उक्तम्";
    const refs: Reference[] = [
      {
        start: 5,
        end: 14,
        display_text: "शत. ब्रा.",
        grantha_id: "shatapatha-brahmana",
        locator: null,
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      }))
      );
    });
    expect(el.querySelector(".reference-link")).not.toBeNull();
    expect(el.querySelector(".reference-link")?.textContent).toBe("शत. ब्रा.");
    cleanUp(root, el);
  });

  it("marks the quoted span in the source passage while its citation is open", async () => {
    // The bhashya quotes the cited verse in markdown bold, then the locator —
    // exactly the corpus shape. Opening the citation must steel-blue-mark the
    // quote in the source text (via the host's render-prop highlight).
    const text = "स च **ज्ञाज्ञौ द्वावजावीशनीशौ** (श्वे. उ. १.९) इत्यादि";
    const refs: Reference[] = [
      {
        start: text.indexOf("श्वे"),
        end: text.indexOf("श्वे") + "श्वे. उ. १.९".length,
        display_text: "श्वे. उ. १.९",
        grantha_id: "svetasvatara-upanishad",
        locator: "1.9",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
      root.render(
        <CitationPanelHost className="h-full" surfaceKey="k">
          {(sourceHighlight) =>
            renderCommentaryWithReferences(text, refs, { ...context, sourceHighlight })
          }
        </CitationPanelHost>,
      );
    });
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
    });
    const mark = el.querySelector("mark.citation-source-mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toContain("ज्ञाज्ञौ द्वावजावीशनीशौ");
    cleanUp(root, el);
  });
});

describe("renderMulaWithReferences", () => {
  it("splits raw mula at offsets and wraps references as links", () => {
    const text = "तदाह (बृ. उ. १.४.१७) इति ।";
    const refs: Reference[] = [
      {
        start: 6,
        end: 19,
        display_text: "बृ. उ. १.४.१७",
        grantha_id: "brihadaranyaka-upanishad",
        locator: "1.4.17",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderMulaWithReferences(text, refs, {
        ...context,
        availableGranthaIds: ["brihadaranyaka-upanishad"],
      }))
      );
    });
    expect(el.querySelector(".reference-link")?.textContent).toBe("बृ. उ. १.४.१७");
    expect(el.textContent).toContain("तदाह");
    expect(el.textContent).toContain("इति ।");
    cleanUp(root, el);
  });

  it("strips markdown per segment without shifting offsets", () => {
    // A citation preceded by a `**…**` pair; offsets are into the RAW string.
    // "**अथ** " = 0..7, then `(` at 7, `बृ` at 8; "बृ. उ. १.४.१७" = 13 chars → 8..21.
    const text = "**अथ** (बृ. उ. १.४.१७) इति ।";
    const refs: Reference[] = [
      {
        start: 8,
        end: 21,
        display_text: "बृ. उ. १.४.१७",
        grantha_id: "brihadaranyaka-upanishad",
        locator: "1.4.17",
        unresolved: false,
      },
    ];
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderMulaWithReferences(text, refs, {
        ...context,
        availableGranthaIds: ["brihadaranyaka-upanishad"],
      }))
      );
    });
    expect(el.querySelector(".reference-link")?.textContent).toBe("बृ. उ. १.४.१७");
    expect(el.textContent).toContain("अथ");
    cleanUp(root, el);
  });

  it("renders plain mula when there are no references", () => {
    const el = container();
    const root = createRoot(el);
    act(() => {
        root.render(
      wrap(renderMulaWithReferences("अथातो ब्रह्मजिज्ञासा ।", undefined, context))
      );
    });
    expect(el.textContent).toBe("अथातो ब्रह्मजिज्ञासा ।");
    cleanUp(root, el);
  });

  it("toggling the source highlight does NOT change the rendered text", () => {
    // The real para-1 shape: a segment with a line break and spaces between two
    // citations. Opening the citation popover sets `sourceHighlight`, which
    // re-slices the segment around the quoted phrase and wraps it in a
    // `<mark>`. The TEXT must stay byte-identical — trimming the re-sliced
    // parts would eat the `\n`/space at the boundaries, reflow the paragraph,
    // and (by moving the hovered link out from under the cursor) close the
    // hover. This is a regression pin for that bug.
    // raw: "') ।\nअयमात्मा ब्रह्म ।\n(" then the citation "(बृ.उ.६.४.५)".
    const text = "') ।\nअयमात्मा ब्रह्म ।\n(बृ.उ.६.४.५)'";
    const refs: Reference[] = [
      {
        start: 22,
        end: 34,
        display_text: "बृ.उ.६.४.५",
        grantha_id: "brihadaranyaka-upanishad",
        locator: "6.4.5",
        unresolved: false,
      },
    ];
    // The quoted phrase "अयमात्मा ब्रह्म" spans raw offsets 5..19.
    const highlight = {
      passageRef: "1",
      span: { start: 5, end: 19 },
    };

    const renderWith = (sourceHighlight: typeof highlight | null): string => {
      const el = container();
      const root = createRoot(el);
      act(() => {
        root.render(
          wrap(renderMulaWithReferences(text, refs, {
            ...context,
            sourcePassageRef: "1",
            sourceHighlight,
            availableGranthaIds: ["brihadaranyaka-upanishad"],
          })),
        );
      });
      const out = el.textContent ?? "";
      cleanUp(root, el);
      return out;
    };

    const closed = renderWith(null);
    const open = renderWith(highlight);
    expect(open).toBe(closed);
    expect(closed).toContain("अयमात्मा ब्रह्म");
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
