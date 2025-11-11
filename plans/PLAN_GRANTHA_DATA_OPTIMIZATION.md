# Plan: Grantha Data Optimization

## Problem Statement

The current client-side merging of multi-part granthas in `lib/data.ts` is inefficient and complex, leading to potential performance issues and code maintainability challenges, especially for larger texts.

## Goal

To optimize grantha data loading by moving complex merging logic to build-time for smaller texts and implementing a hybrid, on-demand loading strategy for larger texts.

## Revised Plan

### Step 1: Analyze Grantha Sizes

*   **Action:** Create a script to calculate the total size of each grantha if all its parts were merged into a single JSON file.
*   **Output:** A report or log indicating the size of each grantha.
*   **Purpose:** To establish a data-driven threshold for determining "small" vs. "large" granthas.

### Step 2: Implement Build-Time Merging (for smaller granthas)

*   **Action:** Create a new script in `scripts/merge-multi-part-granthas.ts`.
*   **Functionality:**
    *   Identify granthas composed of multiple parts.
    *   For granthas below the defined size threshold, read all their parts and merge them into a single JSON file.
    *   Save these merged files into `public/data/library/`.
*   **Benefit:** Simplifies client-side logic and improves loading performance for common, smaller texts.

### Step 3: Implement Manifest-Based Loading (for larger granthas)

*   **Action:** For granthas exceeding the size threshold, the build-time script will generate a "manifest" file instead of a merged JSON.
*   **Manifest Content:** This file will contain the grantha's metadata and an ordered list of paths to its individual part files.
*   **Client-Side Logic (in `lib/data.ts`):**
    *   When `loadGrantha` is called for a large grantha, it will first fetch its manifest file.
    *   Individual parts will then be loaded on-demand as the user navigates through the text.
*   **Benefit:** Prevents loading excessively large JSON files, ensuring efficient performance for very long texts.

### Step 4: Refactor `lib/data.ts`

*   **Action:** Update the `loadGrantha` function in `lib/data.ts`.
*   **Functionality:**
    *   Remove the existing client-side merging logic.
    *   Implement logic to differentiate between pre-merged granthas (single file) and manifest-based granthas (load manifest, then parts on-demand).
*   **Benefit:** Cleaner, more maintainable, and more performant data loading logic.

## Next Steps

1.  Develop the grantha size analysis script.
2.  Define the size threshold for merging vs. manifest generation.
3.  Implement the build-time merging/manifest generation script.
4.  Refactor `lib/data.ts` to support the new loading strategies.