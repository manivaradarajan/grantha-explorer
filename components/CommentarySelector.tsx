"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditionStub } from "@/lib/data";

interface CommentarySelectorProps {
  editions: EditionStub[];
  selectedEditionId?: string;
  onSelect: (editionId: string) => void;
  /** Overrides the default trigger button className for alternate contexts. */
  triggerClassName?: string;
}

const LISTBOX_ID = "commentary-picker-listbox";

/**
 * Single-select edition (commentary) switcher rendered as a caret button next
 * to the active commentary title, opening a portal-based listbox with full
 * keyboard support. Deliberately mirrors GranthaSelector's interaction;
 * extracting a shared Picker component is a deferred refactor.
 */
export default function CommentarySelector({
  editions,
  selectedEditionId,
  onSelect,
  triggerClassName,
}: CommentarySelectorProps) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // The effective selected edition: explicit URL choice, else default, else first.
  const selectedEdition =
    editions.find((e) => e.edition_id === selectedEditionId) ??
    editions.find((e) => e.isDefault) ??
    editions[0];

  const close = useCallback(() => setOpen(false), []);

  const openPicker = useCallback(() => {
    setTriggerRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  }, []);

  // Close on outside click or Escape; Escape also returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (listboxRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const selectOption = (editionId: string) => {
    triggerRef.current?.focus();
    onSelect(editionId);
    close();
  };

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const nextIndex = Math.min(
      editions.length - 1,
      Math.max(0, currentIndex + direction),
    );
    optionRefs.current[nextIndex]?.focus();
  };

  const currentFocusIndex = () => {
    const current = document.activeElement;
    const index = editions.findIndex(
      (_, i) => optionRefs.current[i] === current,
    );
    return index >= 0
      ? index
      : editions.findIndex((e) => e.edition_id === selectedEdition?.edition_id);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      moveFocus(currentFocusIndex(), e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) {
        close();
      } else {
        openPicker();
      }
    }
  };

  const handleListboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(currentFocusIndex(), e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      optionRefs.current[e.key === "Home" ? 0 : editions.length - 1]?.focus();
    }
  };

  // When the picker opens, land focus on the currently selected option.
  useEffect(() => {
    if (!open) return;
    const idx = editions.findIndex(
      (e) => e.edition_id === selectedEdition?.edition_id,
    );
    optionRefs.current[idx >= 0 ? idx : 0]?.focus();
  }, [open, editions, selectedEdition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? LISTBOX_ID : undefined}
        aria-label="Switch commentary edition"
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 cursor-pointer p-1 rounded hover:bg-gray-100 transition-colors"
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && triggerRect
        ? createPortal(
            <div
              ref={listboxRef}
              id={LISTBOX_ID}
              role="listbox"
              aria-label="Select commentary edition"
              onKeyDown={handleListboxKeyDown}
              className="fixed z-50 max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
              style={{
                top: Math.min(triggerRect.bottom + 4, window.innerHeight - 304),
                left: triggerRect.left,
                width: Math.max(
                  180,
                  Math.min(260, window.innerWidth - triggerRect.left - 8),
                ),
                minWidth: 0,
              }}
            >
              {editions.map((edition, index) => {
                const isSelected =
                  edition.edition_id === selectedEdition?.edition_id;
                return (
                  <button
                    key={edition.edition_id}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => selectOption(edition.edition_id)}
                    className={`block w-full text-left px-3 py-2 cursor-pointer ${
                      isSelected
                        ? "font-bold text-gray-900 bg-gray-100"
                        : "font-normal text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="block">
                      {edition.commentator?.devanagari || edition.edition_id}
                    </span>
                    {edition.commentary_title && (
                      <span className="block text-xs text-gray-500">
                        {edition.commentary_title}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
