// @vitest-environment jsdom
/**
 * Tests for FootnoteModeContext: provider, hook, localStorage persistence, and
 * error resilience.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import {
  FootnoteModeProvider,
  useFootnoteMode,
  type FootnoteModeContextValue,
} from "./FootnoteModeContext";

const STORAGE_KEY = "grantha-footnote-mode";

let el: HTMLDivElement;
let root: Root;
let captured: FootnoteModeContextValue | null = null;

/** Spy component that captures the context value on each render. */
function Spy() {
  captured = useFootnoteMode();
  return null;
}

const renderProvider = async () => {
  await act(async () => {
    root.render(
      <FootnoteModeProvider>
        <Spy />
      </FootnoteModeProvider>,
    );
  });
};

beforeEach(() => {
  localStorage.clear();
  captured = null;
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  el.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("FootnoteModeContext", () => {
  it("defaults to false when localStorage has no key", async () => {
    await renderProvider();
    expect(captured!.footnoteModeEnabled).toBe(false);
  });

  it("reads true from localStorage when key is set before mount", async () => {
    localStorage.setItem(STORAGE_KEY, "true");
    await renderProvider();
    expect(captured!.footnoteModeEnabled).toBe(true);
  });

  it("toggle sets state from false to true", async () => {
    await renderProvider();
    expect(captured!.footnoteModeEnabled).toBe(false);
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    expect(captured!.footnoteModeEnabled).toBe(true);
  });

  it("toggle returns to false on second call", async () => {
    await renderProvider();
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    expect(captured!.footnoteModeEnabled).toBe(false);
  });

  it("persists state to localStorage on toggle", async () => {
    await renderProvider();
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("persists across provider re-mount", async () => {
    await renderProvider();
    await act(async () => {
      captured!.toggleFootnoteMode();
    });
    // Unmount and re-mount a fresh provider.
    await act(async () => {
      root.unmount();
    });
    const el2 = document.createElement("div");
    document.body.appendChild(el2);
    const root2 = createRoot(el2);
    await act(async () => {
      root2.render(
        <FootnoteModeProvider>
          <Spy />
        </FootnoteModeProvider>,
      );
    });
    expect(captured!.footnoteModeEnabled).toBe(true);
    await act(async () => {
      root2.unmount();
    });
    el2.remove();
  });

  it("falls back to false and does not throw when getItem throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(renderProvider()).resolves.not.toThrow();
    expect(captured!.footnoteModeEnabled).toBe(false);
  });

  it("does not throw when setItem throws during toggle", async () => {
    await renderProvider();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(
      act(async () => {
        captured!.toggleFootnoteMode();
      }),
    ).resolves.not.toThrow();
    // State still toggles in memory even if write fails.
    expect(captured!.footnoteModeEnabled).toBe(true);
  });
});
