// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderMulaWithReferences } from "@/components/renderCommentary";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import React from "react";
import fs from "fs";

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
  act(() => { root.render(node); });
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
});
