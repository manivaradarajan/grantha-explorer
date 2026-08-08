import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Commentary, Grantha, GranthaPartContent, loadGrantha, loadGranthaPart } from "@/lib/data";
import { useState, useEffect } from "react";

interface UseGranthaLoaderReturn {
  grantha: Grantha | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  loadPart: (firstRef: string) => Promise<void>;
  isLoadingPart: boolean;
}

export function useGranthaLoader(granthaId: string): UseGranthaLoaderReturn {
  const queryClient = useQueryClient();
  const [isLoadingPart, setIsLoadingPart] = useState(false);

  const { data: grantha, isLoading: isGranthaLoading, error: granthaError } = useQuery<Grantha>({
    queryKey: ["grantha", granthaId],
    queryFn: () => loadGrantha(granthaId),
    // Granthas are cached, but we might be updating them with more parts.
    // Stale time can be short, but cache time should be long.
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const loadPart = async (firstRef: string) => {
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
      const partContent = await loadGranthaPart(grantha.id, partFileName);

      // Update the query data in the cache
      queryClient.setQueryData<Grantha>(["grantha", granthaId], (oldData) => {
        if (!oldData) return oldData;

        // Create a new grantha object to ensure reactivity
        const newData = { ...oldData };
        const existingRefs = new Set(oldData.passages.map(p => p.ref));

        // Merge passages, filtering out duplicates
        if (partContent.passages) {
          const newPassages = partContent.passages
            .filter(p => !existingRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.id }));
          newData.passages = [...newData.passages, ...newPassages];
        }

        // Merge prefatory material, filtering out duplicates
        const existingPrefatoryRefs = new Set(oldData.prefatory_material.map(p => p.ref));
        if (partContent.prefatory_material) {
          const newPrefatory = partContent.prefatory_material
            .filter(p => !existingPrefatoryRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.id }));
          newData.prefatory_material = [...newData.prefatory_material, ...newPrefatory];
        }

        // Merge concluding material, filtering out duplicates
        const existingConcludingRefs = new Set(oldData.concluding_material.map(p => p.ref));
        if (partContent.concluding_material) {
          const newConcluding = partContent.concluding_material
            .filter(p => !existingConcludingRefs.has(p.ref))
            .map(p => ({ ...p, part_id: partInfo.id }));
          newData.concluding_material = [...newData.concluding_material, ...newConcluding];
        }

        // Merge commentaries — handle all three formats:
        //   new schema:  commentary  (single Commentary object)
        //   legacy array: commentaries (Commentary[])
        //   legacy dict:  commentaries (Record<id, Commentary>)
        const incomingCommentaries: Commentary[] = partContent.commentary
          ? [partContent.commentary]
          : Array.isArray(partContent.commentaries)
            ? partContent.commentaries
            : Object.values(partContent.commentaries ?? {});
        for (const commentaryPart of incomingCommentaries) {
          const existingCommentary = newData.commentaries.find(
            c => c.commentary_id === commentaryPart.commentary_id
          );
          if (existingCommentary) {
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
  };

  return {
    grantha,
    isLoading: isGranthaLoading,
    isError: !!granthaError,
    error: granthaError,
    loadPart,
    isLoadingPart,
  };
}
