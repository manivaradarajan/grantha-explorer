// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchSession,
  upsertComment,
  setCommentStatus,
  startNewSession,
  ReviewServerError,
  reviewServerBase,
  ReviewComment,
} from "./reviewServer";

const BASE = "http://127.0.0.1:4321";

const comment = (): ReviewComment => ({
  id: "11111111-1111-1111-1111-111111111111",
  type: "citation-fix",
  status: "open",
  passage_ref: "17",
  passage_type: "main",
  kind: "Para",
  anchor: { start: 307, end: 320, line: 5, snippet: "मनु.स्मृ १.२१" },
  body: "Wrong locator — this is Manu 2.121.",
  suggested_fix: { locator: "2.121" },
});

const session = () => ({
  grantha_id: "vedarthasangraha",
  session_started_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
  revision: 1,
  sources: { "vedarthasangraha-01.md": "af3cb00c" },
  comments: [comment()],
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reviewServer client", () => {
  it("reviewServerBase defaults to 127.0.0.1:4321", () => {
    expect(reviewServerBase()).toBe(BASE);
  });

  it("fetchSession GETs with the grantha query param and parses the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session(), current_sources: {}, has_changed: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const res = await fetchSession("vedarthasangraha");
    expect(res.session?.grantha_id).toBe("vedarthasangraha");
    expect(res.has_changed).toBe(false);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/review?grantha=vedarthasangraha");
    expect(init.method).toBe("GET");
  });

  it("upsertComment POSTs the full comment body with JSON content-type", async () => {
    const c = comment();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await upsertComment("vedarthasangraha", c);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toMatchObject({
      id: c.id,
      type: "citation-fix",
      anchor: { snippet: "मनु.स्मृ १.२१" },
    });
  });

  it("setCommentStatus PATCHes {id, status}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await setCommentStatus("vedarthasangraha", { id: "x", status: "done" });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/review/status");
    expect(JSON.parse(init.body)).toEqual({ id: "x", status: "done" });
  });

  it("startNewSession POSTs {session: 'new'}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ session: session() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await startNewSession("vedarthasangraha");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ session: "new" });
  });

  it("throws ReviewServerError with the server's message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "passage main \"9999\" not found" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    let caught: ReviewServerError | null = null;
    try {
      await fetchSession("vedarthasangraha");
    } catch (e) {
      if (e instanceof ReviewServerError) caught = e;
    }
    expect(caught?.status).toBe(422);
    expect(caught?.message).toContain("not found");
  });

  it("enriches the message with the server's field-level reason on a 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "invalid comment payload",
            fields: { body: "must be a non-empty string (or select a candidate)" },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    let caught: ReviewServerError | null = null;
    try {
      await upsertComment("vedarthasangraha", {
        id: "11111111-1111-1111-1111-111111111111",
        type: "note",
        status: "open",
        passage_ref: "1",
        passage_type: "main",
        anchor: { start: 0, end: 2, line: 1, snippet: "x" },
        body: "",
      });
    } catch (e) {
      if (e instanceof ReviewServerError) caught = e;
    }
    expect(caught?.status).toBe(422);
    expect(caught?.message).toContain("invalid comment payload");
    expect(caught?.message).toContain("body");
    expect(caught?.message).toContain("non-empty string");
  });

  it("throws ReviewServerError when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    let caught: ReviewServerError | null = null;
    try {
      await fetchSession("vedarthasangraha");
    } catch (e) {
      if (e instanceof ReviewServerError) caught = e;
    }
    expect(caught?.status).toBe(0);
    expect(caught?.message).toContain("unreachable");
  });
});
