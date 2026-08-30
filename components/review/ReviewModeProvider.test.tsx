// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import {
  ReviewModeProvider,
  useReviewMode,
} from "./ReviewModeProvider";
import { ReviewComment } from "./reviewServer";
import { resolveReviewMarks } from "@/lib/reviewAnchor";

const session = (comments: ReviewComment[] = []) => ({
  grantha_id: "vedarthasangraha",
  session_started_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
  revision: 1,
  sources: { "vedarthasangraha-01.md": "af3cb00c" },
  comments,
});

const comment = (over: Partial<ReviewComment> = {}): ReviewComment => ({
  id: "11111111-1111-1111-1111-111111111111",
  type: "citation-fix",
  status: "open",
  passage_ref: "17",
  passage_type: "main",
  kind: "Para",
  anchor: { start: 307, end: 320, line: 5, snippet: "संस्थाः संस्थानानि" },
  body: "locator wrong",
  ...over,
});

// A probe component that surfaces the provider state for assertions.
function Probe({
  passageTexts = {},
  onState,
}: {
  passageTexts?: Record<string, string>;
  onState: (s: ReturnType<typeof useReviewMode> & { marks: unknown[] }) => void;
}) {
  const s = useReviewMode();
  const marks = resolveReviewMarks(s.session?.comments, passageTexts, s.detached)["17"] ?? [];
  onState({ ...s, marks });
  return null;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ session: null, current_sources: {}, has_changed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountProbe(passageTexts: Record<string, string>): Promise<{
  states: Array<ReturnType<typeof useReviewMode> & { marks: unknown[] }>;
  unmount: () => void;
}> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const states: Array<ReturnType<typeof useReviewMode> & { marks: unknown[] }> = [];
  await act(async () => {
    root.render(
      <ReviewModeProvider granthaId="vedarthasangraha" passageTexts={passageTexts}>
        <Probe passageTexts={passageTexts} onState={(s) => states.push(s)} />
      </ReviewModeProvider>,
    );
    // Flush the effect's async refresh + the resulting state updates.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    states,
    unmount: () => {
      root.unmount();
      el.remove();
    },
  };
}

describe("ReviewModeProvider", () => {
  it("loads an empty session on mount", async () => {
    const { states, unmount } = await mountProbe({});
    // The provider fetched the session; the probe surfaced a state with a null
    // session (empty) and the loading flag resolved.
    expect(states.length).toBeGreaterThan(0);
    expect(states[states.length - 1].session).toBeNull();
    unmount();
  });

  it("exposes comments and re-locates highlights against current text", async () => {
    const c = comment({ anchor: { start: 0, end: 10, line: 1, snippet: "संस्थाः संस्थानानि" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session([c]), current_sources: {}, has_changed: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { states, unmount } = await mountProbe({
      "17": "एवमेव संस्थाः संस्थानानि रूपाणीति",
    });
    const state = states[states.length - 1];
    expect(state.session?.comments).toHaveLength(1);
    expect(state.marks).toHaveLength(1);
    const h = state.marks[0] as { commentId: string; start: number; end: number };
    expect(h.commentId).toBe(c.id);
    expect("एवमेव संस्थाः संस्थानानि रूपाणीति".slice(h.start, h.end)).toBe(
      "संस्थाः संस्थानानि",
    );
    unmount();
  });

  it("marks a comment detached when its snippet is not in the current text", async () => {
    const c = comment({ anchor: { start: 0, end: 10, line: 1, snippet: "गगनचुम्बीप्रासाद" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session([c]), current_sources: {}, has_changed: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { states, unmount } = await mountProbe({ "17": "एवमेव" });
    const state = states[states.length - 1];
    expect(state.detached).toContain(c.id);
    expect(state.marks).toHaveLength(0);
    unmount();
  });
});
