import { describe, expect, it } from 'vitest';
import { buildChronicle, formatRatio, ratioToHeight } from './chronicle';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { MAX_WARNINGS, type WeekLogEntry } from './types';

const data = loadTestData();

function entry(over: Partial<WeekLogEntry> & { week: number; score: number; quota: number }): WeekLogEntry {
  return {
    playedInstanceIds: [],
    playedDefinitionIds: [],
    comboIds: [],
    cleared: over.score >= over.quota,
    warningsAfter: 0,
    ...over,
  };
}

describe('連載年表の集計（v7.11）', () => {
  it('達成度はスコア÷ノルマ。ノルマの桁が違う週も同じ物差しで並ぶ', () => {
    const run = makeState([], 1, {
      log: [
        entry({ week: 1, quota: 300, score: 600 }),
        // 人気投票回はノルマが桁違いに低い。生スコアでは比べられないが達成度なら比べられる
        entry({ week: 16, quota: 165, score: 412 }),
      ],
    });
    const c = buildChronicle(data, run);
    expect(c.weeks[0]!.ratio).toBeCloseTo(2.0);
    expect(c.weeks[1]!.ratio).toBeCloseTo(2.497, 2);
  });

  it('ノルマ達成の分母は「記録が残っている話数」であって到達話数ではない', () => {
    // デバッグの話数ジャンプなどで、飛ばした週の記録が無いまま最終話に到達することがある
    const run = makeState([], 1, {
      log: [entry({ week: 1, quota: 300, score: 600 }), entry({ week: 25, quota: 5800, score: 9000 })],
    });
    const c = buildChronicle(data, run);
    expect(c.lastWeek).toBe(25);
    expect(c.playedWeeks).toBe(2);
    expect(c.clearedCount).toBe(2);
  });

  it('打ち切り警告の最大値は上限で丸める（要求が一度に期限切れすると上限を超えうる）', () => {
    const run = makeState([], 1, {
      log: [entry({ week: 1, quota: 300, score: 100, warningsAfter: 1 }), entry({ week: 2, quota: 300, score: 100, warningsAfter: 5 })],
    });
    const c = buildChronicle(data, run);
    expect(c.maxWarnings).toBe(MAX_WARNINGS);
  });

  it('出来事のない達成週だけが「平凡」として畳まれる', () => {
    const run = makeState([], 1, {
      log: [
        entry({ week: 2, quota: 300, score: 600, comboIds: ['oudou'] }),
        entry({ week: 3, quota: 300, score: 600, events: [{ kind: 'death', name: '師匠' }] }),
        entry({ week: 4, quota: 300, score: 100 }),
        // 第8話はボス週（合併号）なので、出来事が無くても畳まない
        entry({ week: 8, quota: 1000, score: 2000 }),
      ],
    });
    const c = buildChronicle(data, run);
    expect(c.weeks[0]!.quiet).toBe(true);
    expect(c.weeks[1]!.quiet).toBe(false);
    expect(c.weeks[2]!.quiet).toBe(false);
    expect(c.weeks[3]!.boss).toBeTruthy();
    expect(c.weeks[3]!.quiet).toBe(false);
  });

  it('役は種類数で数える（同じ役を何度成立させても1つ）', () => {
    const run = makeState([], 1, {
      log: [
        entry({ week: 1, quota: 300, score: 600, comboIds: ['oudou', 'kamikai'] }),
        entry({ week: 2, quota: 300, score: 600, comboIds: ['oudou'] }),
      ],
    });
    expect(buildChronicle(data, run).comboKinds).toBe(2);
  });

  it('キャストは生存・死亡・離脱に分かれ、一度も登場していない控えは含まない', () => {
    const cards = [
      makeInstance(data, 'hero', 1, { zone: 'field' }),
      makeInstance(data, 'heroine', 2, { zone: 'dead' }),
      makeInstance(data, 'rival', 3, { zone: 'waiting' }),
      makeInstance(data, 'aibou', 4, { zone: 'bench' }),
    ];
    const c = buildChronicle(data, makeState(cards, 1, { log: [entry({ week: 1, quota: 300, score: 600 })] }));
    expect(c.cast.alive).toHaveLength(1);
    expect(c.cast.dead).toHaveLength(1);
    expect(c.cast.left).toHaveLength(1);
    const all = [...c.cast.alive, ...c.cast.dead, ...c.cast.left];
    expect(all).toHaveLength(3);
  });

  it('グラフの縦軸は突出した週があっても頭打ちになる', () => {
    const run = makeState([], 1, {
      log: [entry({ week: 1, quota: 100, score: 10000 })],
    });
    const c = buildChronicle(data, run);
    expect(c.ratioCap).toBe(4);
    // 上限を超えた週は目一杯（1.0）で描かれる
    expect(ratioToHeight(c.weeks[0]!.ratio, c.ratioCap)).toBe(1);
  });

  it('達成度が低くてもグラフから消えない（0にはしない）', () => {
    expect(ratioToHeight(0, 2.5)).toBeGreaterThan(0);
  });

  it('達成度の表記は小数1桁', () => {
    expect(formatRatio(1.666)).toBe('×1.7');
    expect(formatRatio(2)).toBe('×2.0');
  });
});
