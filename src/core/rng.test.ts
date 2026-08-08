import { describe, expect, it } from 'vitest';
import { drawRng, hashSeed, mulberry32, redrawRng, shuffled, weightedSample } from './rng';

describe('rng', () => {
  it('同じシードから同じ乱数列が得られる', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('異なるシードは異なる列になる', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('hashSeedは引数の区切りを区別する', () => {
    expect(hashSeed('a', 'bc')).not.toBe(hashSeed('ab', 'c'));
    expect(hashSeed(1, 23)).not.toBe(hashSeed(12, 3));
  });

  it('用途別シードが分離されている: drawはredrawCountの影響を受けない（14.7節）', () => {
    // drawSeedはweekとdrawIndexのみに依存する。redraw系列とは独立
    const d1 = drawRng(100, 2, 0);
    const d2 = drawRng(100, 2, 0);
    expect(Array.from({ length: 20 }, () => d1())).toEqual(Array.from({ length: 20 }, () => d2()));

    const r0 = redrawRng(100, 2, 0);
    const r1 = redrawRng(100, 2, 1);
    expect(Array.from({ length: 20 }, () => r0())).not.toEqual(Array.from({ length: 20 }, () => r1()));
  });

  it('shuffledは元配列を破壊しない', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = original.slice();
    shuffled(original, mulberry32(7));
    expect(original).toEqual(copy);
  });

  it('shuffledは同じシードで同じ並びになる', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(shuffled(items, mulberry32(9))).toEqual(shuffled(items, mulberry32(9)));
  });

  it('weightedSampleは同じシードで同じ結果、件数と重複なしを守る（v5.6）', () => {
    const items = [
      { item: 'a', weight: 3 },
      { item: 'b', weight: 1 },
      { item: 'c', weight: 1 },
      { item: 'd', weight: 1 },
    ];
    const r1 = weightedSample(items, 3, mulberry32(5));
    const r2 = weightedSample(items, 3, mulberry32(5));
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(3);
    expect(new Set(r1).size).toBe(3);
  });

  it('weightedSampleは重み0以下の項目を選ばない', () => {
    const items = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 0 },
      { item: 'c', weight: -1 },
    ];
    const result = weightedSample(items, 3, mulberry32(1));
    expect(result).toEqual(['a']);
  });

  it('weightedSampleは高い重みの項目ほど多く選ばれる傾向がある', () => {
    const items = [
      { item: 'heavy', weight: 100 },
      { item: 'light', weight: 1 },
    ];
    let heavyFirst = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (weightedSample(items, 1, mulberry32(seed))[0] === 'heavy') heavyFirst++;
    }
    expect(heavyFirst).toBeGreaterThan(180); // 100/101 ≈ 99%が期待値
  });

  it('countがitems.lengthを超える場合は全件を返す', () => {
    const items = [{ item: 'a', weight: 1 }, { item: 'b', weight: 1 }];
    expect(weightedSample(items, 5, mulberry32(3))).toHaveLength(2);
  });
});
