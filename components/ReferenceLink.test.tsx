// @vitest-environment jsdom
/**
 * Trigger behavior of `ReferenceLink` under the docked citation-panel design.
 *
 * The link is now a pure click/tap trigger: clicking opens the citation panel
 * (via the surrounding `CitationPanelHost`); there is NO hover-to-reveal.
 * Unresolved references stay plain text; not-in-library references still open
 * a panel explaining "not available" and are diagnostic-logged.
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

const LINKABLE_REF: Reference = {
  start: 0,
  end: 1,
  display_text: "श्वे. उ. १.९",
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

let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  globalThis.fetch = readJsonAsset as unknown as typeof fetch;
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
  vi.clearAllMocks();
});

const renderLink = (reference: Reference, sourceLookback?: string) =>
  act(async () => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        <ReferenceLink reference={reference} sourceLookback={sourceLookback} {...BASE_PROPS} />
      </CitationPanelHost>,
    );
  });

describe("ReferenceLink — docked citation panel trigger", () => {
  it("opens the citation panel on click", async () => {
    await renderLink(LINKABLE_REF);
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector(".citation-panel.is-open")).not.toBeNull();
    expect(document.querySelector(".citation-source-title")!.textContent).toContain("श्वेताश्वतरोपनिषत्");
  });

  it("does NOT open on hover", async () => {
    await renderLink(LINKABLE_REF);
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    act(() => {
      link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector(".citation-panel.is-open")).toBeNull();
  });

  it("opens a panel for a not-in-library reference (linkable=false)", async () => {
    const ref: Reference = { ...LINKABLE_REF, grantha_id: "panini-sutra", display_text: "पा. सू." };
    await renderLink(ref);
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector(".citation-panel.is-open")).not.toBeNull();
  });

  it("renders unresolved references as plain text (never a link)", async () => {
    const ref: Reference = { ...LINKABLE_REF, grantha_id: null, unresolved: true };
    await renderLink(ref);
    expect(el.querySelector(".reference-link")).toBeNull();
    expect(el.querySelector(".reference-unresolved")).not.toBeNull();
  });

  it("navigates when the panel's source label is clicked", async () => {
    await renderLink(LINKABLE_REF);
    const link = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const source = document.querySelector(".citation-source") as HTMLButtonElement;
    act(() => {
      source.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(BASE_PROPS.updateHash).toHaveBeenCalledWith(
      "svetasvatara-upanishad",
      "1.9",
      undefined,
    );
  });
});
