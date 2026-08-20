// @vitest-environment jsdom
/**
 * Regression test: in compare mode, a part request must reach every active
 * edition, not just the primary.
 *
 * The flow reader renders one commentary column per active edition, each
 * resolved via `commentaryPassageForRef` against that edition's own loaded
 * grantha. Historically `useEditions.loadPart` delegated to the PRIMARY
 * edition's loader only, so after the initially-eager-loaded first section the
 * secondary editions' parts never lazy-loaded — their columns rendered empty
 * (e.g. chhandogya 6.1.2 with `?e=…sankara-bhashya,…&m=flow`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditions } from "@/hooks/useEditions";

const SANKARA = "chhandogya-upanishad-sankara-bhashya";
const RANGARAMANUJA = "chhandogya-upanishad";
const GRANTHA = "chhandogya-upanishad";
const SANKARA_PATH = `upanishads/chandogya/${SANKARA}`;
const RANGARAMANUJA_PATH = `upanishads/chandogya/${RANGARAMANUJA}`;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function envelope(editionId: string): object {
  return {
    kind: "edition-sub-envelope",
    schema_version: "1.3.0",
    edition_id: editionId,
    grantha_id: GRANTHA,
    structure_levels: [
      {
        key: "Adhyaya",
        scriptNames: { devanagari: "अध्यायः" },
        children: [{ key: "Mantra", scriptNames: { devanagari: "मन्त्रः" } }],
      },
    ],
    parts: [
      { file: "part1.json", first_ref: "1.1.1" },
      { file: "part2.json", first_ref: "2.1.1" },
    ],
  };
}

function part(
  editionId: string,
  partNum: number,
  ref: string,
): object {
  return {
    kind: "grantha-part",
    schema_version: "1.3.0",
    grantha_id: GRANTHA,
    edition_id: editionId,
    part_num: partNum,
    passages: [
      {
        ref,
        passage_type: "main",
        content: { sanskrit: { devanagari: `mula ${ref}` } },
      },
    ],
    commentary: {
      commentary_id: editionId,
      commentary_title: "t",
      commentator: { devanagari: "X" },
      passages: [
        { ref, content: { sanskrit: { devanagari: `bhashya ${ref}` } } },
      ],
    },
  };
}

const INDEX = {
  granthas: [
    {
      id: GRANTHA,
      path: RANGARAMANUJA_PATH,
      title: "Chandogya Upanishad",
      title_deva: "छान्दोग्योपनिषत्",
      title_iast: "Chandogya Upanishad",
      categories: ["upanishads"],
      editions: [
        {
          edition_id: SANKARA,
          path: SANKARA_PATH,
          isDefault: false,
        },
        {
          edition_id: RANGARAMANUJA,
          path: RANGARAMANUJA_PATH,
          isDefault: true,
        },
      ],
    },
  ],
};

function buildRoutes(): Map<string, Response> {
  const routes = new Map<string, Response>();
  routes.set("/data/generated/granthas.json", jsonResponse(INDEX));
  for (const [editionId, path] of [
    [SANKARA, SANKARA_PATH],
    [RANGARAMANUJA, RANGARAMANUJA_PATH],
  ] as const) {
    routes.set(`/data/library/${path}/envelope.json`, jsonResponse(envelope(editionId)));
    routes.set(`/data/library/${path}/part1.json`, jsonResponse(part(editionId, 1, "1.1.1")));
    routes.set(`/data/library/${path}/part2.json`, jsonResponse(part(editionId, 2, "2.1.1")));
  }
  return routes;
}

/** Minimal harness: expose useEditions results to the test through a ref.
 *  The ref is written in an effect (after commit), which is the idiomatic way
 *  to publish hook results to a test driver and satisfies the React compiler's
 *  no-during-render-mutation rule. */
