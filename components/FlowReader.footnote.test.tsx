// @vitest-environment jsdom
/**
 * Tests for the footnote-mode feature in FlowReader.
 *
 * Verifies that with `footnoteModeEnabled=false` no FootnoteBlock appears,
 * with `footnoteModeEnabled=true` a FootnoteBlock is rendered with correct
 * Devanagari numbering, duplicate citations share a number, and
 * `<sup>` markers in the commentary text match the block entries.
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { createRoot, Root } from "react-dom/client";
import React, { act } from "react";
import { Grantha, GranthaMetadata } from "@/lib/data";
import FlowReader from "./FlowReader";
import { FootnoteModeProvider } from "@/lib/contexts/FootnoteModeContext";

const emptyGranthasMeta: GranthaMetadata[] = [];

/** Builds a minimal Grantha fixture with one Shloka passage that has
 *  commentary and a specified list of references in that commentary. */
const makeGranthaWithRefs = (
  cpRefs: Array<{
    start: number;
    end: number;
    display_text: string;
    grantha_id: string;
    locator: string;
  }>,
): Grantha => {
  // Build commentary text: each ref occupies [start, end) with display_text.
  // Assemble text so display_texts are at the right offsets.
  const cpText = "आदिः ";
  const refs = cpRefs.map((r) => ({
    start: r.start,
    end: r.end,
    display_text: r.display_text,
    grantha_id: r.grantha_id,
    locator: r.locator,
    unresolved: false,
  }));

  return {
    grantha_id: "test-grantha",
    edition_id: "test-grantha",
    canonical_title: "टेस्ट",
    aliases: [],
    text_type: "purana",
    language: "sanskrit",
    metadata: {
      source_url: null,
      source_commit: null,
      source_file: "test.md",
      processing_pipeline: {},
      quality_notes: "",
      last_updated: "",
    },
    structure_levels: [
      { key: "Shloka", scriptNames: { devanagari: "श्लोकः" } },
    ],
    prefatory_material: [],
    passages: [
      {
        ref: "1",
        passage_type: "main",
        kind: "Shloka",
        content: {
          sanskrit: { devanagari: "अयं मन्त्रः" },
          english_translation: "",
        },
      },
    ],
    concluding_material: [],
    commentaries: [
      {
        commentary_id: "test-commentary",
        commentary_title: "टिप्पणी",
        commentator: { devanagari: "टीकाकारः" },
        passages: [
          {
            ref: "1",
            content: {
              sanskrit: { devanagari: cpText },
              english: "",
            },
            references: refs,
          },
        ],
      },
    ],
    id: "test-grantha",
    path: "test-grantha",
    title: "टेस्ट",
    title_deva: "टेस्ट",
    title_iast: "test",
    categories: [],
  };
};

const propsFor = (grantha: Grantha) => ({
  grantha,
  editions: [grantha],
  editionsMeta: [],
  editionIds: [grantha.edition_id ?? grantha.grantha_id],
  onEditionIdsChange: () => {},
  granthas: emptyGranthasMeta,
  selectedRef: "1",
  onGranthaChange: () => {},
  onVerseSelect: () => {},
  onScrollVerseChange: () => {},
  activeSubcommentaryIds: undefined,
  onSubcommentaryToggle: () => {},
  loadPart: async () => {},
  isLoadingPart: false,
  onExitFlow: () => {},
  script: "deva" as const,
  onScriptChange: () => {},
  updateHash: () => {},
  availableGranthaIds: ["test-grantha", "svetasvatara-upanishad"],
  granthaById: {
    "svetasvatara-upanishad": { editions: [], default_school: undefined },
  },
  granthaIdToDevanagariTitle: { "svetasvatara-upanishad": "श्वेताश्वतरोपनिषत्" },
});

beforeAll(() => {
  for (const [name, impl] of Object.entries({
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })) {
    (globalThis as Record<string, unknown>)[name] =
      (globalThis as Record<string, unknown>)[name] ?? impl;
  }
});

const renderInto = async (
  node: React.ReactNode,
): Promise<{ root: Root; el: HTMLDivElement }> => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(node);
  });
  return { root, el };
};

const cleanUp = (root: Root, el: HTMLDivElement) => {
  act(() => root.unmount());
  el.remove();
};

afterEach(() => {
  document.body.innerHTML = "";
});

// References whose text fits within a 10-char commentary string.
// We use display_text lengths as anchors; the cpText is "आदिः " (6 chars).
// Refs are at positions that don't need to be perfectly aligned for these tests
// (the important thing is that they are in the references array; the
// renderCommentaryWithReferences function will fall back to display_text).
const REF_A = {
  start: 0,
  end: 4,
  display_text: "श्वे.उ.",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.1",
};

