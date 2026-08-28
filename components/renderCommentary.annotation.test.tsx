// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";
import fs from "fs";
import { renderCommentaryWithReferences, renderMulaWithReferences } from "./renderCommentary";
import { CitationPanelHost } from "./CitationPanel";
import { selectionToOffset } from "@/lib/selectionToOffset";
import { stripMarkdownInline } from "@/lib/stringUtils";
import type { Reference } from "@/lib/data";

// jsdom has no ResizeObserver.
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
const PARA17 = DATA.passages.find((x: { ref: string }) => x.ref === "17");

const context = {
  currentGranthaId: "vedarthasangraha",
  sourcePassageRef: "1",
  updateHash: () => {},
  availableGranthaIds: [],
  granthaById: {},
  granthaIdToTitle: {},
};

const wrap = (node: React.ReactNode) => (
  <CitationPanelHost className="h-full" surfaceKey="k">
    {node}
  </CitationPanelHost>
);

function renderToDom(node: React.ReactNode): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(wrap(node));
  });
  return el;
}

const normWs = (s: string): string => s.replace(/\u00A0/g, " ");

/** Every annotated span must be consistent with the raw passage it slices:
 *  its [start,end) raw slice, markdown-stripped and NBSP-normalized, equals the
 *  span's own text content (modulo the quote glyphs the renderer inserts). */
function assertAnnotatedSpansConsistent(
  el: HTMLDivElement,
  rawPassage: string,
): void {
  const spans = el.querySelectorAll("[data-offset-start]");
  expect(spans.length).toBeGreaterThan(0);
  spans.forEach((s) => {
    const start = Number(s.getAttribute("data-offset-start"));
    const end = Number(s.getAttribute("data-offset-end"));
    expect(Number.isInteger(start)).toBe(true);
    expect(Number.isInteger(end)).toBe(true);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(end).toBeLessThanOrEqual(rawPassage.length);
    const rawSlice = rawPassage.slice(start, end);
    const expected = stripMarkdownInline(rawSlice).replace(/\u00A0/g, " ").trim();
    const actual = (s.textContent ?? "").replace(/\u00A0/g, " ").trim();
    // Quote glyphs (“ ”) and the NBSP glue are the only renderer insertions
    // beyond markdown stripping — strip them for the equality.
    const cleanActual = actual.replace(/[“”]/g, "").trim();
    expect(cleanActual).toBe(expected);
  });
}

describe("renderer offset annotation (on-disk vedarthasangraha)", () => {
  it("annotates commentary prose segments with raw data-offset bounds", () => {
    const raw = PARA1.content.sanskrit.devanagari;
    const refs: Reference[] = PARA1.references;
    const el = renderToDom(
      renderCommentaryWithReferences(raw, refs, context),
    );
    assertAnnotatedSpansConsistent(el, raw);
    el.remove();
  });

  it("annotates mula prose segments (with verse-quotes) with raw offsets", () => {
    const raw = PARA17.content.sanskrit.devanagari;
    const refs: Reference[] = PARA17.references;
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, PARA17.verse_quotes),
    );
    assertAnnotatedSpansConsistent(el, raw);
    el.remove();
  });

  it("maps a DOM selection over rendered mula back to the correct raw offsets", () => {
    const raw = PARA1.content.sanskrit.devanagari;
    const refs: Reference[] = PARA1.references;
    const el = renderToDom(
      renderMulaWithReferences(raw, refs, context, undefined),
    );
    // Pick the first annotated span and select its middle 8 visible chars.
    const span = el.querySelector("[data-offset-start]") as HTMLElement;
    const tn = span.firstChild as Text;
    const visible = tn.textContent ?? "";
    if (visible.length < 12) {
      el.remove();
      return; // span too short to select meaningfully
    }
    const selStart = Math.floor(visible.length / 2) - 4;
    const selEnd = selStart + 8;
    const range = document.createRange();
    range.setStart(tn, selStart);
    range.setEnd(tn, selEnd);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const r = selectionToOffset({
      range,
      passageRaw: raw,
      annotatedSelector: "[data-offset-start]",
    });
    const selected = normWs(range.toString());
    expect(raw.slice(r.start, r.end)).toBe(selected);
    expect(r.source).toBe("exact");
    sel.removeAllRanges();
    el.remove();
  });
});
