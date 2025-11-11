# Plan: Web App Codebase Cleanup

## Problem Statement

While the codebase is generally well-structured, several areas have been identified as potential 'hacks' or code smells that could impact maintainability, robustness, and developer understanding. The most critical issue is the custom parsing and rendering of rich text in `CommentaryPanel.tsx`.

## Goal

To improve the maintainability, robustness, and clarity of the web application by addressing identified 'hacks' and code smells, prioritizing the refactoring of the `CommentaryPanel.tsx` component.

## Detailed Plan

### Issue 1: Fragile Custom Rich Text Parsing in `components/CommentaryPanel.tsx`

*   **Problem:** The `CommentaryPanel.tsx` component uses `dangerouslySetInnerHTML` and custom, regex-based parsing to render rich text and identify references. This approach is brittle, difficult to maintain, prone to errors, and a potential security vulnerability.
*   **Proposed Solution:**
    1.  **Introduce a Markdown Parsing Library:** Integrate a well-established and secure Markdown parsing library (e.g., `remark`, `markdown-it`) to convert Markdown-like commentary text into a structured format (e.g., AST or HTML).
    2.  **Refactor Reference Handling:** Adapt the reference identification logic to work with the output of the Markdown parser, ensuring robust and accurate linking.
    3.  **Remove `dangerouslySetInnerHTML`:** Render the parsed content using React components, eliminating the need for `dangerouslySetInnerHTML` and improving security and control over the rendered output.
*   **Benefits:** Enhanced security, improved maintainability, easier extension of rich text features, and a more robust rendering pipeline.

### Issue 2: Non-Standard `useRef` as Flag in `components/TextContent.tsx`

*   **Problem:** The `TextContent.tsx` component uses a `useRef` (`clickedInternally`) as a flag to control the firing of a `useEffect` hook. While functional, this pattern is not immediately obvious and can make the component's logic harder to follow for new developers.
*   **Proposed Solution:**
    1.  **Evaluate Alternatives:** Explore more idiomatic React patterns for controlling `useEffect` dependencies or preventing unwanted re-renders. This might involve restructuring state, using `useCallback` or `useMemo` more effectively, or re-evaluating the trigger conditions for the `useEffect`.
    2.  **Improve Clarity (if ref is kept):** If a `useRef` flag remains the most practical solution, add comprehensive comments explaining its purpose and behavior.
*   **Benefits:** Improved code readability, easier onboarding for new developers, and adherence to more standard React practices.

### Issue 3: Separate Responsive Layout Components (`MobileLayout.tsx`, `TabletLayout.tsx`)

*   **Problem:** The application uses distinct components for different screen sizes, which can lead to code duplication and increased complexity if shared logic or UI elements are not carefully abstracted.
*   **Proposed Solution:**
    1.  **Identify Shared Logic/Components:** Analyze `MobileLayout.tsx` and `TabletLayout.tsx` to identify common UI elements, state management, or functionality.
    2.  **Abstract Common Elements:** Extract shared components or hooks that can be reused across different layouts.
    3.  **Consider a Single Layout with Conditional Rendering/Styling:** For future development, evaluate if a single, more flexible layout component with conditional rendering or CSS-based responsiveness (e.g., using Tailwind CSS variants or CSS-in-JS solutions) could simplify the structure, especially if the differences between layouts are primarily stylistic.
*   **Benefits:** Reduced code duplication, improved maintainability of layout logic, and a more scalable responsive design strategy.

## Next Steps

1.  Prioritize the refactoring of `CommentaryPanel.tsx` due to its critical nature.
2.  Investigate and implement a suitable Markdown parsing library.
3.  Refactor `CommentaryPanel.tsx` to use the new parsing and rendering approach.
4.  Review `TextContent.tsx` for potential improvements to its `useEffect` control mechanism.
5.  Analyze layout components for opportunities to abstract shared logic.