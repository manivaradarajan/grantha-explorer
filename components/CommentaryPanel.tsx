"use client";

export default function CommentaryPanel() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-300">
        <h2 className="text-lg font-semibold text-center">भाष्यम्</h2>
      </div>

      {/* Commentary content - placeholder for now */}
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-gray-500 italic">
          Commentary section (to be implemented)
        </p>
      </div>
    </div>
  );
}