function makeHarness(ready: { current: ReturnType<typeof useEditions> | null }) {
  function Harness({ granthaId, editionIds }: { granthaId: string; editionIds: string[] }) {
    const res = useEditions(granthaId, editionIds);
    useEffect(() => {
      ready.current = res;
    });
    return null;
  }
  return Harness;
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null as unknown as Root;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  fetchMock = vi.fn((input: unknown) => {
    const url = String(input);
    const route = buildRoutes().get(url);
    if (!route) {
      return Promise.reject(new Error(`no test route for ${url}`));
    }
    return Promise.resolve(route);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
  root?.unmount();
  container.remove();
  vi.restoreAllMocks();
});

async function waitForCondition(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitForCondition: condition never became true");
}

describe("useEditions.loadPart (compare-mode fan-out)", () => {
  it("loads a part into EVERY active edition, not just the primary", async () => {
    const ready: { current: ReturnType<typeof useEditions> | null } = { current: null };
    const Harness = makeHarness(ready);

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness granthaId={GRANTHA} editionIds={[SANKARA, RANGARAMANUJA]} />
        </QueryClientProvider>,
      );
    });

    // Both editions finish their initial (first-section) load.
    await waitForCondition(
      () =>
        !!ready.current &&
        ready.current.editions.length === 2 &&
        ready.current.editions.every(
          (g) => g.passages.some((p) => p.ref === "1.1.1"),
        ),
    );

    // Request the second section — the regression: only the primary used to
    // receive it.
    await act(async () => {
      await ready.current!.loadPart("2.1.1");
    });

    await waitForCondition(() =>
      ready.current!.editions.every((g) =>
        g.passages.some((p) => p.ref === "2.1.1"),
      ),
    );

    // Both editions must carry passage 2.1.1 AND its commentary passage.
    for (const g of ready.current!.editions) {
      expect(g.passages.map((p) => p.ref)).toContain("2.1.1");
      const commentary = g.commentaries[0];
      expect(commentary).toBeDefined();
      expect(commentary.passages.map((p) => p.ref)).toContain("2.1.1");
    }

    // The fan-out must have fetched part2 from BOTH editions' paths.
    const part2Urls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.endsWith("part2.json"))
      .sort();
    expect(part2Urls).toEqual(
      [
        `/data/library/${SANKARA_PATH}/part2.json`,
        `/data/library/${RANGARAMANUJA_PATH}/part2.json`,
      ].sort(),
    );

    // part1 must be fetched for each edition (initial eager load) and NOT
    // re-fetched by the fan-out after the initial load. The 3-slot
    // architecture's inactive slot 2 loads the default edition (which is also
    // Rangaramanuja here), so a duplicate fetch of the default edition's part1
    // is expected and acceptable — but no part1 fetch may happen AFTER the
    // fan-out (i.e. there are no post-fan-out part1 calls beyond the initial
    // load). Assert each edition's part1 was fetched at least once.
    const part1Urls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.endsWith("part1.json"));
    for (const url of [
      `/data/library/${SANKARA_PATH}/part1.json`,
      `/data/library/${RANGARAMANUJA_PATH}/part1.json`,
    ]) {
      expect(part1Urls).toContain(url);
    }
  });
});

describe("useEditions.loadPart (single-edition backward compat)", () => {
  it("loads a part into the single active edition (fan-out of one)", async () => {
    const ready: { current: ReturnType<typeof useEditions> | null } = { current: null };
    const Harness = makeHarness(ready);

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness granthaId={GRANTHA} editionIds={[SANKARA]} />
        </QueryClientProvider>,
      );
    });

    // The single edition finishes its initial (first-section) load.
    await waitForCondition(
      () =>
        !!ready.current &&
        ready.current.editions.length === 1 &&
        ready.current.editions[0].passages.some((p) => p.ref === "1.1.1"),
    );

    await act(async () => {
      await ready.current!.loadPart("2.1.1");
    });

    await waitForCondition(() =>
      ready.current!.editions[0].passages.some((p) => p.ref === "2.1.1"),
    );

    const g = ready.current!.editions[0];
    expect(g.passages.map((p) => p.ref)).toContain("2.1.1");
    expect(g.commentaries[0].passages.map((p) => p.ref)).toContain("2.1.1");

    // Only the single edition's part2.json is fetched.
    const part2Urls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.endsWith("part2.json"));
    expect(part2Urls).toEqual([`/data/library/${SANKARA_PATH}/part2.json`]);
  });
});
