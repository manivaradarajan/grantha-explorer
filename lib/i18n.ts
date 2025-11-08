/**
 * Internationalization and localization for UI strings
 */

export type Script = "devanagari" | "roman" | "kannada";
export type Language = "sanskrit" | "tamil" | "english";

interface UIStrings {
  noCommentaryForVerse: string;
  noCommentariesAvailable: string;
  commentary: string;
}

const translations: Record<Language, Record<Script, UIStrings>> = {
  sanskrit: {
    devanagari: {
      noCommentaryForVerse: "अत्र भाष्यं नास्ति",
      noCommentariesAvailable: "अत्र भाष्यं नास्ति",
      commentary: "भाष्यम्",
    },
    roman: {
      noCommentaryForVerse: "atra bhāṣyaṃ nāsti",
      noCommentariesAvailable: "atra bhāṣyaṃ nāsti",
      commentary: "bhāṣyam",
    },
    kannada: {
      noCommentaryForVerse: "ಇಲ್ಲಿ ವ್ಯಾಖ್ಯಾನ ಇಲ್ಲ",
      noCommentariesAvailable: "ಇಲ್ಲಿ ವ್ಯಾಖ್ಯಾನ ಇಲ್ಲ",
      commentary: "ವ್ಯಾಖ್ಯಾನ",
    },
  },
  tamil: {
    devanagari: {
      // Tamil uses Tamil script, but providing fallback
      noCommentaryForVerse: "இங்கு உரை இல்லை",
      noCommentariesAvailable: "இங்கு உரை இல்லை",
      commentary: "உரை",
    },
    roman: {
      noCommentaryForVerse: "iṅku urai illai",
      noCommentariesAvailable: "iṅku urai illai",
      commentary: "urai",
    },
    kannada: {
      noCommentaryForVerse: "இங்கு உரை இல்லை",
      noCommentariesAvailable: "இங்கு உரை இல்லை",
      commentary: "உரை",
    },
  },
  english: {
    devanagari: {
      noCommentaryForVerse: "No commentary available for this verse",
      noCommentariesAvailable: "No commentaries available",
      commentary: "Commentary",
    },
    roman: {
      noCommentaryForVerse: "No commentary available for this verse",
      noCommentariesAvailable: "No commentaries available",
      commentary: "Commentary",
    },
    kannada: {
      noCommentaryForVerse: "No commentary available for this verse",
      noCommentariesAvailable: "No commentaries available",
      commentary: "Commentary",
    },
  },
};

/**
 * Get UI strings for a given language and script
 */
export function getUIStrings(
  language: Language = "sanskrit",
  script: Script = "devanagari"
): UIStrings {
  return (
    translations[language]?.[script] || translations.sanskrit.devanagari
  );
}

/**
 * Detect preferred script from grantha content
 * Checks if roman or kannada scripts are available in the content
 */
export function detectPreferredScript(grantha: {
  language: string;
  passages?: Array<{ content: { sanskrit?: { roman?: string; kannada?: string } } }>;
}): Script {
  // Default to devanagari
  if (!grantha.passages || grantha.passages.length === 0) {
    return "devanagari";
  }

  // Check first passage for available scripts
  const firstPassage = grantha.passages[0];
  if (firstPassage.content.sanskrit?.kannada) {
    return "kannada";
  }
  if (firstPassage.content.sanskrit?.roman) {
    return "roman";
  }

  return "devanagari";
}
