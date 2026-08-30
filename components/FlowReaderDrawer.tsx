"use client";

import MobileDrawer from "./MobileDrawer";
import { useFootnoteMode } from "@/lib/contexts/FootnoteModeContext";

interface FlowReaderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  script: "deva" | "roman";
  onScriptToggle: () => void;
  fontScale: number;
  onFontScaleChange: (next: number) => void;
  /** Switch back to the 3-pane view (the "३-पटलम्" exit). */
  onExitFlow: () => void;
}

/**
 * Left drawer for the flow reader — reading preferences (script + font size),
 * search (input only, no backend), a reserved placeholder area, and an
 * account/settings placeholder row. Reuses the existing MobileDrawer via its
 * optional label prop (spec §3.2, §7 gap #11). App branding is the sr-only
 * `<h1>Grantha Explorer</h1>` already present in the flow reader header (the
 * AppWordmark component is not reused — §7 gap #14).
 */
export default function FlowReaderDrawer({
  isOpen,
  onClose,
  script,
  onScriptToggle,
  fontScale,
  onFontScaleChange,
  onExitFlow,
}: FlowReaderDrawerProps) {
  const roman = script === "roman";
  const { footnoteModeEnabled, toggleFootnoteMode } = useFootnoteMode();
  return (
    <MobileDrawer isOpen={isOpen} onClose={onClose} label="Reading preferences">
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="text-xs text-gray-400 mb-3">
            {roman ? "Reading" : "पठनम्"}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {roman ? "Script" : "लिपि"}
            </span>
            <button
              type="button"
              onClick={onScriptToggle}
              className="w-auto px-2 h-7 rounded text-sm font-serif text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              title="Devanāgarī / IAST — labels only, not body text"
            >
              {roman ? "lipi" : "लिपि"}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-gray-600">
              {roman ? "Text size" : "अक्षर"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onFontScaleChange(fontScale - 0.1)}
                disabled={fontScale <= 0.75}
                className="w-7 h-7 rounded text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
                title="Smaller text"
              >
                अ−
              </button>
              <button
                type="button"
                onClick={() => onFontScaleChange(fontScale + 0.1)}
                disabled={fontScale >= 1.4}
                className="w-7 h-7 rounded text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
                title="Larger text"
              >
                अ+
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search across all granthas…"
            aria-label="Search across all granthas"
            className="w-full font-serif text-sm pl-3 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
          />
        </div>

        <div className="border-b border-gray-100 p-3">
          <label className="flex items-center gap-2 px-2 py-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={footnoteModeEnabled}
              onChange={toggleFootnoteMode}
              className="accent-blue-600"
            />
            <span>{roman ? "Footnotes" : "पादटिप्पणी"}</span>
          </label>
          <button
            type="button"
            onClick={onExitFlow}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-500"
            title="Back to 3-pane view"
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4h4v12H4zM12 4h4v12h-4z"
              />
            </svg>
            <span>{roman ? "3-pane view" : "३-पटलम्"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-400 flex items-center justify-center text-center">
          <div>
            <div className="mb-1">full-text search results,</div>
            <div className="mb-1">grantha browser, bookmarks —</div>
            <div>whatever else ends up here</div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3">
          {/* Dev entry point to the reference-diagnostics view (spec §6). The
              #diagnostics hash is intercepted by page.tsx before parse/validate.
              Permanent dev-mode triage channel for unresolved / deferred refs. */}
          <a
            href="#diagnostics"
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm text-gray-500"
          >
            <span>Reference diagnostics</span>
          </a>
          <button
            type="button"
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors mt-1"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
            <span className="text-sm text-gray-500">Account · Settings</span>
          </button>
        </div>
      </div>
    </MobileDrawer>
  );
}