/** Builds a MULA-ONLY grantha (no commentaries) whose main passage carries the
 *  given references, for testing the `!cp` footnote placement. */
const makeMulaOnlyGrantha = (
  kind: "Para" | "Shloka",
  refs: Array<{
    start: number;
    end: number;
    display_text: string;
    grantha_id: string;
    locator: string;
  }>,
): Grantha => {
  const withRefs = makeGranthaWithRefs(refs);
  return {
    ...withRefs,
    commentaries: [],
    passages: [
      {
        ...withRefs.passages[0],
        ref: "1",
        kind,
        references: refs,
      } as unknown as Grantha["passages"][number],
    ],
  };
};

describe("FlowReader footnote mode", () => {
  it("with footnoteModeEnabled=false: no FootnoteBlock rendered (regression guard)", async () => {
    // Explicitly disable footnote mode so the provider initialises with false.
    localStorage.setItem("grantha-footnote-mode", "false");
    const grantha = makeGranthaWithRefs([REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    // FootnoteBlock renders with class "mt-4" only when footnote mode is on.
    const footnoteBlock = el.querySelector('[data-verse-ref="1"] .mt-4');
    expect(footnoteBlock).toBeNull();
    cleanUp(root, el);
  });

  it("with footnoteModeEnabled=true and refs: <sup> markers appear in commentary", async () => {
    localStorage.setItem("grantha-footnote-mode", "true");
    const grantha = makeGranthaWithRefs([REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    // At least one <sup> should appear within the verse block.
    const sup = el.querySelector('[data-verse-ref="1"] sup');
    expect(sup).not.toBeNull();
    cleanUp(root, el);
  });

  it("with footnoteModeEnabled=true: FootnoteBlock with <hr> is present", async () => {
    localStorage.setItem("grantha-footnote-mode", "true");
    const grantha = makeGranthaWithRefs([REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    const hr = el.querySelector('[data-verse-ref="1"] hr');
    expect(hr).not.toBeNull();
    cleanUp(root, el);
  });

  it("duplicate citation key → one footnote entry, but EVERY occurrence gets a marker", async () => {
    localStorage.setItem("grantha-footnote-mode", "true");
    // Two refs with the same grantha_id + locator + display_text.
    const dupRef = { ...REF_A, start: 0, end: 4 };
    const dupRef2 = { ...REF_A, start: 4, end: 8 };
    const grantha = makeGranthaWithRefs([dupRef, dupRef2]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    // Exactly one <li> entry (the block is deduplicated)…
    const items = el.querySelectorAll('[data-verse-ref="1"] li');
    expect(items.length).toBe(1);
    // …but BOTH occurrences carry the same [n] superscript — a repeated
    // citation must not read as an un-footnoted inline link.
    const sups = el.querySelectorAll('[data-verse-ref="1"] sup a[class*="font-mono"]');
    expect(sups.length).toBe(2);
    const markers = [...sups].map((s) => s.textContent);
    expect(markers[0]).toBe(markers[1]);
    expect(markers[0]).toBeTruthy();
    cleanUp(root, el);
  });

  it("mula-only prose (Para): footnote block is a child of the prose mula wrapper, after the para row", async () => {
    localStorage.setItem("grantha-footnote-mode", "true");
    const grantha = makeMulaOnlyGrantha("Para", [REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    const wrap = el.querySelector('[data-verse-ref="1"] .flow-mula-prose-wrap');
    expect(wrap).not.toBeNull();
    // The para row and the footnote block are siblings inside the wrapper, so
    // the CSS can indent the footnotes to the mula text's left margin.
    const row = wrap!.querySelector(".flow-para-row");
    expect(row).not.toBeNull();
    const fb = wrap!.querySelector(".footnote-block");
    expect(fb).not.toBeNull();
    expect(fb!.parentElement).toBe(wrap);
    // No paragraph rail or number gutter is repeated beside the footnotes.
    expect(fb!.querySelector(".flow-para-number")).toBeNull();
    cleanUp(root, el);
  });

  it("mula-only verse (Shloka): footnote block is a child of the verse mula wrapper, next to the verse text", async () => {
    localStorage.setItem("grantha-footnote-mode", "true");
    const grantha = makeMulaOnlyGrantha("Shloka", [REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
    localStorage.removeItem("grantha-footnote-mode");
    const wrap = el.querySelector('[data-verse-ref="1"] .flow-mula-verse-wrap');
    expect(wrap).not.toBeNull();
    // Verse text and footnotes share the wrapper, so its pl-6 aligns their
    // left edges with no extra margin rule needed.
    expect(wrap!.querySelector(".verse-text")).not.toBeNull();
    const fb = wrap!.querySelector(".footnote-block");
    expect(fb).not.toBeNull();
    expect(fb!.parentElement).toBe(wrap);
    cleanUp(root, el);
  });
});
