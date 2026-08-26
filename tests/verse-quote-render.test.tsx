// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { renderMulaWithReferences } from "@/components/renderCommentary";
import { CitationPanelHost } from "@/components/CitationPanel";
import { buildSourceWindow, findQuotedSpan } from "@/lib/quotedMatch";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";
import fs from "fs";

// The cited bhagavad-gita 10.10 passage (from part11.json), used to derive the
// whole-verse source highlight in the para-125 test.
const GITA_PASSAGE_10_10 =
  "तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम्&nbsp;।\nददामि बुद्धियोगं तं येन मामुपयान्ति ते";

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
    // the first verse-quote block holds the अविद्या … यथा क्षेत्रशक्तिः ॥ run
    const block = html.split('class="verse-quote"')[1];
    expect(block).toContain("विद्या कर्मसंज्ञान्या तृतीया शक्तिरिष्यते");
    expect(block).toContain("यथा क्षेत्रशक्तिः सा वेष्टिता नृप सर्वगा ॥");
    // refs render as links inside the block
    expect(block).toContain("वि.पु. ६.७.६२");
  });

  it("renders differently-cited consecutive verses as SEPARATE quote blocks (para 52)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "52");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    const quoteDivs = html.split('class="verse-quote"').length - 1;
    // 3 distinct quotes: अविद्या …(६.७.६२), संसारतापान …(६.७.६१), तया …(६.७.६३)
    expect(quoteDivs).toBe(3);
    // संसारतापान …(६.७.६१) must be its OWN verse-quote, not inside the first block
    const second = html.split('class="verse-quote"')[2];
    expect(second).toContain("संसारतापानखिलानवाप्नोत्यतिसंततान् ॥");
    expect(second).toContain(">वि.पु. ६.७.६१</a>");
  });

  it("renders a standalone single-danda pāda as its own quote block (para 48)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "48");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    // कालं च पचते … (म.भा.शा. १९६.९) is a verse-quote block (not prose)
    const quoteDivs = html.split('class="verse-quote"').length - 1;
    expect(quoteDivs).toBe(7);
    expect(html).toContain("कालं च पचते तत्र न कालस्तत्र वै प्रभूः&nbsp;।");
    expect(html).toContain(">म.भा.शा. १९६.९</a>");
  });

  it("renders refs on a verse's last pāda as links (para 48)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "48");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    for (const ref of ["भ.गी. १५.१६", "भ.गी. १५.१७", "भ.गी. १०.३"]) {
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
    for (const ref of ["वि.पु. ६.५.७२", "वि.पु. ६.५.७९", "वि.पु. ६.५.७६", "वि.पु. ६.५.७७", "वि.पु. १.२२.५५", "वि.पु. ४.३८"]) {
      expect(html).toContain(`>${ref}</a>`);
    }
  });

  it("source-highlights the quoted verse text inside a verse-quote block (para 48)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "48");
    const dev = p.content.sanskrit.devanagari;
    // The 15.16 verse text is the pāda line just before its ref offset.
    const ref = p.references.find((r: { display_text: string }) => r.display_text === "भ.गी. १५.१६");
    const lineStart = dev.lastIndexOf("\n", ref.start - 1) + 1;
    const quoteText = dev.slice(lineStart, ref.start);
    const ctx = {
      ...context,
      sourcePassageRef: "48",
      sourceHighlight: { passageRef: "48", span: { start: lineStart, end: ref.start } },
    };
    const html = render(
      <div>{renderMulaWithReferences(dev, p.references, ctx, p.verse_quotes)}</div>
    );
    expect(html).toContain('class="citation-source-mark"');
    expect(html).toContain(quoteText);
  });

  it("highlights the WHOLE verse for a ref at its end (para 125, भ.गी. १०.१०)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "125");
    const dev = p.content.sanskrit.devanagari;
    const ref = p.references.find((r: { locator: string; grantha_id: string }) => r.locator === "10.10" && r.grantha_id === "bhagavad-gita");
    const vq = p.verse_quotes.find((v: { start: number; end: number }) => ref.start >= v.start && ref.end <= v.end);
    // The verse-quote block's whole-verse lookback (what renderVerseQuote passes
    // to the citation link) is the full 2-pāda verse, so a highlight derived
    // from it covers BOTH pādas —&nbsp;not just the last one.
    const block = dev.slice(vq.start, vq.end);
    const blockOffset = vq.start;
    const w = buildSourceWindow(block, ref.start - blockOffset);
    expect(w.text).toContain("तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम्");
    expect(w.text).toContain("ददामि बुद्धियोगं तं येन मामुपयान्ति ते");

    const span = findQuotedSpan(w.text, GITA_PASSAGE_10_10);
    expect(span).not.toBeNull();
    const sourceWindowStart = blockOffset + w.start;
    const ctx = {
      ...context,
      sourcePassageRef: "125",
      sourceHighlight: {
        passageRef: "125",
        span: { start: sourceWindowStart + span!.sourceStart, end: sourceWindowStart + span!.sourceEnd },
      },
    };
    const html = render(
      <div>{renderMulaWithReferences(dev, p.references, ctx, p.verse_quotes)}</div>
    );
    // the mark spans both pādas of the verse
    expect(html).toContain("तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम्");
    expect(html).toContain("ददामि बुद्धियोगं तं येन मामुपयान्ति ते");
    const marks = Array.from(
      new DOMParser().parseFromString(html, "text/html").querySelectorAll("mark.citation-source-mark"),
    ).map((m) => m.textContent ?? "");
    const allMarked = marks.join(" ");
    expect(allMarked).toContain("तेषां सततयुक्तानां भजतां प्रीतिपूर्वकम्");
    expect(allMarked).toContain("ददामि बुद्धियोगं तं येन मामुपयान्ति ते");
  });

  it("normalizes unit boundaries to a single blank line (para 125)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "125");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, p.verse_quotes)}</div>
    );
    // The lead-in prose is followed by exactly ONE blank-line separator, then
    // the first verse-quote —&nbsp;never \n\n\n.
    const lead = html.split('class="flow-mula-prose"')[1];
    expect(lead).toContain("यथोक्तं भगवता —");
    // 3 adjacent verse-quotes, separated ONLY by the CSS --quote-gap margin:
    // no blank-line separator is emitted BETWEEN them. So the prose divs are
    // just the lead separator + the trailing separator = 2.
    const quoteDivs = html.split('class="verse-quote"').length - 1;
    expect(quoteDivs).toBe(3);
    const sepDivs = html.split('class="flow-mula-prose"').length - 1;
    expect(sepDivs).toBe(2);
    // no run of 3+ newlines anywhere (the old \n\n\n artifact)
    expect(/\n{3,}/.test(html)).toBe(false);
  });
});

