// @vitest-environment jsdom
/**
 * Behavior of the floating citation popover.
 *
 * Exercises the real content path (getPassagePreview against the committed
 * corpus via a fetch shim): click pins and loads the cited passage; the header
 * renders title + locator; Escape/✕/outside-click/scroll dismiss; the footer
 * copies the citation (mock clipboard) and opens the passage; a second
 * reference updates the single popover in place; the surface-key change
 * closes it; and the quote highlight renders when a matching sourceLookback
 * is supplied. Hover peek + grace are covered by fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { Reference } from "@/lib/data";
import ReferenceLink from "./ReferenceLink";
import { CitationPanelHost } from "./CitationPanel";

const ROOT = path.resolve(__dirname, "..");

function readJsonAsset(url: string): Promise<Response> {
  const pathname = new URL(url, "http://localhost").pathname;
  const abs = path.join(ROOT, "public", "data", pathname.replace(/^\/data\//, ""));
  if (!fs.existsSync(abs)) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(fs.readFileSync(abs, "utf-8"), { status: 200 }));
}

const SVET_REF: Reference = {
  start: 0,
  end: 1,
  display_text: "श्वे. उ. १.९",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.9",
  unresolved: false,
};

const GITA_REF: Reference = {
  start: 0,
  end: 1,
  display_text: "भ. गी. ८.१३",
  grantha_id: "bhagavad-gita",
  locator: "8.13",
  unresolved: false,
};

const BASE_PROPS = {
  currentGranthaId: "isavasya-upanishad",
  sourcePassageRef: "1",
  updateHash: vi.fn(),
  availableGranthaIds: ["svetasvatara-upanishad", "bhagavad-gita"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
    "bhagavad-gita": { editions: [], default_school: undefined },
  },
  granthaIdToTitle: {
    "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्",
    "bhagavad-gita": "भगवद्गीता",
  },
};

const SVET_LOOKBACK = "ि क्तं चिदचिदात्मकम्, **ईशा** — **ज्ञाज्ञौ द्वावजावीशनीशौ** (";
const UNRELATED_LOOKBACK = "इत्यादि प्रसिद्धानन्याधीनैश्वर्यं विवृणोति योsसौ";

const HOVER_OPEN_MS = 150;

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  globalThis.fetch = readJsonAsset as unknown as typeof fetch;
  // jsdom has no ResizeObserver (the popover repositions on size changes).
  const RO = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as Record<string, unknown>).ResizeObserver =
    (globalThis as Record<string, unknown>).ResizeObserver ?? RO;
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
  globalThis.fetch = fetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

interface RenderArgs {
  ref?: Reference;
  sourceLookback?: string;
  surfaceKey?: string;
}

const render = (args: RenderArgs = {}) => {
  const { ref = SVET_REF, sourceLookback, surfaceKey = "k" } = args;
  return act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey={surfaceKey}>
        <ReferenceLink reference={ref} sourceLookback={sourceLookback} {...BASE_PROPS} />
      </CitationPanelHost>,
    );
  });
};

const linkEl = () => el.querySelector(".reference-link") as HTMLElement;
const popoverEl = () => document.querySelector(".citation-popover") as HTMLElement | null;

const clickLink = () => {
  act(() => {
    linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

const hoverLink = () => {
  act(() => {
    linkEl().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
};

const settle = async (ms = 80) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("CitationPopover", () => {
  it("renders nothing until a citation is opened", async () => {
    await render();
    expect(popoverEl()).toBeNull();
  });

  it("opens and loads the cited passage on click", async () => {
    await render();
    clickLink();
    await settle(100);
    const pop = popoverEl();
    expect(pop).not.toBeNull();
    expect(pop!.querySelector(".citation-title")!.textContent).toContain("श्वेताश्वतरोपनिषत्");
    expect(pop!.querySelector(".citation-excerpt")!.textContent).toContain("ज्ञाज्ञौ");
  });

  it("hover peeks after the delay, then closes after the grace unless the popover is entered", async () => {
    await render();
    hoverLink();
    await settle(HOVER_OPEN_MS - 30);
    expect(popoverEl()).toBeNull(); // not instant
    await settle(60);
    expect(popoverEl()).not.toBeNull(); // peek opened
    // Leave the link → close grace begins; entering the popover cancels it.
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    act(() => {
      popoverEl()!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await settle(300);
    expect(popoverEl()).not.toBeNull(); // stayed open (grace cancelled)
  });

  it("closes on ✕ (pinned)", async () => {
    await render();
    clickLink();
    await settle(50);
    const close = popoverEl()!.querySelector(".citation-close") as HTMLButtonElement;
    act(() => close.click());
    expect(popoverEl()).toBeNull();
  });

  it("closes on Escape and restores focus to the reference", async () => {
    await render();
    clickLink();
    await settle(50);
    act(() => {
      linkEl().focus();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(popoverEl()).toBeNull();
    expect(document.activeElement).toBe(linkEl());
  });

  it("navigates via the title action", async () => {
    await render();
    clickLink();
    await settle(50);
    const title = popoverEl()!.querySelector(".citation-title-action") as HTMLButtonElement;
    act(() => title.click());
    await settle(50);
    expect(BASE_PROPS.updateHash).toHaveBeenCalledWith("svetasvatara-upanishad", "1.9", undefined);
  });

  it("copies the citation without closing or navigating", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await render();
    clickLink();
    await settle(50);
    const copy = popoverEl()!.querySelector(".citation-action") as HTMLButtonElement;
    act(() => copy.click());
    await settle(10);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("श्वेताश्वतरोपनिषत्");
    expect(popoverEl()).not.toBeNull(); // not dismissed
    // The button keeps its प्रतिलिपि label; the icon flips to a checkmark.
    expect(popoverEl()!.querySelector(".citation-action")!.textContent).toContain("प्रतिलिपि");
  });

  it("switches content in place when a second citation is clicked", async () => {
    await render();
    clickLink();
    await settle(80);
    await render({ ref: GITA_REF, surfaceKey: "k" });
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle(80);
    const pop = popoverEl();
    expect(pop).not.toBeNull();
    expect(pop!.querySelector(".citation-title")!.textContent).toContain("भगवद्गीता");
    expect(pop!.querySelector(".citation-excerpt")!.textContent).toContain("ओमित्येकाक्षरं ब्रह्म");
    // Still exactly one popover.
    expect(document.querySelectorAll(".citation-popover").length).toBe(1);
  });

  it("dismisses on scroll of the reading surface (after the focus-settle window)", async () => {
    await render();
    clickLink();
    await settle(50);
    expect(popoverEl()).not.toBeNull();
    // A scroll within the opening settle window is suppressed (it's the
    // focus-induced scroll that fires when the anchor is focused).
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(popoverEl()).not.toBeNull();
    // A genuine later scroll (past the settle window) dismisses.
    await settle(400);
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(popoverEl()).toBeNull();
  });

  it("closes when the surfaceKey changes", async () => {
    await render();
    clickLink();
    await settle(50);
    expect(popoverEl()).not.toBeNull();
    await render({ surfaceKey: "k-other" });
    expect(popoverEl()).toBeNull();
  });

  it("renders the quote highlight when sourceLookback matches", async () => {
    await render({ sourceLookback: SVET_LOOKBACK });
    clickLink();
    await settle(100);
    const mark = popoverEl()!.querySelector(".citation-mark");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toContain("ज्ञाज्ञौ");
  });

  it("renders no highlight when sourceLookback does not match", async () => {
    await render({ sourceLookback: UNRELATED_LOOKBACK });
    clickLink();
    await settle(100);
    expect(popoverEl()!.querySelector(".citation-mark")).toBeNull();
  });
});
