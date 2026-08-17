import { Passage, PrefatoryMaterial } from "@/lib/data";

/** Build a minimal, fully-typed main passage for test fixtures. */
export const makePassage = (ref: string): Passage => ({
  ref,
  passage_type: "main",
  content: { sanskrit: { devanagari: ref }, english_translation: "" },
});

/** Build a minimal main passage typed as a navigation passage. */
export const makeNavPassage = (ref: string): Passage | PrefatoryMaterial =>
  makePassage(ref);
