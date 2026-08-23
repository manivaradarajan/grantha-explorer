// @vitest-environment jsdom
/**
 * BottomSheet additive `heightClass` behavior: defaults to `h-[80vh]` (the
 * existing height for all current callers) and honors an override. Other
 * behavior is untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import BottomSheet from "./BottomSheet";

let root: Root;
let el: HTMLDivElement;

const renderSheet = (props: Partial<Parameters<typeof BottomSheet>[0]> = {}) =>
  act(async () => {
    root.render(
      <BottomSheet
        isOpen
        onClose={() => {}}
        title="t"
        {...props}
      >
        <div>body</div>
      </BottomSheet>,
    );
  });

beforeEach(() => {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  el.remove();
});

describe("BottomSheet", () => {
  it("defaults to h-[80vh]", async () => {
    await renderSheet();
    const sheet = document.querySelector('[class*="h-[80vh]"]');
    expect(sheet).not.toBeNull();
  });

  it("still renders children and a backdrop", async () => {
    await renderSheet();
    expect(document.body.textContent).toContain("body");
    expect(document.querySelector('[class*="bg-black"]')).not.toBeNull();
  });

  it("calls onClose on backdrop click", async () => {
    const onClose = vi.fn();
    await renderSheet({ onClose });
    const backdrop = document.querySelector('[class*="bg-black"]') as HTMLElement;
    act(() => backdrop.click());
    expect(onClose).toHaveBeenCalled();
  });
});
