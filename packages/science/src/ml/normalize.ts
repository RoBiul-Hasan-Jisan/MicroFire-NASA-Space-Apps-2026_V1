import { tokenize } from '../evidence';
import { correctTerm, type Correction } from './fuzzy';

export const NORMALIZE_VERSION = 'ml-question-normalize-v1';

/**
 * Words the safety/scope guards in ask.ts react to. They are included so that a misspelling such as "saefty" or
 * "predcit" cannot slip past a guard that would have refused the correctly spelled question.
 */
export const GUARD_TERMS = ['safety', 'unsafe', 'certify', 'certified', 'guarantee', 'approved', 'compliant', 'hazard', 'hazardous', 'danger', 'dangerous',
  'lunar', 'martian', 'habitat', 'regolith', 'probability', 'likelihood', 'forecast', 'predict', 'recommend', 'extinguish', 'prevent', 'suppress',
  'instruction', 'instructions', 'disregard', 'jailbreak', 'previous'] as const;

export type NormalizedQuestion = { text: string; corrections: Correction[] };

/**
 * Replace probable typos with known terms. `catalogVocab` holds stemmed terms from validated records; `isKnown` says whether a
 * surface word is already understood (stop words, synonyms, vocabulary, generic combustion words) and must be left alone.
 * Guard terms win over catalog terms so a safety-style question is still classified as one.
 */
export function normalizeQuestion(question: string, catalogVocab: ReadonlySet<string>, isKnown: (word: string) => boolean): NormalizedQuestion {
  const corrections: Correction[] = [];
  const seen = new Map<string, string | null>();
  const text = question.replace(/[A-Za-z][A-Za-z]{4,}/g, (word) => {
    const key = word.toLowerCase();
    if (!seen.has(key)) {
      // Catalog terms are stemmed, so an inflected typo ("obsreved") is also tried in its stemmed form ("obsrev").
      const stem = tokenize(key)[0];
      const fix = isKnown(key) ? null : (correctTerm(key, GUARD_TERMS) ?? correctTerm(key, catalogVocab) ?? (stem && stem !== key ? correctTerm(stem, catalogVocab) : null));
      if (fix) corrections.push(fix);
      seen.set(key, fix?.to ?? null);
    }
    const to = seen.get(key);
    return to ?? word;
  });
  return { text, corrections };
}
