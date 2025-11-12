import { Grantha, GranthaMetadata, Passage, PassageGroup, PrefatoryMaterial, getPassageHierarchy } from "@/lib/data";
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
  loadPart: (partId: string) => Promise<void>;
}

export default function NavigationSidebar({
  grantha,
  granthas,
  selectedRef,
  onGranthaChange,
  onVerseSelect,
  loadPart,
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

  // Auto-open accordion and scroll to selected verse when selection changes
  useEffect(() => {
    const findPath = (groups: PassageGroup[], ref: string, currentPath: string[] = []): string[] | null => {
      for (const group of groups) {
        const newPath = [...currentPath, group.level];
        if (group.passages?.some((p: Passage) => p.ref === ref)) {
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

    // Delay scroll to allow accordions to open
    setTimeout(() => {
      const element = verseRefs.current[selectedRef];
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantha.grantha_id, selectedRef]);

  const toggleAccordion = async (level: string) => {
    // If we are opening the accordion, check if we need to load data
    if (!openAccordions.includes(level)) {
      const findGroup = (groups: PassageGroup[], targetLevel: string): PassageGroup | null => {
        for (const group of groups) {
          if (group.level === targetLevel) return group;
          if (group.children) {
            const found = findGroup(group.children, targetLevel);
            if (found) return found;
          }
        }
        return null;
      };

      const group = findGroup(hierarchy.main, level);

      // Check if it's a placeholder that needs loading.
      // A placeholder has an empty `children` array and no `passages`.
      if (group && !group.passages && group.children && group.children.length === 0 && group.partId) {
        // Use the partId directly from the group to load the part
        await loadPart(group.partId);
      }
    }

    // Now, toggle the accordion state
    setOpenAccordions((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  const renderPassageGroup = (group: PassageGroup, level: number) => {
    if (group.children) {
      return (
        <Accordion
          key={group.level}
          title={group.level}
          isOpen={openAccordions.includes(group.level)}
          onToggle={() => toggleAccordion(group.level)}
          level={level}
        >
          {group.children.map((child) => renderPassageGroup(child, level + 1))}
        </Accordion>
      );
    } else if (group.passages) {
      return (
        <div key={group.level} style={{ paddingLeft: `${level * 0.2}rem` }}>
          {group.passages.map((passage: Passage, index: number) => (
            <PassageLink
              key={`${passage.ref}-${index}`}
              ref={(el) => {
                verseRefs.current[passage.ref] = el;
              }}
              passage={passage}
              grantha={grantha}
              isSelected={passage.ref === selectedRef}
              onVerseSelect={async (ref) => {
                if (passage.part_id) {
                  await loadPart(passage.part_id);
                }
                onVerseSelect(ref);
              }}
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
            onVerseSelect={async (ref) => {
              const p = passage as Passage | PrefatoryMaterial;
              if (p.part_id) {
                await loadPart(p.part_id);
              }
              onVerseSelect(ref);
            }}
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
            onVerseSelect={async (ref) => {
              const p = passage as Passage | PrefatoryMaterial;
              if (p.part_id) {
                await loadPart(p.part_id);
              }
              onVerseSelect(ref);
            }}
          />
        ))}
      </div>
    </div>
  );
}
