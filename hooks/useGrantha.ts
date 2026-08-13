"use client";

import { useQuery } from "@tanstack/react-query";
import { GranthaMetadata, getAvailableGranthas } from "@/lib/data";

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