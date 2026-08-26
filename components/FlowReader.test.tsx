// @vitest-environment jsdom
/**
 * Render regression tests for the per-block mula presentation (IDEA.md).
 *
 * A main passage whose `kind` classifies as "prose" (Para/Gadya) must render
 * undecorated: no `border-l-2` bar, no `max-w-2xl` centering, `flow-commentary`
 * type, the passage number prefixed (indented, ``N.``) at the paragraph head,
 * and NO trailing `॥ N ॥`. A "verse" kind keeps the current verse decoration
 * (including the trailing double-danda number). The decision is
 * `presentationFor(passage.kind)` — a total function — so the assertions pin
 * both the mapping and its application in the FlowReader mula block.
 */

import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { Grantha, GranthaMetadata, PrefatoryMaterial } from "@/lib/data";
import FlowReader from "./FlowReader";

const emptyGranthasMeta: GranthaMetadata[] = [];

// Loose framing-item fixture type: FlowReader only reads ref / passage_type /
// label / content.sanskrit.devanagari / verses from framing passages.
interface FramingFixture {
  ref: string;
  passage_type: "prefatory" | "concluding";
  label: { devanagari: string };
  content: { sanskrit: { devanagari: string } };
  verses?: { start: number; end: number }[];
}

const makeGrantha = (
  kind: "Para" | "Shloka",
  frontMatter: {
    prefatory?: FramingFixture[];
    concluding?: FramingFixture[];
  } = {},
): Grantha => ({
  grantha_id: "test-grantha",
  edition_id: "test-grantha",
  canonical_title: "टेस्ट",
  aliases: [],
  text_type: kind === "Para" ? "prakarana" : "purana",
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
    { key: kind, scriptNames: { devanagari: kind === "Para" ? "पाठः" : "श्लोकः" } },
  ],
  prefatory_material: (frontMatter.prefatory ?? []) as PrefatoryMaterial[],
  passages: [
    {
      ref: "1",
      passage_type: "main",
      kind,
      content: {
        sanskrit: { devanagari: "अयं पाठः" },
        english_translation: "",
      },
    },
  ],
  concluding_material: (frontMatter.concluding ?? []) as PrefatoryMaterial[],
  commentaries: [],
  id: "test-grantha",
  path: "test-grantha",
  title: "टेस्ट",
  title_deva: "टेस्ट",
  title_iast: "test",
  categories: [],
});

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
  availableGranthaIds: ["test-grantha"],
  granthaById: {},
  granthaIdToDevanagariTitle: {},
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

const renderInto = (node: React.ReactNode): { root: Root; el: HTMLDivElement } => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(node);
  return { root, el };
};

const cleanUp = (root: Root, el: HTMLDivElement) => {
  act(() => root.unmount());
  el.remove();
};

const mulaTextEl = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>('[data-verse-ref="1"] .verse-text');

describe("FlowReader per-block mula presentation", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a Para (prose) mula with a gutter number and left rail", async () => {
    const grantha = makeGrantha("Para");
    const { root, el } = renderInto(<FlowReader {...propsFor(grantha)} />);
    await act(async () => {});
    const block = el.querySelector<HTMLElement>('[data-verse-ref="1"]');
    expect(block).not.toBeNull();
    // no verse chrome anywhere in the passage block
    expect(block!.querySelector(".border-l-2")).toBeNull();
    const row = block!.querySelector<HTMLElement>(".flow-para-row");
    expect(row).not.toBeNull();
    // the canonical passage number is a real, selectable text node in the gutter
    const num = row!.querySelector<HTMLElement>(".flow-para-number");
    expect(num).not.toBeNull();
    expect(num!.textContent).toBe("१.");
    // the number is a flex sibling of the text column, not inline text
    expect(row!.querySelector<HTMLElement>(".flow-para-number + .min-w-0")).not.toBeNull();
    // prose paras no longer close with the double-danda number
    expect(block!.textContent).not.toContain("॥");
    cleanUp(root, el);
  });

  it("renders a Shloka (verse) mula decorated with trailing danda number", async () => {
    const grantha = makeGrantha("Shloka");
    const { root, el } = renderInto(<FlowReader {...propsFor(grantha)} />);
    await act(async () => {});
    const text = mulaTextEl(el);
    expect(text).not.toBeNull();
    expect(text!.className).toContain("flow-verse");
    expect(text!.className).not.toContain("flow-commentary");
    const block = el.querySelector<HTMLElement>('[data-verse-ref="1"]');
    expect(block!.querySelector(".border-l-2")).not.toBeNull();
    // verse kinds keep the print-convention trailing danda number
    expect(text!.textContent).toContain("॥ १॥");
    cleanUp(root, el);
  });
});

