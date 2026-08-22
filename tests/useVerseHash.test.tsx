// @vitest-environment jsdom
/**
 * Regression test: display preferences must survive every hash write.
 * Historically `updateHash` built the hash with `includePreferences=false`, so
 * a scroll→hash update (and verse clicks) in flow mode silently dropped
 * `?s=roman` and reset the label script back to Devanagari mid-read.
 *
 * Note: `?s=` is the only display pref `useVerseHash` tracks (its state
 * carries `script`; `?l=`, `?dark=`, `?size=` are parsed by `parseHash` but
 * never stored in hook state, so buildHash re-drops them — a pre-existing gap
 * unrelated to this regression, not covered here).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useVerseHash } from "@/hooks/useVerseHash";
import type { ReadingMode } from "@/lib/hashUtils";

/** The slice of `useVerseHash` a harness exercises. */
interface HarnessApi {
  updateHash: (granthaId: string, verseRef: string) => void;
  script: "deva" | "roman";
  mode: ReadingMode;
}

// The harness publishes the hook's API through a module-level ref (written in
// an effect, so the react-compiler lint rules are satisfied); tests read the
// current value via `captured()`.
const capturedRef: { current: HarnessApi | null } = { current: null };
let root: Root | null = null;
let mountPoint: HTMLDivElement | null = null;

function Harness(): null {
  const vh = useVerseHash("bhagavad-gita", "1");
  useEffect(() => {
    capturedRef.current = {
      updateHash: (granthaId, verseRef) => vh.updateHash(granthaId, verseRef),
      script: vh.script,
      mode: vh.mode,
    };
  }, [vh]);
  return null;
}

function captured(): HarnessApi {
  const api = capturedRef.current;
  if (!api) throw new Error("Harness not mounted");
  return api;
}

function mount() {
  mountPoint = document.createElement("div");
  document.body.appendChild(mountPoint);
  root = createRoot(mountPoint);
  act(() => {
    root!.render(<Harness />);
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
  mountPoint?.remove();
  mountPoint = null;
}

describe("useVerseHash — display prefs survive hash writes", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  afterEach(() => {
    unmount();
    window.location.hash = "";
  });

  it("keeps ?s=roman and ?m=flow when updateHash navigates a verse", async () => {
    // A deep link carrying display prefs.
    window.location.hash = "#bhagavad-gita:1.1?s=roman&m=flow";
    mount();

    expect(captured().script).toBe("roman");
    expect(captured().mode).toBe("flow");

    // Simulate a scroll→hash (or click) update: same grantha, new verse.
    await act(async () => {
      captured().updateHash("bhagavad-gita", "1.2");
    });
    // Allow the hashchange listener to settle state.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(window.location.hash).toContain("bhagavad-gita:1.2");
    expect(window.location.hash).toContain("s=roman");
    expect(window.location.hash).toContain("m=flow");
  });

  it("keeps display prefs when only the verse changes via updateHash", async () => {
    window.location.hash = "#bhagavad-gita:1.1?s=roman&m=flow";
    mount();
    await act(async () => {
      captured().updateHash("bhagavad-gita", "1.3");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(window.location.hash).toContain("s=roman");
    expect(window.location.hash).toContain(":1.3");
  });
});
