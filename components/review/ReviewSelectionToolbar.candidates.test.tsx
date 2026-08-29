// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { ReviewSelectionToolbar } from "./ReviewSelectionToolbar";
import type { Reference } from "@/lib/data";

const RAW = "यथा छा. उ. ६.८.४ तत्त्वमसि श्वेतकेतो ।";
const SNIPPET = "तत्त्वमसि श्वेतकेतो";

let scanCalls: unknown[] = [];

beforeEach(() => {
  scanCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/review/candidates")) {
        scanCalls.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            candidates: [
              { grantha_id: "chhandogya-upanishad", edition_id: "chhandogya-upanishad", ref: "6.8.7", quality: 0.95, excerpt: "तत् त्वमसि श्वेतकेतो" },
              { grantha_id: "chhandogya-upanishad", edition_id: "chhandogya-upanishad", ref: "6.9.4", quality: 0.9, excerpt: "तत्त्वमसि श्वेतकेतो" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ session: null, current_sources: {}, has_changed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const references: Reference[] = [
  {
    start: RAW.indexOf("छा. उ. ६.८.४"),
    end: RAW.indexOf("छा. उ. ६.८.४") + "छा. उ. ६.८.४".length,
    display_text: "छा. उ. ६.८.४",
    grantha_id: "chhandogya-upanishad",
    edition_id: "chhandogya-upanishad",
    locator: "6.8.4",
    unresolved: false,
  },
];

async function renderToolbar(refs: Reference[] = references) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const span = document.createElement("span");
  span.setAttribute("data-offset-start", "0");
  span.setAttribute("data-offset-end", String(RAW.length));
  span.textContent = RAW;
  el.appendChild(span);
  const tn = span.firstChild as Text;
  const start = RAW.indexOf(SNIPPET);
  const range = document.createRange();
  range.setStart(tn, start);
  range.setEnd(tn, start + SNIPPET.length);

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ReviewSelectionToolbar
        passageRaw={RAW}
        passageRef="1"
        references={refs}
        anchorRange={range}
        onSave={() => {}}
      />,
    );
  });
  // Switch to citation-fix (default is note) to trigger the submenu.
  await act(async () => {
    ([...host.querySelectorAll(".review-kind-pill")].find(
      (b) => b.textContent === "citation-fix",
    ) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
  return { host, unmount: () => { root.unmount(); host.remove(); el.remove(); } };
}

describe("ReviewSelectionToolbar candidates submenu", () => {
  it("fetches and lists candidates when citation-fix + a detectable reference", async () => {
    const { host, unmount } = await renderToolbar();
    expect(scanCalls.length).toBeGreaterThan(0);
    const req = scanCalls[scanCalls.length - 1] as { target: string; needle: string; exclude_locator?: string };
    expect(req.target).toBe("chhandogya-upanishad");
    expect((req.needle ?? "").length).toBeGreaterThan(0);
    expect(req.exclude_locator).toBe("6.8.4");

    const rows = host.querySelectorAll(".review-candidate");
    expect(rows.length).toBe(2);
    const first = rows[0] as HTMLButtonElement;
    expect((first.querySelector(".review-candidate-ref") as HTMLElement).textContent).toBe("6.8.7");
    expect((first.querySelector(".review-candidate-excerpt") as HTMLElement).textContent).toContain(
      "तत् त्वमसि",
    );
    unmount();
  });

  it("clicking a candidate selects it and fills the locator for suggested_fix", async () => {
    const { host, unmount } = await renderToolbar();
    const first = host.querySelector(".review-candidate") as HTMLButtonElement;
    await act(async () => {
      first.click();
    });
    expect(first.classList.contains("selected")).toBe(true);
    const locator = host.querySelector(".review-toolbar-locator") as HTMLInputElement;
    expect(locator.value).toBe("6.8.7");
    unmount();
  });

  it("selecting a candidate enables Save without needing a comment body", async () => {
    const { host, unmount } = await renderToolbar();
    const saveBefore = host.querySelector(".review-toolbar-save") as HTMLButtonElement;
    expect(saveBefore.disabled).toBe(true); // no body and nothing selected yet
    await act(async () => {
      (host.querySelector(".review-candidate") as HTMLButtonElement).click();
    });
    const saveAfter = host.querySelector(".review-toolbar-save") as HTMLButtonElement;
    expect(saveAfter.disabled).toBe(false); // candidate alone is enough
    const body = host.querySelector(".review-toolbar-body") as HTMLTextAreaElement;
    expect(body.value.trim()).toBe(""); // still no body text
    unmount();
  });

  it("renders 'type your own' input alongside candidates", async () => {
    const { host, unmount } = await renderToolbar();
    const custom = host.querySelector(".review-toolbar-locator") as HTMLInputElement;
    expect(custom).not.toBeNull();
    expect(custom.placeholder).toContain("type your own");
    unmount();
  });

  it("with no reference target, fetches a corpus-wide search", async () => {
    const { host, unmount } = await renderToolbar([]); // no references → corpus
    expect(scanCalls.length).toBeGreaterThan(0);
    const req = scanCalls[scanCalls.length - 1] as { corpus?: boolean; target?: string };
    expect(req.corpus).toBe(true);
    expect(req.target).toBeUndefined();
    expect(host.querySelectorAll(".review-candidate").length).toBe(2);
    unmount();
  });
});

describe("ReviewSelectionToolbar candidates — current + corpus fallback", () => {
  it("renders a 'current' badge on the already-cited verse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/review/candidates")) {
          return new Response(
            JSON.stringify({
              candidates: [
                { grantha_id: "mundaka-upanishad", edition_id: "mundaka-upanishad", ref: "3.2.3", quality: 1.0, excerpt: "नायमात्मा प्रवचनेन", is_current: true },
                { grantha_id: "mundaka-upanishad", edition_id: "mundaka-upanishad", ref: "3.2.4", quality: 0.52, excerpt: "नायमात्मा बलहीनेन" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ session: null, current_sources: {}, has_changed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    // A citation-fix with a detectable reference to mundaka 3.2.3.
    const refs: Reference[] = [
      {
        start: RAW.indexOf("छा. उ. ६.८.४"),
        end: RAW.indexOf("छा. उ. ६.८.४") + "छा. उ. ६.८.४".length,
        display_text: "मुण्ड.उ. ३.२.३",
        grantha_id: "mundaka-upanishad",
        edition_id: "mundaka-upanishad",
        locator: "3.2.3",
        unresolved: false,
      },
    ];
    const { host, unmount } = await renderToolbar(refs);
    const currentBadge = host.querySelector(".review-candidate-current");
    expect(currentBadge).not.toBeNull();
    unmount();
  });

  it("falls back to a corpus search when only the current candidate survives", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/review/candidates")) {
          const body = JSON.parse(String(init?.body)) as { corpus?: boolean };
          calls.push(body);
          if (body.corpus) {
            return new Response(
              JSON.stringify({
                candidates: [
                  { grantha_id: "mundaka-upanishad", edition_id: "mundaka-upanishad", ref: "3.2.3", quality: 1.0, excerpt: "नायमात्मा" },
                  { grantha_id: "katha-upanishad", edition_id: "katha-upanishad", ref: "1.2.23", quality: 1.0, excerpt: "नायमात्मा" },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          // Targeted scan returns ONLY the current verse (the old bug hid it).
          return new Response(
            JSON.stringify({
              candidates: [
                { grantha_id: "mundaka-upanishad", edition_id: "mundaka-upanishad", ref: "3.2.3", quality: 1.0, excerpt: "नायमात्मा", is_current: true },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ session: null, current_sources: {}, has_changed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const refs: Reference[] = [
      {
        start: RAW.indexOf("छा. उ. ६.८.४"),
        end: RAW.indexOf("छा. उ. ६.८.४") + "छा. उ. ६.८.४".length,
        display_text: "मुण्ड.उ. ३.२.३",
        grantha_id: "mundaka-upanishad",
        edition_id: "mundaka-upanishad",
        locator: "3.2.3",
        unresolved: false,
      },
    ];
    const { host, unmount } = await renderToolbar(refs);
    // A corpus fallback call was issued.
    expect(calls.some((c) => (c as { corpus?: boolean }).corpus)).toBe(true);
    // Both the current Mundaka verse and the Katha alternative appear.
    const refsShown = [...host.querySelectorAll(".review-candidate-ref")].map((e) => e.textContent);
    expect(refsShown).toContain("3.2.3");
    expect(refsShown).toContain("1.2.23");
    unmount();
  });
});