describe("FlowReader prefatory/concluding front matter + category dividers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders plain front matter centered (.frontmatter-plain) and verse-tagged front matter as a verse block", async () => {
    const grantha = makeGrantha("Para", {
      prefatory: [
        {
          ref: "0.1",
          passage_type: "prefatory",
          label: { devanagari: "ग्रन्थशीर्षिका" },
          content: {
            sanskrit: { devanagari: "॥ श्रीरस्तु ॥\nश्रीभगवद्रामानुजविरचितः वेदार्थसङ्ग्रहः" },
          },
        },
        {
          ref: "0.2",
          passage_type: "prefatory",
          label: { devanagari: "मङ्गलाचरणम्" },
          content: {
            sanskrit: { devanagari: "अशेषचिदचिद्वस्तुशेषिणे शेषशायिने ।\nनिर्मलानन्तकल्याणनिधये विष्णवे नमः ॥\n" },
          },
          verses: [{ start: 0, end: 73 }],
        },
      ],
      concluding: [
        {
          ref: "253",
          passage_type: "concluding",
          label: { devanagari: "समापनम्" },
          content: {
            sanskrit: { devanagari: "॥ इति श्रीवेदार्थसङ्ग्रहः समाप्तः ॥" },
          },
        },
      ],
    });
    const { root, el } = renderInto(<FlowReader {...propsFor(grantha)} />);
    await act(async () => {});
    // plain prefatory 0.1 → frontmatter-plain
    const p01 = el.querySelector<HTMLElement>('[data-verse-ref="0.1"]');
    expect(p01!.querySelector(".frontmatter-plain")).not.toBeNull();
    expect(p01!.querySelector(".flow-para-row")).toBeNull();
    // verse-tagged prefatory 0.2 → the verse-quote treatment, NOT plain
    const p02 = el.querySelector<HTMLElement>('[data-verse-ref="0.2"]');
    expect(p02!.querySelector(".frontmatter-plain")).toBeNull();
    expect(p02!.querySelector(".verse-quote.verse-own")).not.toBeNull();
    // ...and it sits inside the prose-mūla row so it carries the left rail
    expect(p02!.querySelector(".flow-para-row .verse-quote.verse-own")).not.toBeNull();
    // the row reserves the number-gutter width (empty spacer) so the verse
    // column aligns with a body paragraph's own-verse x-position
    const gutter = p02!.querySelector(".flow-para-row .flow-para-number");
    expect(gutter).not.toBeNull();
    expect(gutter!.textContent).toBe("");
    // plain concluding 253 → frontmatter-plain
    const p253 = el.querySelector<HTMLElement>('[data-verse-ref="253"]');
    expect(p253!.querySelector(".frontmatter-plain")).not.toBeNull();
    cleanUp(root, el);
  });

  it("inserts a section-divider only when the category changes", async () => {
    const grantha = makeGrantha("Para", {
      prefatory: [
        {
          ref: "0.1",
          passage_type: "prefatory",
          label: { devanagari: "ग्रन्थशीर्षिका" },
          content: { sanskrit: { devanagari: "॥ श्रीरस्तु ॥" } },
        },
        {
          ref: "0.2",
          passage_type: "prefatory",
          label: { devanagari: "मङ्गलाचरणम्" },
          content: { sanskrit: { devanagari: "अशेषचिदचिद्वस्तुशेषिणे शेषशायिने ।\nनिर्मलानन्तकल्याणनिधये विष्णवे नमः ॥\n" } },
          verses: [{ start: 0, end: 73 }],
        },
      ],
      concluding: [
        {
          ref: "253",
          passage_type: "concluding",
          label: { devanagari: "समापनम्" },
          content: { sanskrit: { devanagari: "॥ इति श्रीवेदार्थसङ्ग्रहः समाप्तः ॥" } },
        },
      ],
    });
    const { root, el } = renderInto(<FlowReader {...propsFor(grantha)} />);
    await act(async () => {});
    // exactly 2 dividers: before the first main passage (1) and before the
    // concluding item (253) — never between adjacent prefatory items.
    const dividers = el.querySelectorAll(".section-divider");
    expect(dividers.length).toBe(2);
    // divider precedes [data-verse-ref="1"] (category prefatory → main)
    expect(dividers[0].nextElementSibling?.getAttribute("data-verse-ref")).toBe("1");
    // divider precedes [data-verse-ref="253"] (category main → concluding)
    expect(dividers[1].nextElementSibling?.getAttribute("data-verse-ref")).toBe("253");
    cleanUp(root, el);
  });
});
