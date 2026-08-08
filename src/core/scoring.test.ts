import { describe, expect, it } from 'vitest';
import { applyStateChanges, computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

describe('computeScore（v5.2: キャスト常駐）', () => {
  it('基礎点は場のキャスト全員の人気度合計 × 話題性（6.3節）', () => {
    // キャスト: 主人公10 + ライバル15 = 25。日常回1枚 → 話題1
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'nichijou', 1),
    ]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['nichijou#1'], targets: {} },
    });
    expect(b.characters.map((c) => c.name).sort()).toEqual(['ライバル', '主人公']);
    expect(b.popularityTotal).toBe(25);
    expect(b.buzzTotal).toBe(1);
    expect(b.finalScore).toBe(25);
  });

  it('展開0枚（タメ回）も合法で、キャスト人気×1が得点になる', () => {
    const state = makeState([makeInstance(data, 'hero', 1)]);
    const b = computeScore({ data, cards: state.cards, week: 1, selection: { cards: [], targets: {} } });
    expect(b.buzzApplied).toBe(1);
    expect(b.finalScore).toBe(10);
  });

  it('鮮度は展開の種類ごとに基礎話題性へ乗算される（6.4節・9節、v5.2d）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)], 1, {
      freshnessByDef: { nichijou: 0.5 },
    });
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['nichijou#1'], targets: {} },
      freshnessByDef: state.freshnessByDef,
    });
    expect(b.developments[0]!.effective).toBe(0.5);
    expect(b.finalScore).toBe(10);
  });

  it('期間効果「回想」中はすべての展開に話題性+1（v5.8: ジャンルタグ依存を廃止）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen', 1)]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['fukusen#1'], targets: {} },
      modifiers: [{ modifierId: 'flashback', remaining: 2 }],
    });
    // 伏線: 基礎0 × 1.0 + 回想1 = 1
    expect(b.developments[0]!.effective).toBe(1);
  });

  it('期間効果は重ねがけできる（回想＋熟考で+2）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['nichijou#1'], targets: {} },
      modifiers: [
        { modifierId: 'flashback', remaining: 2 },
        { modifierId: 'deep_thought', remaining: 3 },
      ],
    });
    // 日常回: 基礎1 + 回想1 + 熟考1 = 3
    expect(b.developments[0]!.effective).toBe(3);
  });

  it('修行済みフラグはキャストの人気度に+3/個で消費される', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1, { flags: { training: 2, love: false } }),
    ]);
    const b = computeScore({ data, cards: state.cards, week: 1, selection: { cards: [], targets: {} } });
    expect(b.characters[0]!.trainingBonus).toBe(6);
    expect(b.finalScore).toBe(16);
    expect(b.stateChanges).toContainEqual({ type: 'consumeTrainingFlags', instanceId: 'hero#1', count: 2 });
  });

  it('修行はendWeekで対象にフラグを付与し、上限2で止まる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'shugyou', 1)]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['shugyou#1'], targets: { 'shugyou#1': 'hero#1' } },
    });
    const { cards } = applyStateChanges(state.cards, b.stateChanges);
    expect(cards.find((c) => c.instanceId === 'hero#1')!.flags.training).toBe(1);

    const granted = applyStateChanges(state.cards, [
      { type: 'grantTrainingFlag', instanceId: 'hero#1', amount: 1 },
      { type: 'grantTrainingFlag', instanceId: 'hero#1', amount: 1 },
      { type: 'grantTrainingFlag', instanceId: 'hero#1', amount: 1 },
    ]);
    expect(granted.cards.find((c) => c.instanceId === 'hero#1')!.flags.training).toBe(2);
  });

  it('死亡は対象キャラを週終了時に死亡済みへ移す（その週は人気度に数える）', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'shibou', 1),
    ]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['shibou#1'], targets: { 'shibou#1': 'heroine#1' } },
    });
    expect(b.popularityTotal).toBe(22);
    const { cards } = applyStateChanges(state.cards, b.stateChanges);
    expect(cards.find((c) => c.instanceId === 'heroine#1')!.zone).toBe('dead');
    expect(cards.find((c) => c.instanceId === 'hero#1')!.zone).toBe('field');
  });

  it('全滅は場のキャスト全員を週終了時に死亡済みにする（v5.2）', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'zenmetsu', 1),
    ]);
    const b = computeScore({ data, cards: state.cards, week: 1, selection: { cards: ['zenmetsu#1'], targets: {} } });
    const { cards } = applyStateChanges(state.cards, b.stateChanges);
    expect(cards.find((c) => c.instanceId === 'hero#1')!.zone).toBe('dead');
    expect(cards.find((c) => c.instanceId === 'heroine#1')!.zone).toBe('dead');
  });

  it('復活は死亡済みキャラを場へ戻し、その週から人気度に数える（4.6節）', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'dead' }),
      makeInstance(data, 'fukkatsu', 1),
    ]);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['fukkatsu#1'], targets: { 'fukkatsu#1': 'heroine#1' } },
    });
    expect(b.popularityTotal).toBe(22);
    const { cards } = applyStateChanges(state.cards, b.stateChanges);
    expect(cards.find((c) => c.instanceId === 'heroine#1')!.zone).toBe('field');
  });

  it('伏線はトークン獲得を返し、総集編はノルマ判定を免除する', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen', 1)]);
    const b = computeScore({ data, cards: state.cards, week: 4, selection: { cards: ['fukusen#1'], targets: {} } });
    expect(b.stateChanges).toContainEqual({ type: 'gainForeshadowToken', amount: 1 });
    expect(b.cleared).toBe(false); // 10×1 < 190

    const state2 = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'soushuhen', 1)], 4);
    const b2 = computeScore({ data, cards: state2.cards, week: 4, selection: { cards: ['soushuhen#1'], targets: {} } });
    expect(b2.quotaBypassed).toBe(true);
    expect(b2.cleared).toBe(true);
  });
});
