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
let patchCalls: Record<string, unknown>[];

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
        const p = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchCalls.push(p);
        const c = comments.find((x) => x.id === p.id);
        const status = (p.status ?? "") as ReviewComment["status"];
        if (!c) return new Response(JSON.stringify({ session: sessionJson(), current_sources: {}, has_changed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
        c.status = status;
        // Persist the audit fields the server would set, so a re-render shows
        // the new state.
        if (status === "accepted") c.accepted_at = "2026-08-28T00:00:00Z";
        if (status === "fixed" && p.summary) {
          c.fixes = [ ...(c.fixes ?? []), { applied_by: "reviewer", at: "2026-08-28T00:00:00Z", summary: String(p.summary) } ];
        }
        if (status === "reopened" && p.note) {
          c.follow_ups = [ ...(c.follow_ups ?? []), { note: String(p.note), at: "2026-08-28T00:00:00Z", by: "reviewer" } ];
        }
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
  it("open card shows Mark fixed, Won't fix, Delete", async () => {
    const { host, unmount } = await mount([makeComment()]);
    expect(actionLabels(host)).toEqual(["Mark fixed", "Won't fix", "Delete"]);
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

  it("Mark fixed prompts for a summary and PATCHes fixed with it", async () => {
    const { host, unmount } = await mount([makeComment()]);
    await act(async () => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Mark fixed",
      ) as HTMLButtonElement).click();
    });
    // The prompt form appears.
    expect(host.querySelector(".review-card-prompt")).not.toBeNull();
    const ta = host.querySelector(".review-prompt-input") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(ta, "Locator 6.8.4 → 6.8.7");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      ([...host.querySelectorAll(".review-prompt-actions button")].find(
        (b) => b.textContent === "Submit fix",
      ) as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls).toContainEqual({
      id: makeComment().id,
      status: "fixed",
      summary: "Locator 6.8.4 → 6.8.7",
    });
    unmount();
  });

  it("a dismissed card shows Reopen + Delete", async () => {
    const { host, unmount } = await mount([makeComment({ status: "dismissed" })]);
    expect(actionLabels(host)).toEqual(["Reopen", "Delete"]);
    unmount();
  });

  it("a fixed card shows Accept / Needs work / Reopen / Won't fix / Delete", async () => {
    const { host, unmount } = await mount([
      makeComment({ status: "fixed", fixes: [{ applied_by: "agent", at: "x", summary: "done" }] }),
    ]);
    expect(actionLabels(host)).toEqual([
      "Accept",
      "Needs work",
      "Reopen",
      "Won't fix",
      "Delete",
    ]);
    unmount();
  });

  it("Accept PATCHes accepted for a fixed comment", async () => {
    const { host, unmount } = await mount([
      makeComment({ status: "fixed", fixes: [{ applied_by: "agent", at: "x", summary: "done" }] }),
    ]);
    await act(async () => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Accept",
      ) as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls).toContainEqual({ id: makeComment().id, status: "accepted" });
    unmount();
  });

  it("Needs work prompts for a note and PATCHes reopened with it", async () => {
    const { host, unmount } = await mount([
      makeComment({
        status: "fixed",
        fixes: [{ applied_by: "agent", at: "x", summary: "done" }],
      }),
    ]);
    await act(async () => {
      ([...host.querySelectorAll(".review-card-actions button")].find(
        (b) => b.textContent === "Needs work",
      ) as HTMLButtonElement).click();
    });
    const ta2 = host.querySelector(".review-prompt-input") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(ta2, "Still wrong in the second pāda");
      ta2.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      ([...host.querySelectorAll(".review-prompt-actions button")].find(
        (b) => b.textContent === "Submit",
      ) as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(patchCalls).toContainEqual({
      id: makeComment().id,
      status: "reopened",
      note: "Still wrong in the second pāda",
    });
    unmount();
  });

  it("a done (legacy accepted) card shows Reopen + Won't fix + Delete", async () => {
    const { host, unmount } = await mount([
      makeComment({
        status: "done",
        fixes: [{ applied_by: "agent", at: "x", summary: "done" }],
        accepted_at: "x",
      }),
    ]);
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
    // The deleted section is collapsed by default; expand it to reveal cards.
    expect(host.textContent).toContain("Deleted (1)");
    expect(host.querySelectorAll(".review-card").length).toBe(0); // hidden
    await act(async () => {
      (host.querySelector(".review-deleted-head") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.querySelectorAll(".review-card").length).toBe(1);
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

describe("ReviewCommentList round picker", () => {
  it("renders a round select and loading a chosen round passes ?file=", async () => {
    // Seed the mock so the files listing returns two rounds and a file-specific
    // GET returns the chosen round's comment.
    const commentA = makeComment({ id: "aaaa-1", status: "open" });
    const getCalls: string[] = [];
    comments = [commentA];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "GET" && url.includes("/api/review/files")) {
          return new Response(JSON.stringify({
            sessions: [
              { name: "round-B.comments.json", started_at: "2026-08-28T00:00:00Z", updated_at: "2026-08-28T00:00:01Z", revision: 2, counts: { open: 0, fixed: 1, accepted: 0, reopened: 0, dismissed: 0, deleted: 0 } },
              { name: "round-A.comments.json", started_at: "2026-08-27T00:00:00Z", updated_at: "2026-08-27T00:00:01Z", revision: 1, counts: { open: 2, fixed: 0, accepted: 0, reopened: 0, dismissed: 0, deleted: 0 } },
            ],
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        getCalls.push(url);
        if (method === "GET" && url.includes("file=round-A")) {
          return new Response(JSON.stringify({ session: { ...sessionJson(), comments: [commentA] }, current_sources: {}, has_changed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ session: sessionJson(), current_sources: {}, has_changed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

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
    const select = host.querySelector(".review-round-select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "round-A.comments.json");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // A file-specific GET was issued.
    expect(getCalls.some((u) => u.includes("file=round-A"))).toBe(true);
    root.unmount();
    host.remove();
  });
});

describe("ReviewCommentList filter", () => {
  it("'Not yet accepted' shows only open/reopened/fixed", async () => {
    const { host, unmount } = await mount([
      makeComment({ id: "c-open", status: "open" }),
      makeComment({ id: "c-fixed", status: "fixed", fixes: [{ applied_by: "agent", at: "x", summary: "s" }] }),
      makeComment({
        id: "c-accepted",
        status: "accepted",
        fixes: [{ applied_by: "agent", at: "x", summary: "s" }],
        accepted_at: "x",
      }),
    ]);
    // Default shows all three.
    expect([...host.querySelectorAll(".review-card")].length).toBe(3);
    const sel = host.querySelector(".review-filter-select") as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(sel, "not-accepted");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const ids = [...host.querySelectorAll(".review-card")].map((e) => e.getAttribute("data-comment-id"));
    expect(ids).toContain("c-open");
    expect(ids).toContain("c-fixed");
    expect(ids).not.toContain("c-accepted");
    unmount();
  });

  it("is controllable: a parent filter prop drives the visible set and onFilterChange reports changes", async () => {
    comments = [
      makeComment({ id: "c-open", status: "open" }),
      makeComment({
        id: "c-accepted",
        status: "accepted",
        fixes: [{ applied_by: "agent", at: "x", summary: "s" }],
        accepted_at: "x",
      }),
    ];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onFilterChange = vi.fn();
    await act(async () => {
      root.render(
        <ReviewModeProvider granthaId="vedarthasangraha" passageTexts={{ "17": "एवमेव ब्रह्म" }}>
          <ReviewCommentList
            filter="not-accepted"
            onFilterChange={onFilterChange}
          />
        </ReviewModeProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const cards = [...host.querySelectorAll(".review-card")].map((e) => e.getAttribute("data-comment-id"));
    expect(cards).toEqual(["c-open"]);
    // Changing the select fires the callback (the parent owns the state).
    const sel = host.querySelector(".review-filter-select") as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(sel, "all");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onFilterChange).toHaveBeenCalledWith("all");
    await act(async () => root.unmount());
  });
});
