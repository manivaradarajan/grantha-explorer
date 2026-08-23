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

import { describe, it, expect, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { Reference } from "@/lib/data";
import { renderCommentaryWithReferences, renderMulaWithReferences } from "./renderCommentary";
import { CitationPanelHost } from "./CitationPanel";

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
});

afterEach(() => {
  document.body.innerHTML = "";
});
