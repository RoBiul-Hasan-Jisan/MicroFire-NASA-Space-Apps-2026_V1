import type { Catalog } from '@microfire/shared';
import { catalog } from '../catalog';
import { contentTokens, formatCondition } from '../evidence';

/**
 * Okapi BM25 ranking over the validated catalog's citable statements (claims, recorded conditions, limitations).
 * Classical information retrieval: deterministic, explainable (per-term contributions), no learned weights.
 * It ranks existing text only. It never writes new text and is not used to release an answer by itself.
 */
export const BM25_VERSION = 'ml-bm25-v1';
const K1 = 1.2, B = 0.75;

export type StatementDoc = { id: string; experimentId: string; kind: 'claim' | 'condition' | 'limitation'; text: string };
export type BM25Hit = { doc: StatementDoc; score: number; matchedTerms: string[] };

const CONDITION_KEYS = ['gravity', 'material', 'geometry', 'flowDirection', 'oxygenPct', 'pressureKpa', 'flowCmS', 'thicknessMm'] as const;

export function statementCorpus(dataset: Catalog = catalog): StatementDoc[] {
  const docs: StatementDoc[] = [];
  for (const e of dataset.experiments) {
    for (const c of e.claims) docs.push({ id: `${e.id}#claim:${c.id}`, experimentId: e.id, kind: 'claim', text: c.text });
    for (const k of CONDITION_KEYS) docs.push({ id: `${e.id}#condition:${k}`, experimentId: e.id, kind: 'condition', text: formatCondition(e, k) });
    e.limitations.forEach((text, i) => docs.push({ id: `${e.id}#limitation:${i}`, experimentId: e.id, kind: 'limitation', text }));
  }
  return docs;
}

export function rankStatements(query: string, limit = 5, docs: StatementDoc[] = statementCorpus()): BM25Hit[] {
  const q = contentTokens(query);
  if (!q.length || !docs.length) return [];
  const tokenized = docs.map((d) => contentTokens(d.text));
  const avgLen = tokenized.reduce((n, t) => n + t.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const t of tokenized) for (const term of new Set(t)) df.set(term, (df.get(term) ?? 0) + 1);
  const N = docs.length;
  const hits: BM25Hit[] = [];
  docs.forEach((doc, i) => {
    // contentTokens de-duplicates, so term frequency is binary here; documents are short single statements.
    const set = new Set(tokenized[i]), len = tokenized[i]!.length;
    let score = 0; const matchedTerms: string[] = [];
    for (const term of q) {
      if (!set.has(term)) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((1 * (K1 + 1)) / (1 + K1 * (1 - B + B * (len / avgLen))));
      matchedTerms.push(term);
    }
    if (score > 0) hits.push({ doc, score: Math.round(score * 1000) / 1000, matchedTerms });
  });
  return hits.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id)).slice(0, limit);
}
