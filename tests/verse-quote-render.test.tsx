// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { renderMulaWithReferences } from "@/components/renderCommentary";
import { CitationPanelHost } from "@/components/CitationPanel";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";
import fs from "fs";

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

const context = {
  currentGranthaId: "vedarthasangraha",
  sourcePassageRef: "52",
  updateHash: () => {},
  availableGranthaIds: [],
  granthaById: {},
  granthaIdToTitle: {},
};

function render(node: React.ReactNode): string {
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
  return el.innerHTML;
}

describe("verse-quote rendering (on-disk vedarthasangraha)", () => {
  it("renders verse-quote blocks hang-indented with pāda sub-indents", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "52");
    const text = p.content.sanskrit.devanagari;
    const vq = p.verse_quotes;
    const refs = p.references;
    const html = render(
      <div>{renderMulaWithReferences(text, refs, context, vq)}</div>
    );
    // verse-quote blocks present
    expect(html).toContain('class="verse-quote"');
    // pādas are separate spans
    expect(html).toContain('class="verse-pada"');
    // merged run has multiple verses in one block
    const block = html.split('class="verse-quote"')[1];
    expect(block).toContain("विद्या कर्मसंज्ञान्या तृतीया शक्तिरिष्यते");
    expect(block).toContain("संसारतापानखिलानवाप्नोत्यतिसंततान्");
    // refs render as links inside the block
    expect(block).toContain("वि. पु. ६.७.६२");
  });

  it("renders refs on a verse's last pāda as links (para 48)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "48");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    for (const ref of ["भ. गी. १५.१६", "भ. गी. १५.१७", "भ. गी. १०.३"]) {
      // the ref must appear inside a link element, not as bare text
      expect(html).toContain('class="reference-link external-reference"');
      expect(html).toContain(`>${ref}</a>`);
    }
  });

  it("renders refs on a verse's last pāda as links (para 49)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "49");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    for (const ref of ["वि. पु. ६.५.७२", "वि. पु. ६.५.७९", "वि. पु. ६.५.७६", "वि. पु. ६.५.७७", "वि. पु. १.२२.५५", "वि. पु. ४.३८"]) {
      expect(html).toContain(`>${ref}</a>`);
    }
  });

  it("source-highlights the quoted verse text inside a verse-quote block (para 48)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "48");
    const dev = p.content.sanskrit.devanagari;
    // The 15.16 verse text (before its ref) spans absolute offsets [131, 175).
    const quoteText = dev.slice(131, 175);
    const ctx = {
      ...context,
      sourcePassageRef: "48",
      sourceHighlight: { passageRef: "48", span: { start: 131, end: 175 } },
    };
    const html = render(
      <div>{renderMulaWithReferences(dev, p.references, ctx, p.verse_quotes)}</div>
    );
    expect(html).toContain('class="citation-source-mark"');
    expect(html).toContain(quoteText);
  });
});
