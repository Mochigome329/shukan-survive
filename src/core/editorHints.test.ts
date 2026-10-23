import { describe, expect, it } from 'vitest';
import { getEditorHints, getShopCardHint } from './editorHints';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const hero = makeInstance(data, 'hero', 1);
const card = (id: string) => makeInstance(data, id, 1);

describe('editor hints', () => {
  it('mentions existing foreshadow count and earliest planted week without claiming unavailable recovery', () => {
    const run = makeState([hero], 6, { foreshadowTokens: 2, foreshadowWeeks: [4, 2] });
    const text = getEditorHints(data, run).map(h => h.text).join('');
    expect(text).toContain('2本');
    expect(text).toContain('第2話');
    expect(text).not.toContain('回収できます');
  });
  it('only offers recovery when its card is in the hand', () => {
    const run = makeState([hero, card('fukusen_kaishu')], 6, { foreshadowTokens: 1, foreshadowWeeks: [2] });
    expect(getEditorHints(data, run)[0]?.text).toContain('回収できます');
    expect(getEditorHints(data, { ...run, hand: [] }).some(h => h.text.includes('回収できます'))).toBe(false);
  });
  it('does not offer resurrection for stress without a dead target', () => {
    const run = makeState([hero, card('fukkatsu')], 4, { stress: 3 });
    expect(getEditorHints(data, run)).toEqual([]);
    expect(getShopCardHint(data, run, 'fukkatsu')).toBeNull();
    const withDead = { ...run, cards: [...run.cards, makeInstance(data, 'aibou', 1, { zone: 'dead' })] };
    expect(getEditorHints(data, withDead)[0]?.text).toContain('復活');
    expect(getShopCardHint(data, withDead, 'fukkatsu')).toContain('緊張3');
  });
  it('offers feasible stress release based on current stress, not hypothetical setups', () => {
    expect(getEditorHints(data, makeState([hero, card('dai_shouri')], 4, { stress: 4 }))[0]?.text).toContain('大勝利');
    expect(getShopCardHint(data, makeState([hero]), 'dai_shouri')).toBeNull();
    expect(getShopCardHint(data, makeState([hero], 4, { stress: 2 }), 'hero')).toBeNull();
  });
  it('only offers FREE return after the wait and before the weekly return is used', () => {
    const waiting = makeInstance(data, 'aibou', 1, { zone: 'waiting', leftWeek: 2 });
    const run = makeState([hero, waiting], 4);
    expect(getEditorHints(data, run)[0]?.text).toContain('無料');
    expect(getEditorHints(data, { ...run, week: 3 })).toEqual([]);
    expect(getEditorHints(data, { ...run, returnUsedThisWeek: true })).toEqual([]);
  });
  it('keeps at most two actionable hints before passive status', () => {
    const run = makeState([hero, card('dai_shouri'), makeInstance(data, 'aibou', 1, { zone: 'waiting', leftWeek: 1 })], 5,
      { stress: 3, foreshadowTokens: 2, foreshadowWeeks: [1] });
    const hints = getEditorHints(data, run);
    expect(hints).toHaveLength(2);
    expect(hints.map(h => h.id)).toContain('free-return');
    expect(hints.map(h => h.id)).toContain('stress');
  });
  it.each([['long', 25], ['short', 13]] as const)('suppresses normal play hints in %s finale', (mode, week) => {
    const run = makeState([hero, card('dai_shouri')], week, { mode, stress: 3, foreshadowTokens: 2, foreshadowWeeks: [1] });
    expect(getEditorHints(data, run)).toEqual([]);
    expect(getShopCardHint(data, run, 'fukusen_kaishu')).toBeNull();
  });
  it('shop recovery requires existing tokens and does not mutate the run', () => {
    const run = makeState([hero], 5, { foreshadowTokens: 2, foreshadowWeeks: [1] });
    const before = JSON.stringify(run);
    expect(getShopCardHint(data, run, 'fukusen_kaishu')).toContain('2本');
    expect(getShopCardHint(data, { ...run, foreshadowTokens: 0 }, 'fukusen_kaishu')).toBeNull();
    expect(getShopCardHint(data, run, 'unknown')).toBeNull();
    expect(JSON.stringify(run)).toBe(before);
  });
});
