// @vitest-environment jsdom
/**
 * Trigger behavior of `ReferenceLink` under the floating citation popover.
 *
 * The link is a real focusable control: hover peeks after a short delay; click
 * pins; not-in-library refs still open (showing "not available") and are
 * diagnostic-logged; unresolved refs stay plain text. Focus on the link opens
 * the pinned popover (keyboard path).
 */

import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const LINKABLE_REF: Reference = {
  start: 0,
  end: 1,
  display_text: "श्वे.उ. १.९",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.9",
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

const HOVER_OPEN_MS = 150;

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  globalThis.fetch = readJsonAsset as unknown as typeof fetch;
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
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

const renderLink = (reference: Reference, sourceLookback?: string) =>
  act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        <ReferenceLink reference={reference} sourceLookback={sourceLookback} {...BASE_PROPS} />
      </CitationPanelHost>,
    );
  });

const linkEl = () => el.querySelector(".reference-link") as HTMLElement;
const popoverEl = () => document.querySelector(".citation-popover");

describe("ReferenceLink — floating citation popover trigger", () => {
  it("opens the pinned popover on click", async () => {
    await renderLink(LINKABLE_REF);
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(popoverEl()).not.toBeNull();
    expect(popoverEl()!.querySelector(".citation-title")!.textContent).toContain("श्वेताश्वतरोपनिषत्");
  });

  it("hover peeks after the delay (not instantly)", async () => {
    await renderLink(LINKABLE_REF);
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOVER_OPEN_MS - 30);
    });
    expect(popoverEl()).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(popoverEl()).not.toBeNull();
  });

  it("opens a pinned popover for a not-in-library reference — no buttons, no status, no title action", async () => {
    const ref: Reference = { ...LINKABLE_REF, grantha_id: "panini-sutra", display_text: "पा. सू." };
    await renderLink(ref);
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const pop = popoverEl();
    expect(pop).not.toBeNull();
    // No navigation destination → no footer actions, no title button/arrow.
    expect(pop!.querySelector(".citation-footer")).toBeNull();
    expect(pop!.querySelector(".citation-action")).toBeNull();
    expect(pop!.querySelector(".citation-title-action")).toBeNull();
    expect(pop!.querySelector(".citation-title-static")).not.toBeNull();
    // No "not available in library" status line, and no body/preview at all.
    expect(pop!.textContent).not.toContain("not available");
    expect(pop!.querySelector(".citation-body")).toBeNull();
    expect(pop!.textContent).not.toContain("loading");
    // No source-text mark for a non-resolvable reference.
    expect(document.querySelector("mark.citation-source-mark")).toBeNull();
    // Title and locator are separated (flex gap renders a space between them).
    const staticEl = pop!.querySelector(".citation-title-static")!;
    expect(staticEl.querySelector(".citation-locator")).not.toBeNull();
  });

  it("renders unresolved references as plain text (never a link)", async () => {
    const ref: Reference = { ...LINKABLE_REF, grantha_id: null, unresolved: true };
    await renderLink(ref);
    expect(linkEl()).toBeNull();
    expect(el.querySelector(".reference-unresolved")).not.toBeNull();
  });

  it("is keyboard-focusable and pins on focus", async () => {
    await renderLink(LINKABLE_REF);
    expect(linkEl().getAttribute("href")).toBe("#svetasvatara-upanishad:1.9");
    act(() => {
      linkEl().focus();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(popoverEl()).not.toBeNull();
  });

  it("a real click that follows focus pins instead of navigating (regression)", async () => {
    // A real mouse click focuses the element (mousedown → focus → mouseup →
    // click). The focus pins the popover; the FIRST click must consume that
    // pin and stay put — not navigate (which the pre-fix code did).
    await renderLink(LINKABLE_REF);
    act(() => {
      linkEl().focus(); // focus pins
    });
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Popover stays pinned, no navigation.
    expect(popoverEl()).not.toBeNull();
    expect(BASE_PROPS.updateHash).not.toHaveBeenCalled();
    // A genuine second click now navigates.
    act(() => {
      linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(BASE_PROPS.updateHash).toHaveBeenCalledWith("svetasvatara-upanishad", "1.9", undefined);
  });

  it("on desktop the first click follows the link (navigates)", async () => {
    // Desktop = fine pointer + hover. Override matchMedia so the link takes
    // the desktop path: hover peeks, and a click navigates instead of pinning.
    const real = window.matchMedia;
    window.matchMedia = ((query: string): MediaQueryList =>
      ({
        matches: query.includes("hover: hover"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
    try {
      await renderLink(LINKABLE_REF);
      act(() => {
        linkEl().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await act(async () => {
        await Promise.resolve();
      });
      // Navigated, no popover pinned.
      expect(BASE_PROPS.updateHash).toHaveBeenCalledWith("svetasvatara-upanishad", "1.9", undefined);
      expect(popoverEl()).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });
});
