"use client";

import { useState } from "react";

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Accordion({
  title,
  children,
  isOpen,
  onToggle,
}: AccordionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left py-2 px-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg flex items-center"
      >
        <span
          className={`transform transition-transform mr-2 ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="font-semibold">{title}</span>
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}
