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
import { Grantha, GranthaMetadata } from "@/lib/data";
import FlowReader from "./FlowReader";

const emptyGranthasMeta: GranthaMetadata[] = [];

const makeGrantha = (kind: "Para" | "Shloka"): Grantha => ({
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
  prefatory_material: [],
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
  concluding_material: [],
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
