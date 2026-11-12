/**
 * Typo-tolerant term matching using character-trigram Dice similarity plus a bounded edit distance.
 *
 * Classical, deterministic, offline: no model weights, no network. It only ever maps a word onto a term that
 * already exists in the validated catalog vocabulary, so it cannot introduce facts, only recover the asker's intent.
 */
export const FUZZY_VERSION = 'ml-fuzzy-trigram-v1';

export function trigrams(word: string): Set<string> {
  const padded = `^${word}$`;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent transposition). Returns max+1 when it exceeds max. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [], prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]!; prev[j] = cur[j]!; }
  }
  return prev[b.length]!;
}

const SINGLE_EDIT_MIN_SIMILARITY = 0.3;
export type Correction = { from: string; to: string; similarity: number };

/**
 * Suggest the single catalog term closest to `word`, or null. Deliberately conservative:
 * - words shorter than 5 letters or containing digits are never corrected (test ids such as "b20" stay untouched);
 * - the edit distance must be <= 1 for words up to 7 letters and <= 2 for longer ones;
 * - the trigram Dice similarity must reach `minSimilarity` (0.3 when only one edit away);
 * - a tie between two different candidates yields no correction (ambiguity is not guessed).
 */
export function correctTerm(word: string, vocab: Iterable<string>, minSimilarity = 0.5): Correction | null {
  const w = word.toLowerCase();
  if (w.length < 5 || /[0-9]/.test(w)) return null;
  const maxEdits = w.length <= 7 ? 1 : 2;
  const wg = trigrams(w);
  const candidates: Correction[] = [];
  for (const term of vocab) {
    if (term === w) return null; // already a known term
    if (term.length < 4 || /[0-9]/.test(term)) continue;
    const edits = editDistance(w, term, maxEdits);
    if (edits > maxEdits) continue;
    const similarity = Math.round(dice(wg, trigrams(term)) * 1000) / 1000;
    // A single edit (including two swapped letters, e.g. "saefty") shares few trigrams on short words, so it gets a lower floor.
    if (similarity >= (edits <= 1 ? SINGLE_EDIT_MIN_SIMILARITY : minSimilarity)) candidates.push({ from: w, to: term, similarity });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || a.to.localeCompare(b.to));
  const [best, runnerUp] = candidates;
  return best && !(runnerUp && runnerUp.similarity === best.similarity && runnerUp.to !== best.to) ? best : null;
}
