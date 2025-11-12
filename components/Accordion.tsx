"use client";

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  level?: number;
}

export default function Accordion({
  title,
  children,
  isOpen,
  onToggle,
  level = 0,
}: AccordionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left py-0 px-3 transition-all duration-150 hover:bg-black/5 hover:rounded-lg flex items-center min-h-[35px]"
        style={{ paddingLeft: `${1 + level * 0.5}rem` }}
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
