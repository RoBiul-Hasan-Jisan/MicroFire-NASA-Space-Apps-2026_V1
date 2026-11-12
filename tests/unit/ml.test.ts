import { describe, expect, it } from 'vitest';
import { answerQuestion, catalog, correctTerm, editDistance, normalizeQuestion, rankStatements, statementCorpus, tokenize, indexExperiment } from '@microfire/science';

const vocab = new Set<string>();
for (const e of catalog.experiments) { const i = indexExperiment(e); i.vocab.forEach((t) => vocab.add(t)); i.fieldTokens.forEach((_, t) => vocab.add(t)); }

describe('fuzzy term correction', () => {
  it('computes bounded edit distance with transposition', () => {
    expect(editDistance('oxygen', 'oxygen')).toBe(0);
    expect(editDistance('oxigen', 'oxygen')).toBe(1);
    expect(editDistance('presure', 'pressure')).toBe(1);
    expect(editDistance('oxgyen', 'oxygen')).toBe(1);
    expect(editDistance('abc', 'abcdefgh', 2)).toBeGreaterThan(2);
  });
  it('fixes close misspellings of catalog terms', () => {
    expect(correctTerm('oxigen', vocab)?.to).toBe('oxygen');
    expect(correctTerm('thicknes', vocab)?.to).toBe('thickness');
    expect(correctTerm('presure', vocab)?.to).toBe('pressure');
  });
  it('never touches short words, ids, exact terms or unrelated words', () => {
    expect(correctTerm('b20', vocab)).toBeNull();
    expect(correctTerm('oxygen', vocab)).toBeNull();
    for (const w of ['cotton', 'titanium', 'kerosene', 'heater', 'paper', 'orbit', 'station', 'candle']) expect(correctTerm(w, vocab), w).toBeNull();
  });
  it('is deterministic', () => {
    expect(JSON.stringify(correctTerm('oxigen', vocab))).toBe(JSON.stringify(correctTerm('oxigen', vocab)));
  });
});

describe('question normalization', () => {
  const known = (w: string) => { const t = tokenize(w)[0]; return !t || vocab.has(t); };
  it('rewrites typos and reports each correction once', () => {
    const n = normalizeQuestion('What oxigen level? Was oxigen measured?', vocab, known);
    expect(n.text).toBe('What oxygen level? Was oxygen measured?');
    expect(n.corrections).toHaveLength(1);
  });
  it('leaves correct questions byte-identical', () => {
    const q = 'What was observed in B20?';
    expect(normalizeQuestion(q, vocab, known)).toEqual({ text: q, corrections: [] });
  });
  it('maps misspelled guard words so safety questions still abstain', () => {
    expect(normalizeQuestion('is it saefty tested', vocab, known).text).toContain('safety');
  });
});

describe('Ask PIX with typo tolerance', () => {
  const ask = (question: string) => answerQuestion({ question, targetConditions: {} });
  it('answers a misspelled question like the correct one and discloses the correction', () => {
    const typo = ask('What oxigen concentration was recorded for B20?'), good = ask('What oxygen concentration was recorded for B20?');
    expect(typo.abstained).toBe(false);
    if (typo.abstained || good.abstained) return;
    expect(typo.statements).toEqual(good.statements);
    expect(typo.limitations.some((l) => l.includes('"oxigen" as "oxygen"'))).toBe(true);
    expect(good.limitations.some((l) => l.startsWith('Read "'))).toBe(false);
  });
  it('keeps refusing out-of-scope questions when the trigger word is misspelled', () => {
    for (const q of ['Is PMMA saefty a problem on Mars?', 'Can you predcit the B20 flame?', 'Is the lunar habitat hazardus?']) {
      const a = ask(q); expect(a.abstained, q).toBe(true);
      if (a.abstained) expect(a.code).toBe('unsupported-intent');
    }
  });
  it('does not invent evidence for unrelated words', () => {
    const a = ask('How did cotton burn?'); expect(a.abstained).toBe(true);
  });
});

describe('BM25 statement ranking', () => {
  it('builds a corpus from claims, conditions and limitations only', () => {
    const kinds = new Set(statementCorpus().map((d) => d.kind));
    expect([...kinds].sort()).toEqual(['claim', 'condition', 'limitation']);
  });
  it('ranks the oxygen condition first for an oxygen query and is repeatable', () => {
    const hits = rankStatements('oxygen concentration');
    expect(hits[0]?.doc.id).toContain('condition:oxygenPct');
    expect(JSON.stringify(rankStatements('oxygen concentration'))).toBe(JSON.stringify(hits));
  });
  it('returns nothing for queries with no catalog vocabulary', () => {
    expect(rankStatements('cotton blanket')).toEqual([]);
    expect(rankStatements('')).toEqual([]);
  });
});
