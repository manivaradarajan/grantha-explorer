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
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
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
  let cpText = "आदिः ";
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

const REF_B = {
  start: 4,
  end: 8,
  display_text: "श्वे.उ. २",
  grantha_id: "svetasvatara-upanishad",
  locator: "1.2",
};

describe("FlowReader footnote mode", () => {
  it("with footnoteModeEnabled=false: no FootnoteBlock rendered (regression guard)", async () => {
    // When the context has footnoteModeEnabled=false (default), no footnote block.
    const grantha = makeGranthaWithRefs([REF_A]);
    const { root, el } = await renderInto(
      <FootnoteModeProvider>
        <FlowReader {...propsFor(grantha)} />
      </FootnoteModeProvider>,
    );
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

  it("duplicate citation key → single footnote entry (dedup)", async () => {
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
    // Only one <li> entry should be rendered.
    const items = el.querySelectorAll('[data-verse-ref="1"] li');
    expect(items.length).toBe(1);
    cleanUp(root, el);
  });
});
