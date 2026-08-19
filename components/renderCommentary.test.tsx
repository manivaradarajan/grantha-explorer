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
import { Reference } from "@/lib/data";
import { renderCommentaryWithReferences } from "./renderCommentary";

const container = (): HTMLDivElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

const context = {
  currentGranthaId: "isavasya-upanishad",
  updateHash: () => {},
  availableGranthaIds: ["svetasvatara-upanishad"],
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
      renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      })
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
      root.render(renderCommentaryWithReferences(text, refs, context));
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
      renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      })
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
      renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      })
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
      renderCommentaryWithReferences(text, refs, {
        ...context,
        availableGranthaIds: [],
      })
      );
    });
    expect(el.querySelector(".reference-link")).not.toBeNull();
    expect(el.querySelector(".reference-link")?.textContent).toBe("शत. ब्रा.");
    cleanUp(root, el);
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
