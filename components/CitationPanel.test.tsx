// @vitest-environment jsdom
/**
 * Behavior of the docked citation panel.
 *
 * Exercises the real content path (getPassagePreview against the committed
 * corpus via a fetch shim): open loads the cited passage, the header renders
 * title + locator + close, ✕ closes, the source label navigates, a second
 * citation switches content, the panel closes on a surface-key change, and
 * the quote highlight renders when a matching sourceLookback is supplied.
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

/** The Desika source window before the Śvet 1.9 citation (from the corpus). */
const SVET_LOOKBACK = "ि क्तं चिदचिदात्मकम्, **ईशा** — **ज्ञाज्ञौ द्वावजावीशनीशौ** (";
const UNRELATED_LOOKBACK = "इत्यादि प्रसिद्धानन्याधीनैश्वर्यं विवृणोति योsसौ";

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

interface RenderArgs {
  ref?: Reference;
  sourceLookback?: string;
  surfaceKey?: string;
  onExpandedChange?: (open: boolean) => void;
}

const render = (args: RenderArgs = {}) => {
  const {
    ref = SVET_REF,
    sourceLookback,
    surfaceKey = "k",
    onExpandedChange,
  } = args;
  return act(async () => {
    root.render(
      <CitationPanelHost
        className="h-full"
        surfaceKey={surfaceKey}
        onExpandedChange={onExpandedChange}
      >
        <ReferenceLink reference={ref} sourceLookback={sourceLookback} {...BASE_PROPS} />
      </CitationPanelHost>,
    );
  });
};

const clickLink = () => {
  const link = el.querySelector(".reference-link") as HTMLElement;
  act(() => {
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};

describe("CitationPanel", () => {
  it("renders nothing until a citation is opened", async () => {
    await render();
    expect(document.querySelector(".citation-panel")).toBeNull();
  });

  it("opens and loads the cited passage", async () => {
    await render();
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(document.querySelector(".citation-panel.is-open")).not.toBeNull();
    expect(document.querySelector(".citation-source-title")!.textContent).toContain("श्वेताश्वतरोपनिषत्");
    const text = document.querySelector(".citation-content-text")!.textContent ?? "";
    expect(text).toContain("ज्ञाज्ञौ");
  });

  it("closes via the ✕ button", async () => {
    await render();
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const close = document.querySelector(".citation-close") as HTMLButtonElement;
    act(() => close.click());
    expect(document.querySelector(".citation-panel.is-open")).toBeNull();
  });

  it("navigates via the source label and closes", async () => {
    await render();
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const source = document.querySelector(".citation-source") as HTMLButtonElement;
    act(() => source.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(BASE_PROPS.updateHash).toHaveBeenCalledWith(
      "svetasvatara-upanishad",
      "1.9",
      undefined,
    );
  });

  it("switches content when a second citation is clicked", async () => {
    await render();
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    // Re-render with a different ref (Gita) and click its link.
    await render({ ref: GITA_REF, surfaceKey: "k" });
    const gitaLink = el.querySelector(".reference-link") as HTMLElement;
    act(() => {
      gitaLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    const text = document.querySelector(".citation-content-text")!.textContent ?? "";
    expect(document.querySelector(".citation-source-title")!.textContent).toContain("भगवद्गीता");
    expect(text).toContain("ओमित्येकाक्षरं ब्रह्म");
  });

  it("closes when the surfaceKey changes", async () => {
    await render();
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.querySelector(".citation-panel.is-open")).not.toBeNull();
    await render({ surfaceKey: "k-other" });
    expect(document.querySelector(".citation-panel.is-open")).toBeNull();
  });

  it("renders the quote highlight when sourceLookback matches", async () => {
    await render({ sourceLookback: SVET_LOOKBACK });
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const mark = document.querySelector(".citation-mark");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toContain("ज्ञाज्ञौ");
  });

  it("renders no highlight when sourceLookback does not match", async () => {
    await render({ sourceLookback: UNRELATED_LOOKBACK });
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(document.querySelector(".citation-mark")).toBeNull();
  });

  it("fires onExpandedChange on open and close", async () => {
    const onExpandedChange = vi.fn();
    await render({ onExpandedChange });
    clickLink();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    const close = document.querySelector(".citation-close") as HTMLButtonElement;
    act(() => close.click());
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
