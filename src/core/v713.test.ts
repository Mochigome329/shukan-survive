/** v7.13: 惨事の連鎖（悲劇・大破壊・大ピンチのうち2枚以上） */
import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week = 10,
) {
  const state = makeState(cards, week);
  return computeScore({
    data,
    cards: state.cards,
    week,
    selection: { cards: selection.cards, targets: selection.targets ?? {} },
  });
}

const statusOf = (b: ReturnType<typeof score>) => b.combos.find((c) => c.comboId === 'sanji_no_rensa')?.status;

describe('惨事の連鎖（v7.13）', () => {
  it('悲劇+大破壊で成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1), makeInstance(data, 'daihakai', 1)];
    expect(statusOf(score(cards, { cards: ['higeki#1', 'daihakai#1'] }))).toBe('applied');
  });

  it('悲劇+大ピンチで成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1), makeInstance(data, 'dai_pinch', 1)];
    expect(statusOf(score(cards, { cards: ['higeki#1', 'dai_pinch#1'] }))).toBe('applied');
  });

  it('大破壊+大ピンチで成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'daihakai', 1), makeInstance(data, 'dai_pinch', 1)];
    expect(statusOf(score(cards, { cards: ['daihakai#1', 'dai_pinch#1'] }))).toBe('applied');
  });

  it('3枚すべて出しても二重には成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'higeki', 1),
      makeInstance(data, 'daihakai', 1),
      makeInstance(data, 'dai_pinch', 1),
    ];
    const b = score(cards, { cards: ['higeki#1', 'daihakai#1', 'dai_pinch#1'] });
    expect(b.combos.filter((c) => c.comboId === 'sanji_no_rensa')).toHaveLength(1);
    expect(statusOf(b)).toBe('applied');
  });

  it('1枚だけでは成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1)];
    expect(statusOf(score(cards, { cards: ['higeki#1'] }))).toBeUndefined();
  });

  it('成立すると緊張が1積まれる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1), makeInstance(data, 'daihakai', 1)];
    const b = score(cards, { cards: ['higeki#1', 'daihakai#1'] });
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 1 });
  });

  it('話数を問わず成立する（序盤でも受け皿になる）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1), makeInstance(data, 'dai_pinch', 1)];
    expect(statusOf(score(cards, { cards: ['higeki#1', 'dai_pinch#1'] }, 3))).toBe('applied');
  });
});
