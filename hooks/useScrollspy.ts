"use client";

import { useEffect, type RefObject } from "react";

/**
 * Track which verse is currently in view inside a scroll container, invoking a
 * callback with the ref of that verse.
 *
 * Unlike a plain IntersectionObserver band (which can be empty when verses are
 * small and sparsely spaced — compare mode's columns), this hook picks the
 * **single verse nearest the container's vertical center** on every scroll:
 * the container always has a center line, so there is always exactly one
 * "current" verse. This holds for both the single-column flow (tall mūla +
 * commentary blocks) and compare mode (short blocks far apart).
 *
 * An IntersectionObserver is used only to re-evaluate the current verse when
 * content is inserted above/below (lazy part loads) — the nearest-center
 * computation itself runs on scroll/resize.
 *
 * Args:
 *     containerRef: Ref to the scroll container holding `[data-verse-ref]`
 *         elements.
 *     reobserveDeps: Values that, when changed, should tear down and rebuild
 *         the observer and recompute (e.g. the passage list, layout flips).
 *     onCurrentChange: Called with the ref of the verse nearest the viewport
 *         center, whenever it changes.
 */
export function useScrollspy(
  containerRef: RefObject<HTMLElement | null>,
  reobserveDeps: unknown[],
  onCurrentChange: (ref: string) => void,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reportNearestCenter = () => {
      const center =
        container.scrollTop + container.clientHeight / 2;
      let best: { el: HTMLElement; dist: number } | null = null;
      for (const el of container.querySelectorAll<HTMLElement>("[data-verse-ref]")) {
        const r = el.getBoundingClientRect();
        // Distance from the verse's midpoint to the container's center line,
        // in scrollTop space.
        const mid =
          r.top - container.getBoundingClientRect().top + container.scrollTop +
          r.height / 2;
        const dist = Math.abs(mid - center);
        if (!best || dist < best.dist) {
          best = { el, dist };
        }
      }
      if (!best) return;
      const ref = best.el.getAttribute("data-verse-ref");
      if (ref) onCurrentChange(ref);
    };

    // Re-evaluate on scroll and resize (including layout flips that change
    // verse positions without a resize event).
    container.addEventListener("scroll", reportNearestCenter, { passive: true });
    const ro = new ResizeObserver(reportNearestCenter);
    ro.observe(container);
    // Re-evaluate when lazy loads insert content (offsetTop shifts) — the
    // ResizeObserver fires for the container's own size change only, so use an
    // IO on the verse set to catch content insertions too.
    const io = new IntersectionObserver(reportNearestCenter, {
      root: container,
    });
    container
      .querySelectorAll<HTMLElement>("[data-verse-ref]")
      .forEach((el) => io.observe(el));

    // Initial report (mount / deps change).
    reportNearestCenter();

    return () => {
      container.removeEventListener("scroll", reportNearestCenter);
      ro.disconnect();
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, reobserveDeps);
}
