// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { ReviewCommentList } from "./ReviewCommentList";
import { ReviewModeProvider } from "./ReviewModeProvider";
import { ReviewComment } from "./reviewServer";

const makeComment = (over: Partial<ReviewComment> = {}): ReviewComment => ({
  id: "11111111-1111-1111-1111-111111111111",
  type: "note",
  status: "open",
  passage_ref: "17",
  passage_type: "main",
  anchor: { start: 0, end: 6, line: 1, snippet: "एवमेव" },
  body: "check this",
  ...over,
});

let comments: ReviewComment[];
let patchCalls: { id: string; status: string }[];

const sessionJson = () => ({
  grantha_id: "vedarthasangraha",
  session_started_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
  revision: 1,
  sources: { "vedarthasangraha-01.md": "af3cb00c" },
  comments,
});

beforeEach(() => {
  comments = [];
  patchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        const p = JSON.parse(String(init?.body)) as { id: string; status: string };
        patchCalls.push(p);
        const c = comments.find((x) => x.id === p.id);
        if (c) c.status = p.status as ReviewComment["status"];
      }
      return new Response(JSON.stringify({ session: sessionJson(), current_sources: {}, has_changed: false }), {
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

async function mount(seed: ReviewComment[]) {
  comments = seed;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ReviewModeProvider granthaId="vedarthasangraha" passageTexts={{ "17": "एवमेव ब्रह्म" }}>
        <ReviewCommentList />
      </ReviewModeProvider>,
    );
  });
  return { host, unmount: () => { root.unmount(); host.remove(); } };
}

const actionLabels = (host: HTMLElement): string[] =>
  [...host.querySelectorAll(".review-card-actions button")].map((b) => b.textContent ?? "");

describe("ReviewCommentList actions", () => {
  it("open card shows Done, Won't fix, Delete (no Restore label)", async () => {
    const { host, unmount } = await mount([makeComment()]);
    expect(actionLabels(host)).toEqual(["Done", "Won't fix", "Delete"]);
    unmount();
  });

  it("shows the Devanagari para number for context", async () => {
    const { host, unmount } = await mount([
      makeComment({ passage_ref: "17", kind: "Para" }),
      makeComment({
        id: "22222222-2222-2222-2222-222222222222",
        passage_ref: "2.1",
        kind: "Mantra",
      }),
    ]);
    const paras = [...host.querySelectorAll(".review-card-para")].map((e) => e.textContent);
    // Sorted by highlight order: passage_ref via compareRefs then anchor.start
    expect(paras).toEqual(["२.१", "१७"]);
    unmount();
  });

  it("sorts comments by highlight order (passage then offset)", async () => {
    const { host, unmount } = await mount([
      makeComment({ id: "c3", passage_ref: "5", anchor: { start: 20, end: 30, line: 1, snippet: "x" } }),
      makeComment({ id: "c1", passage_ref: "1", anchor: { start: 10, end: 20, line: 1, snippet: "x" } }),
      makeComment({ id: "c2", passage_ref: "1", anchor: { start: 2, end: 8, line: 1, snippet: "y" } }),
    ]);
    const locs = [...host.querySelectorAll(".review-card-loc")].map((e) => e.textContent);
    // 1.2 < 1.10 < 5.20 in highlight order
    expect(locs[0]).toContain("§1");
    expect(locs[1]).toContain("§1");
    // Within same passage, anchor.start 2 before 10
    const snippets = [...host.querySelectorAll(".review-card-snippet")].map((e) => e.textContent);
    // First "1" comment should be the one with snippet "y" (start 2)
    expect(snippets[0]).toBe("y");
    expect(snippets[1]).toBe("x");
    unmount();
  });

  it("Won't fix sets status to dismissed (kept on record)", async () => {
    const { host, unmount } = await mount([makeComment()]);
    act(() => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Won't fix",
      ) as HTMLButtonElement).click();
    });
    expect(patchCalls).toContainEqual({ id: makeComment().id, status: "dismissed" });
    unmount();
  });

  it("a dismissed card shows Reopen + Delete (no Done)", async () => {
    const { host, unmount } = await mount([makeComment({ status: "dismissed" })]);
    expect(actionLabels(host)).toEqual(["Reopen", "Delete"]);
    unmount();
  });

  it("a done card shows Reopen + Won't fix + Delete", async () => {
    const { host, unmount } = await mount([makeComment({ status: "done" })]);
    expect(actionLabels(host)).toEqual(["Reopen", "Won't fix", "Delete"]);
    unmount();
  });

  it("Delete soft-deletes: card leaves the main list and appears in Deleted section", async () => {
    const { host, unmount } = await mount([makeComment()]);
    await act(async () => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Delete",
      ) as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls).toContainEqual({ id: makeComment().id, status: "deleted" });
    expect(host.textContent).toContain("Deleted (1)");
    unmount();
  });

  it("Reopen from Deleted section returns the comment to open", async () => {
    const { host, unmount } = await mount([makeComment({ status: "deleted" })]);
    expect(host.textContent).toContain("Deleted (1)");
    await act(async () => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Reopen",
      ) as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls).toContainEqual({ id: makeComment().id, status: "open" });
    unmount();
  });
});
