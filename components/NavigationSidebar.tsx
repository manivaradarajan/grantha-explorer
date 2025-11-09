import {
  Grantha,
  GranthaMetadata,
  getPassageHierarchy,
} from "@/lib/data";
import GranthaSelector from "./GranthaSelector";
import { useEffect, useRef, useState } from "react";
import Accordion from "./Accordion";
import PassageLink from "./PassageLink";
import { getUIStrings } from "@/lib/i18n";

interface NavigationSidebarProps {
  grantha: Grantha;
  granthas: GranthaMetadata[];
  selectedRef: string;
  onGranthaChange: (granthaId: string) => void;
  onVerseSelect: (ref: string) => void;
}

export default function NavigationSidebar({
  grantha,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
}: NavigationSidebarProps) {
  const hierarchy = getPassageHierarchy(grantha);
  const verseRefs = useRef<{ [key: string]: HTMLAnchorElement | null }>({});
  const [openAccordions, setOpenAccordions] = useState<string[]>(() => {
    const group = hierarchy.main.find((g) =>
      g.passages.some((p) => p.ref === selectedRef)
    );
    return group ? [group.level] : [];
  });
  const uiStrings = getUIStrings();

  // Auto-open accordion when grantha or selectedRef changes
  useEffect(() => {
    const group = hierarchy.main.find((g) =>
      g.passages.some((p) => p.ref === selectedRef)
    );
    if (group) {
      setOpenAccordions((prev) => {
        if (!prev.includes(group.level)) {
          return [...prev, group.level];
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantha.grantha_id, selectedRef]);

  // Auto-scroll to selected verse when selection changes
  useEffect(() => {
    const element = verseRefs.current[selectedRef];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedRef]);

  const toggleAccordion = (level: string) => {
    setOpenAccordions((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  return (
    <div className="h-full flex flex-col pb-8 bg-[#f8f9fa]">
      {/* Header */}
      <div className="pt-8 pb-2 px-6 bg-[#f8f9fa]">
        <h2 className="text-xl font-semibold font-serif text-center">{uiStrings.index}</h2>
      </div>

      {/* Grantha selector */}
      <div className="pb-3 px-6">
        <GranthaSelector
          granthas={granthas}
          selectedGranthaId={grantha.grantha_id}
          onSelect={onGranthaChange}
        />
      </div>

      {/* Verse list */}
      <div className="flex-1 overflow-y-auto px-6">
        {hierarchy.prefatory.map((passage) => (
          <PassageLink
            key={passage.ref}
            ref={(el) => (verseRefs.current[passage.ref] = el)}
            passage={passage}
            grantha={grantha}
            isSelected={passage.ref === selectedRef}
            onVerseSelect={onVerseSelect}
          />
        ))}

        {hierarchy.main.length === 1
          ? // Flat list for single-level structures
            hierarchy.main[0].passages.map((passage) => (
              <PassageLink
                key={passage.ref}
                ref={(el) => (verseRefs.current[passage.ref] = el)}
                passage={passage}
                grantha={grantha}
                isSelected={passage.ref === selectedRef}
                onVerseSelect={onVerseSelect}
              />
            ))
          : // Accordion for hierarchical structures
            hierarchy.main.map((group) => (
              <Accordion
                key={group.level}
                title={group.level}
                isOpen={openAccordions.includes(group.level)}
                onToggle={() => toggleAccordion(group.level)}
              >
                {group.passages.map((passage) => (
                  <PassageLink
                    key={passage.ref}
                    ref={(el) => (verseRefs.current[passage.ref] = el)}
                    passage={passage}
                    grantha={grantha}
                    isSelected={passage.ref === selectedRef}
                    onVerseSelect={onVerseSelect}
                  />
                ))}
              </Accordion>
            ))}

        {hierarchy.concluding.map((passage) => (
          <PassageLink
            key={passage.ref}
            ref={(el) => (verseRefs.current[passage.ref] = el)}
            passage={passage}
            grantha={grantha}
            isSelected={passage.ref === selectedRef}
            onVerseSelect={onVerseSelect}
          />
        ))}
      </div>
    </div>
  );
}
