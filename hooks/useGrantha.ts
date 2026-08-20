"use client";

import { useQuery } from "@tanstack/react-query";
import { GranthaMeta, GranthaMetadata, getAvailableGranthas, getGranthasMeta } from "@/lib/data";

/**
 * Hook to load list of available granthas
 */
export function useAvailableGranthas() {
  return useQuery<GranthaMetadata[]>({
    queryKey: ["granthas"],
    queryFn: getAvailableGranthas,
    // List rarely changes, cache for long time
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Hook to load the granthas-meta title/abbreviation registry.
 *
 * The meta file carries Devanagari + IAST titles for every known grantha —
 * including works cited but NOT on disk. Consumers that need a display title
 * for a not-in-library target (e.g. the reference tooltip) merge this in.
 */
export function useGranthasMeta() {
  return useQuery<GranthaMeta>({
    queryKey: ["granthas-meta"],
    queryFn: getGranthasMeta,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}