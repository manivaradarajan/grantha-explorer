// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";
import fs from "fs";
import { renderMulaWithReferences, ReviewMarkSpec } from "./renderCommentary";
import { CitationPanelHost } from "./CitationPanel";
import type { Reference } from "@/lib/data";

beforeAll(() => {
  const RO = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as Record<string, unknown>).ResizeObserver =
    (globalThis as Record<string, unknown>).ResizeObserver ?? RO;
});

const DATA = JSON.parse(
  fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"),
);
const PARA1 = DATA.passages.find((x: { ref: string }) => x.ref === "1");
const raw = PARA1.content.sanskrit.devanagari as string;
const refs = PARA1.references as Reference[];

const context = {
  currentGranthaId: "vedarthasangraha",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: [],
  granthaById: {},
  granthaIdToTitle: {},
};

function renderToDom(node: React.ReactNode): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
      <CitationPanelHost className="h-full" surfaceKey="k">
        {node}
      </CitationPanelHost>,
    );
  });
  return el;
}

describe("review-mark rendering", () => {
  it("paints a citation-fix mark over its snippet with the right class", () => {
    const snippet = "अशेषजगद्धितानुशासनश्रुतिनिकरशिरसि"; // prose in Para 1
    const idx = raw.indexOf(snippet);
    expect(idx).toBeGreaterThanOrEqual(0);
    const marks: ReviewMarkSpec[] = [
      {
        start: idx,
        end: idx + snippet.length,
        type: "citation-fix",
        status: "open",
        commentId: "c1",
      },
    ];
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, undefined, undefined, marks),
    );
    const mark = el.querySelector("mark.review-mark.k-fix");
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute("data-comment-id")).toBe("c1");
    expect(mark!.textContent).toContain(snippet);
    el.remove();
  });

  it("paints a done note mark with the st-accepted class and a checkmark", () => {
    const snippet = "अशेषजगद्धितानुशासन";
    const idx = raw.indexOf(snippet);
    expect(idx).toBeGreaterThanOrEqual(0);
    const marks: ReviewMarkSpec[] = [
      {
        start: idx,
        end: idx + snippet.length,
        type: "note",
        status: "done",
        commentId: "c2",
        drift: true,
      },
    ];
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, undefined, undefined, marks),
    );
    // Accepted/done marks are not struck through; a green checkmark follows.
    const mark = el.querySelector("mark.review-mark.k-note.st-accepted.drift");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toContain(snippet);
    expect(mark!.classList.contains("st-done")).toBe(false);
    expect(el.querySelector(".review-mark-check")).not.toBeNull();
    el.remove();
  });

  it("does not strike through a fixed mark (live work, full colour)", () => {
    // `fixed` and `reopened` are still being worked; only truly terminal
    // states (accepted/done/dismissed/deleted) dim + strike through.
    const snippet = "अशेषजगद्धितानुशासन";
    const idx = raw.indexOf(snippet);
    const marks: ReviewMarkSpec[] = [
      { start: idx, end: idx + snippet.length, type: "citation-fix", status: "fixed", commentId: "c-x" },
    ];
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, undefined, undefined, marks),
    );
    const mark = el.querySelector("mark.review-mark.k-fix");
    expect(mark).not.toBeNull();
    expect(mark!.classList.contains("st-done")).toBe(false);
    el.remove();
  });

  it("invokes the click handler with the comment id", () => {
    const snippet = "जीवपरमात्मयाथात्म्यज्ञान";
    const idx = raw.indexOf(snippet);
    expect(idx).toBeGreaterThanOrEqual(0);
    let clicked: string | null = null;
    const marks: ReviewMarkSpec[] = [
      {
        start: idx,
        end: idx + snippet.length,
        type: "quote-locate",
        status: "open",
        commentId: "c3",
        onClick: (id) => {
          clicked = id;
        },
      },
    ];
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, undefined, undefined, marks),
    );
    const mark = el.querySelector("mark.review-mark.k-quote") as HTMLElement;
    expect(mark).not.toBeNull();
    act(() => {
      mark.click();
    });
    expect(clicked).toBe("c3");
    el.remove();
  });

  it("renders a review mark spanning across multiple pādas in a verse quote (para 133)", () => {
    const PARA133 = DATA.passages.find((x: { ref: string }) => x.ref === "133");
    const raw133 = PARA133.content.sanskrit.devanagari as string;
    const refs133 = PARA133.references as Reference[];
    const vq133 = PARA133.verse_quotes;
    // Mark spanning both pādas of Śvetāśvatara 3.18 / 4.18 (2004..2119)
    const marks: ReviewMarkSpec[] = [
      {
        start: 2004,
        end: 2119,
        type: "citation-fix",
        status: "open",
        commentId: "c-133",
      },
    ];
    const ctx = { ...context, sourcePassageRef: "133" };
    const el = renderToDom(
      renderMulaWithReferences(raw133, refs133, ctx, vq133, PARA133.verses, marks),
    );
    const markEls = el.querySelectorAll('mark.review-mark[data-comment-id="c-133"]');
    expect(markEls.length).toBeGreaterThanOrEqual(1);
    const combinedText = Array.from(markEls)
      .map((m) => m.textContent)
      .join(" ");
    expect(combinedText).toContain("यदा तमस्तन्न दिवा न रात्रिर्न");
    expect(combinedText).toContain("प्रज्ञा च तस्मात्प्रसृता पुराणी");
    el.remove();
  });
});
