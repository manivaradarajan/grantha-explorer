// @vitest-environment jsdom
/**
 * Interaction tests for `ReferenceLink`'s tooltip hover bridge and "go"
 * affordance.
 *
 * The tooltip must be reachable (pointer-events + a close grace so the cursor
 * can cross the gap and select/copy the passage), and when the reference is
 * linkable the whole header band is a navigate button (arrow-up-right glyph)
 * that jumps to the cited passage. These tests pin: the header button is
 * present only when linkable, clicking it navigates, the close-grace window,
 * re-entering the tooltip cancels a pending close, and an active text
 * selection in the popup prevents it closing mid-copy.
 *
 * The real production resolution path runs against the committed corpus via a
 * fetch shim, so navigation resolves like it does in the app.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { Reference } from "@/lib/data";
import ReferenceLink from "./ReferenceLink";

const ROOT = path.resolve(__dirname, "..");

function readJsonAsset(url: string): Promise<Response> {
  const pathname = new URL(url, "http://localhost").pathname;
  const abs = path.join(ROOT, "public", "data", pathname.replace(/^\/data\//, ""));
  if (!fs.existsSync(abs)) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(fs.readFileSync(abs, "utf-8"), { status: 200 }));
}

const LINKABLE_REF: Reference = {
  start: 0,
  end: 1,
  display_text: "श्वे. उ. १.९",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.9",
  unresolved: false,
};

const NOT_LINKABLE_REF: Reference = {
  ...LINKABLE_REF,
  grantha_id: "panini-sutra",
  display_text: "पा. सू.",
};

const BASE_PROPS = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: vi.fn(),
  availableGranthaIds: ["svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
    // A school-flavored default with no edition → edition-less ref is not linkable.
    "panini-sutra": { editions: [], default_school: "vyakarana" },
  },
  granthaIdToTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
};

const HOVER_DELAY_MS = 400;
const CLOSE_DELAY_MS = 350;

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  globalThis.fetch = readJsonAsset as unknown as typeof fetch;
  // jsdom defines window.ontouchstart, which makes the component treat the
  // test as a touch device and suppress hover. Remove it so hover works.
  delete (window as unknown as Record<string, unknown>).ontouchstart;
  vi.useFakeTimers();
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  el.remove();
  globalThis.fetch = fetch;
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderLink = (reference: Reference) =>
  act(async () => {
    root.render(
      <ReferenceLink reference={reference} sourceLookback="" {...BASE_PROPS} />,
    );
  });

/** Open the tooltip via hover, waiting for the fetch + layout to settle. */
const openTooltip = async () => {
  await renderLink(LINKABLE_REF);
  const link = el.querySelector(".reference-link") as HTMLElement;
  act(() => {
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS + 50);
  });
  return document.querySelector(".reference-tooltip");
};

describe("ReferenceLink tooltip — go affordance", () => {
  it("renders the bottom open link when the ref is linkable", async () => {
    await openTooltip();
    expect(document.querySelector(".tooltip-open")).not.toBeNull();
    expect(document.querySelector(".tooltip-open-link")).not.toBeNull();
    expect(document.querySelector(".tooltip-open-link")!.textContent).toContain("उद्घाटय");
  });

  it("renders no open footer when the ref is not linkable", async () => {
    await renderLink(NOT_LINKABLE_REF);
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOVER_DELAY_MS + 50);
    });
    expect(document.querySelector(".tooltip-open")).toBeNull();
    expect(document.querySelector(".tooltip-meta")).not.toBeNull();
  });

  it("navigates to the cited passage when the open link is clicked", async () => {
    await openTooltip();
    const go = document.querySelector(".tooltip-open-link") as HTMLAnchorElement;
    act(() => {
      go.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    // navigate() is async: loadGrantha → resolveReferenceTarget → updateHash.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(BASE_PROPS.updateHash).toHaveBeenCalledWith(
      "svetasvatara-upanishad",
      "1.9",
      undefined,
    );
  });
});

describe("ReferenceLink tooltip — hover bridge", () => {
  it("does not close immediately on link mouseleave (grace window)", async () => {
    await openTooltip();
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    // Within the 350ms grace the tooltip stays.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSE_DELAY_MS - 50);
    });
    expect(document.querySelector(".reference-tooltip")).not.toBeNull();
    // After the grace expires it closes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(document.querySelector(".reference-tooltip")).toBeNull();
  });

  it("stays open when the cursor re-enters the tooltip during the grace", async () => {
    await openTooltip();
    const link = el.querySelector(".reference-link") as HTMLElement;
    const tip = document.querySelector(".reference-tooltip") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    act(() => {
      tip.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSE_DELAY_MS + 100);
    });
    expect(document.querySelector(".reference-tooltip")).not.toBeNull();
  });

  it("does not close mid-copy when a text selection is active in the tooltip", async () => {
    await openTooltip();
    const link = el.querySelector(".reference-link") as HTMLElement;
    const tip = document.querySelector(".reference-tooltip") as HTMLElement;
    // An active selection anchored inside the tooltip's text.
    const textNode = tip.querySelector(".tooltip-passage")!.firstChild as Node;
    const fakeSelection = { isCollapsed: false, anchorNode: textNode } as unknown as Selection;
    const realGetSelection = window.getSelection;
    vi.spyOn(window, "getSelection").mockReturnValue(fakeSelection);
    try {
      act(() => {
        link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      });
      act(() => {
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(CLOSE_DELAY_MS + 100);
      });
      expect(document.querySelector(".reference-tooltip")).not.toBeNull();
    } finally {
      vi.restoreAllMocks();
      void realGetSelection;
    }
  });
});
