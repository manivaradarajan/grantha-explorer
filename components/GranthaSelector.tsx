"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GranthaMetadata } from "@/lib/data";

interface GranthaSelectorProps {
  granthas: GranthaMetadata[];
  selectedGranthaId: string;
  onSelect: (granthaId: string) => void;
  /** Overrides the default trigger button className for alternate rendering contexts. */
  triggerClassName?: string;
}

const LISTBOX_ID = "grantha-picker-listbox";

/**
 * Grantha picker rendered as a bold tappable line with a thin bottom rule,
 * matching the sticky heading's segment styling rather than a bordered box.
 * The picker popup is a portal-based listbox with full keyboard support.
 */
export default function GranthaSelector({
  granthas,
  selectedGranthaId,
  onSelect,
  triggerClassName,
}: GranthaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const selectedGrantha = granthas.find((g) => g.id === selectedGranthaId);
  const selectedTitle = selectedGrantha?.title_deva ?? "";

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

  const selectOption = (granthaId: string) => {
    triggerRef.current?.focus();
    onSelect(granthaId);
    close();
  };

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const nextIndex = Math.min(
      granthas.length - 1,
      Math.max(0, currentIndex + direction),
    );
    optionRefs.current[nextIndex]?.focus();
  };

  const currentFocusIndex = () => {
    const current = document.activeElement;
    const index = granthas.findIndex(
      (_, i) => optionRefs.current[i] === current,
    );
    return index >= 0
      ? index
      : granthas.findIndex((g) => g.id === selectedGranthaId);
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
      optionRefs.current[e.key === "Home" ? 0 : granthas.length - 1]?.focus();
    }
  };

  // When the picker opens, land focus on the currently selected option so
  // keyboard/screen-reader users always start on the highlighted entry.
  useEffect(() => {
    if (!open) return;
    const idx = granthas.findIndex((g) => g.id === selectedGranthaId);
    optionRefs.current[idx >= 0 ? idx : 0]?.focus();
  }, [open, granthas, selectedGranthaId]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? LISTBOX_ID : undefined}
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        className={
          triggerClassName ??
          "w-full flex items-center justify-between gap-2 font-bold text-base border-b border-gray-300 pt-1 pb-2 text-left bg-transparent cursor-pointer"
        }
      >
        <span className="truncate min-w-0 pt-1">{selectedTitle}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 flex-shrink-0"
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
              aria-label="Select grantha"
              onKeyDown={handleListboxKeyDown}
              className="fixed z-50 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
              style={{
                top: Math.min(triggerRect.bottom + 4, 8),
                left: triggerRect.left,
                maxHeight: window.innerHeight - 16,
                width: Math.max(
                  140,
                  Math.min(240, window.innerWidth - triggerRect.left - 8),
                ),
                minWidth: 0,
              }}
            >
              {granthas.map((grantha, index) => {
                const isSelected = grantha.id === selectedGranthaId;
                return (
                  <button
                    key={grantha.id}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onClick={() => selectOption(grantha.id)}
                    className={`block w-full text-left text-sm px-3 py-2 cursor-pointer ${
                      isSelected
                        ? "font-bold text-gray-900 bg-gray-100"
                        : "font-normal text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {grantha.title_deva}
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
