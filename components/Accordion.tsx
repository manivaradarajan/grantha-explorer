"use client";

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
        className="w-full text-left py-3 px-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg flex items-center min-h-[44px]"
      >
        <span
          className={`transform transition-transform mr-2 text-gray-600 ${isOpen ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="font-semibold text-gray-600">{title}</span>
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}
