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
  const selectedGrantha = granthas.find((g) => g.id === selectedGranthaId);

  return (
    <div className="border border-gray-300 bg-white">
      <select
        value={selectedGranthaId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full p-3 bg-white border-none outline-none cursor-pointer text-base"
      >
        {granthas.map((grantha) => (
          <option key={grantha.id} value={grantha.id}>
            {grantha.title}
          </option>
        ))}
      </select>
    </div>
  );
}
