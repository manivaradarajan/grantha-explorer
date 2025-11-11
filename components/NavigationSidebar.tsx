import { Grantha, GranthaMetadata, getPassageHierarchy } from "@/lib/data";
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
    for (const group of hierarchy.main) {
      if (group.children) {
        for (const child of group.children) {
          if (child.passages?.some((p) => p.ref === selectedRef)) {
            return [group.level, child.level];
          }
        }
      } else if (group.passages?.some((p) => p.ref === selectedRef)) {
        return [group.level];
      }
    }
    return [];
  });

  const uiStrings = getUIStrings();

  // Auto-open accordion when grantha or selectedRef changes
  useEffect(() => {
    const findPath = (groups: any[], ref: string, currentPath: string[] = []): string[] | null => {
      for (const group of groups) {
        const newPath = [...currentPath, group.level];
        if (group.passages?.some((p: any) => p.ref === ref)) {
          return newPath;
        }
        if (group.children) {
          const path = findPath(group.children, ref, newPath);
          if (path) {
            return path;
          }
        }
      }
      return null;
    };

    const path = findPath(hierarchy.main, selectedRef);
    if (path) {
      setOpenAccordions((prev) => [...new Set([...prev, ...path])]);
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
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  const renderPassageGroup = (group: any, level: number) => {
    if (group.children) {
      return (
        <Accordion
          key={group.level}
          title={group.level}
          isOpen={openAccordions.includes(group.level)}
          onToggle={() => toggleAccordion(group.level)}
          level={level}
        >
          {group.children.map((child: any) => renderPassageGroup(child, level + 1))}
        </Accordion>
      );
    } else if (group.passages) {
      return (
        <div key={group.level} style={{ paddingLeft: `${level * 1}rem` }}>
          {group.passages.map((passage: any, index: number) => (
            <PassageLink
              key={`${passage.ref}-${index}`}
              ref={(el) => {
                verseRefs.current[passage.ref] = el;
              }}
              passage={passage}
              grantha={grantha}
              isSelected={passage.ref === selectedRef}
              onVerseSelect={onVerseSelect}
            />
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col pb-8 bg-[#f8f9fa]">
      {/* Header */}
      <div className="pt-8 pb-2 px-6 bg-[#f8f9fa]">
        <h2 className="text-xl font-semibold font-serif text-center">
          {uiStrings.index}
        </h2>
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
        {hierarchy.prefatory.map((passage, index) => (
          <PassageLink
            key={`${passage.ref}-${index}`}
            ref={(el) => {
              verseRefs.current[passage.ref] = el;
            }}
            passage={passage}
            grantha={grantha}
            isSelected={passage.ref === selectedRef}
            onVerseSelect={onVerseSelect}
          />
        ))}

        {hierarchy.main.map((group) => renderPassageGroup(group, 0))}

        {hierarchy.concluding.map((passage, index) => (
          <PassageLink
            key={`${passage.ref}-${index}`}
            ref={(el) => {
              verseRefs.current[passage.ref] = el;
            }}
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