describe("own-verses (<!-- verse -->) rendering", () => {
  it("renders the work's own verses with the verse-own class (para 134)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const p = d.passages.find((x: { ref: string }) => x.ref === "134");
    const html = render(
      <div>{renderMulaWithReferences(p.content.sanskrit.devanagari, p.references, context, undefined, p.verses)}</div>
    );
    // the authored verse renders as a verse-own block
    expect(html).toContain('class="verse-quote verse-own"');
    expect(html).toContain("वेदवित्प्रवरप्रोक्तवाक्यन्यायोपबृंहिताः");
    expect(html).toContain("वेदाः साङ्गा हरिं प्राहुर्जगज्जन्मादिकारणम्");
  });

  it("renders prefatory maṅgala with the verse-own class (passage 0.2)", () => {
    const d = JSON.parse(fs.readFileSync("public/data/library/vedarthasangraha/part1.json", "utf-8"));
    const item = d.prefatory_material.find((x: { ref: string }) => x.ref === "0.2");
    const html = render(
      <div>{renderMulaWithReferences(item.content.sanskrit.devanagari, undefined, context, undefined, item.verses)}</div>
    );
    expect(html).toContain('class="verse-quote verse-own"');
    expect(html).toContain("अशेषचिदचिद्वस्तुशेषिणे शेषशायिने");
  });
});
