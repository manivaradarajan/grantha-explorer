"use client";

import { useQuery } from "@tanstack/react-query";
import { loadGrantha, Grantha, GranthaMetadata } from "@/lib/data";

/**
 * Hook to load and cache grantha data using React Query
 *
 * Features:
 * - Automatic caching (granthas cached forever)
 * - Request deduplication (multiple components requesting same grantha → single request)
 * - Race condition handling (ignores stale responses)
 * - Loading and error states
 *
 * @param granthaId - ID of the grantha to load
 * @returns Query result with grantha data, loading state, and error
 */
export function useGrantha(granthaId: string) {
  return useQuery({
    queryKey: ["grantha", granthaId],
    queryFn: () => loadGrantha(granthaId),
    // Granthas never change, cache forever
    staleTime: Infinity,
    gcTime: Infinity,
    // Enable query only if granthaId is provided
    enabled: Boolean(granthaId),
  });
}

/**
 * Hook to load list of available granthas
 */
export function useAvailableGranthas() {
  const { getAvailableGranthas } = require("@/lib/data");

  return useQuery<GranthaMetadata[]>({
    queryKey: ["granthas"],
    queryFn: getAvailableGranthas,
    // List rarely changes, cache for long time
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
