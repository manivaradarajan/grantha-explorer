import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Commentary, Grantha, loadGrantha, loadGranthaPart, sortPassagesByRef } from "@/lib/data";
import { useState, useCallback } from "react";

interface UseGranthaLoaderReturn {
  grantha: Grantha | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  loadPart: (firstRef: string) => Promise<void>;
  isLoadingPart: boolean;
}

export function useGranthaLoader(granthaId: string, editionId?: string): UseGranthaLoaderReturn {
  const queryClient = useQueryClient();
  const [isLoadingPart, setIsLoadingPart] = useState(false);

  const { data: grantha, isLoading: isGranthaLoading, error: granthaError } = useQuery<Grantha>({
    // Key includes the edition so switching editions is a distinct query (the
    // per-edition cache is the substrate for a future side-by-side view).
    queryKey: ["grantha", granthaId, editionId ?? "default"],
    queryFn: () => loadGrantha(granthaId, editionId),
    // Keep the previously loaded edition visible while a new edition fetches,
    // so the mula text doesn't blank out mid-switch. Returns the most recent
    // cached edition with data for this granthaId, if any.
    placeholderData: () => {
      if (!editionId) return undefined;
      const cached = queryClient.getQueriesData<Grantha>({ queryKey: ["grantha", granthaId] });
      const withData = cached.filter(([, data]) => data !== undefined);
      return withData.length > 0 ? withData[withData.length - 1][1] : undefined;
    },
    // Granthas are cached, but we might be updating them with more parts.
    // Stale time can be short, but cache time should be long.
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const loadPart = useCallback(async (firstRef: string) => {
    if (!grantha || !grantha.parts) {
      return;
    }

    // Find the part info from the metadata using the unique first_ref key.
    const partInfo = grantha.parts.find(p => p.first_ref === firstRef);
    if (!partInfo) {
      console.warn(`Part with first_ref ${firstRef} not found in grantha ${granthaId}`);
      return;
    }

    // A part file is loaded iff its first passage is present in the cache.
    const isPartLoaded = grantha.passages.some(p => p.ref === firstRef);
    if (isPartLoaded) {
      return;
    }

    setIsLoadingPart(true);
    try {
      const partFileName = partInfo.file;
      // Pass the resolved edition path (stored during loadGrantha), never the
      // index entry's default-edition path, so lazy loads fetch from the
      // currently active edition.
      const partContent = await loadGranthaPart(grantha.path, partFileName);

      // Update the query data in the cache (same key as the useQuery above)
      queryClient.setQueryData<Grantha>(["grantha", granthaId, editionId ?? "default"], (oldData) => {
        if (!oldData) return oldData;

        // Create a new grantha object to ensure reactivity
        const newData = { ...oldData };
        const existingRefs = new Set(oldData.passages.map(p => p.ref));

        // Merge passages, filtering out duplicates
        if (partContent.passages) {
          const newPassages = partContent.passages
            .filter(p => !existingRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.first_ref }));
          newData.passages = sortPassagesByRef([...newData.passages, ...newPassages]);
        }

        // Merge prefatory material, filtering out duplicates
        const existingPrefatoryRefs = new Set(oldData.prefatory_material.map(p => p.ref));
        if (partContent.prefatory_material) {
          const newPrefatory = partContent.prefatory_material
            .filter(p => !existingPrefatoryRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.first_ref }));
          newData.prefatory_material = [...newData.prefatory_material, ...newPrefatory];
        }

        // Merge concluding material, filtering out duplicates
        const existingConcludingRefs = new Set(oldData.concluding_material.map(p => p.ref));
        if (partContent.concluding_material) {
          const newConcluding = partContent.concluding_material
            .filter(p => !existingConcludingRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.first_ref }));
          newData.concluding_material = [...newData.concluding_material, ...newConcluding];
        }

        // Merge commentaries — handle all three formats:
        //   new schema:  commentary  (single Commentary object)
        //   legacy array: commentaries (Commentary[])
        //   legacy dict:  commentaries (Record<id, Commentary>)
        const rawCommentaries = partContent.commentary
          ? [partContent.commentary]
          : (partContent.commentaries ?? []);
        const incomingCommentaries: Commentary[] = Array.isArray(rawCommentaries)
          ? rawCommentaries
          : Object.values(rawCommentaries);
        for (const commentaryPart of incomingCommentaries) {
          const existingCommentary = newData.commentaries.find(
            c => c.commentary_id === commentaryPart.commentary_id
          );
          if (existingCommentary) {
            existingCommentary.passages = existingCommentary.passages ?? [];
            const existingCommentaryRefs = new Set(existingCommentary.passages.map(p => p.ref));
            const newCommentaryPassages = commentaryPart.passages.filter(p => !existingCommentaryRefs.has(p.ref));
            existingCommentary.passages.push(...newCommentaryPassages);
          } else {
            // commentary_id not yet in cache (e.g. source file uses a different
            // spelling of the id than the part that was loaded initially).
            // Without this branch, all passages for the incoming commentary are
            // silently dropped and no commentary renders for refs in this part.
            newData.commentaries = [...newData.commentaries, commentaryPart];
          }
        }
        
        return newData;
      });
    } catch (error) {
      console.error(`Failed to load part ${firstRef} for ${granthaId}:`, error);
      // Optionally, handle the error state in the UI
    } finally {
      setIsLoadingPart(false);
    }
  }, [grantha, granthaId, editionId, queryClient]);

  return {
    grantha,
    isLoading: isGranthaLoading,
    isError: !!granthaError,
    error: granthaError,
    loadPart,
    isLoadingPart,
  };
}
