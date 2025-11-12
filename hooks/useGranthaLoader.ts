import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Grantha, GranthaPartContent, loadGrantha, loadGranthaPart } from "@/lib/data";
import { useState } from "react";

export function useGranthaLoader(granthaId: string) {
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

  const loadPart = async (partId: string) => {
    if (!grantha || !grantha.parts) {
      return;
    }

    // Find the part info from the metadata
    const partInfo = grantha.parts.find(p => p.id === partId);
    if (!partInfo) {
      console.warn(`Part with id ${partId} not found in grantha ${granthaId}`);
      return;
    }

    // Check if the part is already loaded to avoid redundant fetches.
    const isPartLoaded = grantha.passages.some(p => p.part_id === partId);
    if (isPartLoaded) {
      return;
    }

    setIsLoadingPart(true);
    try {
      const partFileName = partInfo.file;
      const partContent = await loadGranthaPart(grantha.grantha_id, partFileName);

      // Update the query data in the cache
      queryClient.setQueryData<Grantha>(["grantha", granthaId], (oldData) => {
        if (!oldData) return oldData;

        // Create a new grantha object to ensure reactivity
        const newData = { ...oldData };

        // Merge passages
        if (partContent.passages) {
          newData.passages = [...newData.passages, ...partContent.passages.map(p => ({ ...p, part_id: partId }))];
        }
        // Merge prefatory material
        if (partContent.prefatory_material) {
          newData.prefatory_material = [...newData.prefatory_material, ...partContent.prefatory_material.map(p => ({ ...p, part_id: partId }))];
        }
        // Merge concluding material
        if (partContent.concluding_material) {
          newData.concluding_material = [...newData.concluding_material, ...partContent.concluding_material.map(p => ({ ...p, part_id: partId }))];
        }
        // Merge commentaries
        if (partContent.commentaries) {
          partContent.commentaries.forEach(commentaryPart => {
            const existingCommentary = newData.commentaries.find(
              c => c.commentary_id === commentaryPart.commentary_id
            );
            if (existingCommentary) {
              existingCommentary.passages.push(...commentaryPart.passages);
            }
          });
        }
        
        return newData;
      });
    } catch (error) {
      console.error(`Failed to load part ${partId} for ${granthaId}:`, error);
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
