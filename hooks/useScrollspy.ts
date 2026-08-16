"use client";

import { useEffect, type RefObject } from "react";

/**
 * Observe the verse elements inside a scroll container and invoke a callback
 * with the ref of whichever verse is currently in view.
 *
 * The observer is set up (and torn down) whenever `reobserveDeps` changes —
 * pass the data the observed elements are derived from so the observer tracks
 * newly-loaded parts. The callback runs on IntersectionObserver entries, so it
 * fires on scroll without re-rendering the observed content; callers should
 * update their own highlight state/classes imperatively or via a cheap state
 * change.
 *
 * Args:
 *     containerRef: Ref to the scroll container holding `[data-verse-ref]`
 *         elements.
 *     reobserveDeps: Values that, when changed, should tear down and rebuild
 *         the observer (e.g. the passage list).
 *     onCurrentChange: Called with the ref of the verse that just entered the
 *         view band. Fires at most once per observed transition.
 */
export function useScrollspy(
  containerRef: RefObject<HTMLElement | null>,
  reobserveDeps: unknown[],
  onCurrentChange: (ref: string) => void,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const elements = container.querySelectorAll<HTMLElement>("[data-verse-ref]");
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const ref = entry.target.getAttribute("data-verse-ref");
            if (ref) onCurrentChange(ref);
          }
        }
      },
      { root: container, rootMargin: "-20% 0px -70% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, reobserveDeps);
}
