// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewSelectionToolbar, detectNearestReference } from "./ReviewSelectionToolbar";
import { ReviewComment } from "./reviewServer";

afterEach(() => {
  document.body.innerHTML = "";
});

// A realistic raw passage with an annotated span in the DOM (as the renderer
// would emit it), so selectionToOffset can map the selection exactly.
const RAW = "एवमेव वैदिकाः सर्वे शब्दाः परमात्मपर्यन्तान् स्वार्थान् बोधयन्ति ।";
const SNIPPET = "वैदिकाः सर्वे शब्दाः";

function setupDomWithAnnotatedSpan(): {
  el: HTMLDivElement;
  textNode: Text;
  visibleLen: number;
  snippetRawStart: number;
} {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const span = document.createElement("span");
  span.setAttribute("data-offset-start", "0");
  span.setAttribute("data-offset-end", String(RAW.length));
  span.textContent = RAW.replace(/\u00A0/g, " ");
  el.appendChild(span);
  const textNode = span.firstChild as Text;
  return {
    el,
    textNode,
    visibleLen: textNode.textContent!.length,
    snippetRawStart: RAW.indexOf(SNIPPET),
  };
}

async function renderToolbar(
  onSave: (c: ReviewComment) => void,
  range: Range,
  editing?: ReviewComment,
  onCancel?: () => void,
): Promise<{ host: HTMLDivElement; unmount: () => void }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ReviewSelectionToolbar
          passageRaw={RAW}
          passageRef="17"
          anchorRange={range}
          onSave={onSave}
          onCancel={onCancel}
          editing={editing}
        />
      </QueryClientProvider>,
    );
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe("ReviewSelectionToolbar", () => {
  it("maps a selection to raw offsets and saves a comment", async () => {
    const { el, textNode, snippetRawStart } = setupDomWithAnnotatedSpan();
    const start = RAW.indexOf(SNIPPET);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + SNIPPET.length);
    const saved: ReviewComment[] = [];
    const { host, unmount } = await renderToolbar((c) => saved.push(c), range);

    const body = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      // React's controlled input needs the native setter to trigger onChange.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(body, "Wrong locator");
      body.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const save = host.querySelector(".review-toolbar-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    act(() => {
      save.click();
    });

    expect(saved).toHaveLength(1);
    const c = saved[0];
    expect(c.anchor.snippet).toBe(SNIPPET);
    expect(c.anchor.start).toBe(snippetRawStart);
    expect(c.anchor.end).toBe(snippetRawStart + SNIPPET.length);
    expect(c.body).toBe("Wrong locator");
    unmount();
    void el;
  });

  it("defaults to note and hides the locator field", async () => {
    const { textNode } = setupDomWithAnnotatedSpan();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const { host, unmount } = await renderToolbar(() => {}, range);
    expect(host.querySelector(".review-kind-pill.k-note.active")).not.toBeNull();
    expect(host.querySelector(".review-toolbar-locator")).toBeNull();
    unmount();
  });

  it("smoothes an unmappable selection to non-negative offsets (no -1 sent)", async () => {
    // A selection over text with NO data-offset ancestor makes
    // selectionToOffset throw; the toolbar must smooth it to a valid offset
    // (>= 0, end >= start), never sending -1.
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.textContent = "तत्त्वमसि एवमेव";
    const tn = el.firstChild as Text;
    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, 8);
    const saved: ReviewComment[] = [];
    const { host, unmount } = await renderToolbar((c) => saved.push(c), range);

    const body = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(body, "note text");
      body.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      (host.querySelector(".review-toolbar-save") as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(saved).toHaveLength(1);
    const a = saved[0].anchor;
    expect(a.start).toBeGreaterThanOrEqual(0);
    expect(a.end).toBeGreaterThanOrEqual(a.start);
    expect(a.snippet.length).toBeGreaterThan(0);
    unmount();
    void el;
  });

  it("keeps the textarea focusable when clicked (no popup freeze)", async () => {
    const { textNode } = setupDomWithAnnotatedSpan();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const { host, unmount } = await renderToolbar(() => {}, range);
    const textarea = host.querySelector(".review-toolbar-body") as HTMLTextAreaElement;
    // A real mousedown on the textarea must not be preventDefaulted, so the
    // field can be focused and typed into.
    act(() => {
      textarea.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    act(() => {
      textarea.focus();
    });
    expect(document.activeElement).toBe(textarea);
    unmount();
  });

  it("pre-fills an existing comment for editing", async () => {
    const { textNode } = setupDomWithAnnotatedSpan();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const editing: ReviewComment = {
      id: "c1",
      type: "quote-locate",
      status: "open",
      passage_ref: "17",
      passage_type: "main",
      anchor: { start: 0, end: 4, line: 1, snippet: "एवमेव" },
      body: "existing body",
      suggested_fix: { locator: "2.121" },
    };
    const { host, unmount } = await renderToolbar(() => {}, range, editing);
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("existing body");
    expect(host.querySelector(".review-kind-pill.k-quote.active")).not.toBeNull();
    expect((host.querySelector(".review-toolbar-save") as HTMLButtonElement).textContent).toBe(
      "Save changes",
    );
    unmount();
  });

  it("Cancel button invokes onCancel", async () => {
    const { textNode } = setupDomWithAnnotatedSpan();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    let cancelled = 0;
    const { host, unmount } = await renderToolbar(() => {}, range, undefined, () => { cancelled++; });
    const cancel = host.querySelector(".review-toolbar-cancel") as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    act(() => {
      cancel.click();
    });
    expect(cancelled).toBe(1);
    unmount();
  });

  it("Escape key invokes onCancel", async () => {
    const { textNode } = setupDomWithAnnotatedSpan();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    let cancelled = 0;
    const { host, unmount } = await renderToolbar(() => {}, range, undefined, () => { cancelled++; });
    act(() => {
      host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(cancelled).toBe(1);
    unmount();
  });
});

describe("detectNearestReference", () => {
  it("returns the overlapping reference when selection intersects it", () => {
    const refs = [
      {
        start: 10,
        end: 25,
        grantha_id: "bhagavad-gita",
        display_text: "भ.गी. २.१२",
        locator: "2.12",
      },
    ];
    const target = detectNearestReference(refs, 15, 20);
    expect(target).toEqual({
      grantha_id: "bhagavad-gita",
      edition: undefined,
      locator: "2.12",
      display_text: "भ.गी. २.१२",
    });
  });

  it("detects trailing citation right after the selection within max distance", () => {
    const refs = [
      {
        start: 50,
        end: 65,
        grantha_id: "vishnu-purana",
        display_text: "वि.पु. १.२.१०",
        locator: "1.2.10",
      },
    ];
    // Selection at 20..45, trailing citation starts at 50 (distance 5 <= 40)
    const target = detectNearestReference(refs, 20, 45);
    expect(target?.grantha_id).toBe("vishnu-purana");
  });

  it("ignores citations beyond max distance", () => {
    const refs = [
      {
        start: 100,
        end: 115,
        grantha_id: "vishnu-purana",
        display_text: "वि.पु. १.२.१०",
      },
    ];
    // Selection at 0..10, citation starts at 100 (distance 90 > 40)
    const target = detectNearestReference(refs, 0, 10, 40);
    expect(target).toBeNull();
  });
});
