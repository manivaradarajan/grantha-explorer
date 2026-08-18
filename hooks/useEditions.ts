"use client";

import { useCallback } from "react";
import { Grantha } from "@/lib/data";
import { useGranthaLoader } from "./useGranthaLoader";

export interface UseEditionsReturn {
  /** Loaded grantha objects, one per active edition id, in selection order.
   *  Entries beyond the active count are undefined (unused slots). */
  editions: Grantha[];
  /** True while any active edition is still loading. */
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Load a part file into EVERY active edition (compare mode), or into the
   *  single active edition otherwise. See the fan-out contract below. */
  loadPart: (firstRef: string) => Promise<void>;
  /** True while any active edition is loading a part. */
  isLoadingPart: boolean;
}

const MAX_COMPARE_EDITIONS = 3;

/**
 * Sibling hook to `useGranthaLoader` for compare mode — loads one grantha
 * object per active edition id by calling the existing loader once per id.
 *
 * This is deliberately NOT a change to `useGranthaLoader`'s own contract: it
 * keeps returning a single `{ grantha, isLoading, error, ... }` for every
 * existing caller, and this hook fans out to N of those. Each call reuses the
 * same per-edition query key / cache (`["grantha", granthaId, editionId]`), so
 * editions already loaded by the panes view are served from cache.
 *
 * Because React hooks cannot be called in a loop, the hook reserves a fixed
 * number of slots (max 3, per the compare-mode cap). Slots beyond the active
 * edition count receive `undefined` and fall back to the default-edition query
 * (which is either already cached or small); callers index only the active
 * entries.
 *
 * **`loadPart` fan-out contract.** "Load a part" is edition-agnostic: all
 * editions of a grantha share the same envelope `parts[]` boundaries
 * (`first_ref`s), so a request to load section X is fanned out to every active
 * edition's own `loadPart` (each of which fetches from its resolved per-edition
 * path and merges into its own cache key, including subcommentary re-nesting).
 * It never rejects: each slot's loader swallows per-edition fetch failures, and
 * a slot whose grantha is not yet loaded no-ops on `!grantha || !grantha.parts`.
 *
 * Args:
 *     granthaId: The grantha to load editions of.
 *     editionIds: Active edition ids, in display order. May be empty (default
 *         edition), a single id, or a compare-mode list of up to 3.
 */
export function useEditions(
  granthaId: string,
  editionIds: string[]
): UseEditionsReturn {
  const ids = editionIds.slice(0, MAX_COMPARE_EDITIONS);

  // Fixed slots — hook order is stable across renders.
  const r0 = useGranthaLoader(granthaId, ids[0]);
  const r1 = useGranthaLoader(granthaId, ids[1]);
  const r2 = useGranthaLoader(granthaId, ids[2]);

  const results = [r0, r1, r2];
  const active = results.slice(0, Math.max(1, ids.length));

  // useGranthaLoader's placeholderData keeps the previous edition visible while
  // a new one fetches — correct for single-edition switching, wrong for compare
  // (it would show another column's data in a loading column). Filter out any
  // grantha whose stamped edition_id doesn't match the requested id, so a
  // placeholder is treated as not-yet-loaded rather than shown as real content.
  const editions = active
    .map((r, i) => ({ r, id: ids[i] }))
    .filter(({ r, id }) => r.grantha === undefined || r.grantha.edition_id === id)
    .map(({ r }) => r.grantha as Grantha | undefined)
    .filter((g): g is Grantha => g !== undefined);

  // Fan out a part request to every active edition's own loader. Memoized on
  // the inner `loadPart` callbacks (NOT the slot objects, which are fresh
  // object literals every render): an edition's loader is `useCallback`-stable
  // and only changes when that edition's grantha actually merges, so this
  // composite identity is stable unless a part lands or the active set changes.
  // `activeCount` is a primitive, so it never breaks memoization.
  const activeCount = Math.max(1, ids.length);
  const loadPart = useCallback(
    async (firstRef: string): Promise<void> => {
      const loaders = [r0.loadPart, r1.loadPart, r2.loadPart];
      await Promise.all(loaders.slice(0, activeCount).map((l) => l(firstRef)));
    },
    [r0.loadPart, r1.loadPart, r2.loadPart, activeCount],
  );

  return {
    editions,
    isLoading: active.some((r) => r.isLoading),
    isError: active.some((r) => r.isError),
    error: active.find((r) => r.error)?.error ?? null,
    loadPart,
    isLoadingPart: active.some((r) => r.isLoadingPart),
  };
}
