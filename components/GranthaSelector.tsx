"use client";

import { GranthaMetadata } from "@/lib/data";

interface GranthaSelectorProps {
  granthas: GranthaMetadata[];
  selectedGranthaId: string;
  onSelect: (granthaId: string) => void;
}

export default function GranthaSelector({
  granthas,
  selectedGranthaId,
  onSelect,
}: GranthaSelectorProps) {
  return (
    <div className="border border-gray-300 bg-white">
      <select
        value={selectedGranthaId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full p-3 bg-white border-none outline-none cursor-pointer text-base min-h-[44px]"
      >
        {granthas.map((grantha) => (
          <option key={grantha.id} value={grantha.id}>
            {grantha.title_deva}
          </option>
        ))}
      </select>
    </div>
  );
}
