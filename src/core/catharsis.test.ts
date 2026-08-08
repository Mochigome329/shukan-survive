import { describe, expect, it } from 'vitest';
import { createRun, resolveWeek } from './run';
import { computeScore } from './scoring';
import { rollPack } from './shop';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { STRESS_POPULARITY_PENALTY } from './types';

const data = loadTestData();

describe('カタルシス（緊張と解放、v5.3）', () => {
  it('「敗北」で緊張が溜まり、キャストの人気度が一時的に下がる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'haiboku', 1)], 2);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 2,
      selection: { cards: ['haiboku#1'], targets: {} },
      stress: 0,
    });
    // 人気22 - 緊張1×6 = 16
    expect(b.stressPenalty).toBe(-STRESS_POPULARITY_PENALTY);
    expect(b.popularityTotal).toBe(16);

    const after = resolveWeek(data, state, { cards: ['haiboku#1'], targets: {} }).state;
    expect(after.stress).toBe(1);
  });

  it('緊張2つ以上を「大勝利」で解放するとカタルシスが成立し、大きく跳ね返る', () => {
    const state = makeState(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'dai_shouri', 1)],
      4,
      { stress: 3 },
    );
    const b = computeScore({
      data,
      cards: state.cards,
      week: 4,
      selection: { cards: ['dai_shouri#1'], targets: {} },
      stress: 3,
    });
    expect(b.stressReleased).toBe(3);
    expect(b.stressPenalty).toBe(0); // 解放した週はペナルティなし
    // 話題: 大勝利3 + 解放5×3 + カタルシス役4×3 + 奇跡10 = 40
    // （v5.8: 緊張3つ以上の一斉解放は役「奇跡」も成立する）
    expect(b.combos.find((c) => c.comboId === 'catharsis')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'kiseki')?.status).toBe('applied');
    expect(b.buzzApplied).toBe(40);
    expect(b.finalScore).toBe(22 * 40);

    const after = resolveWeek(data, state, { cards: ['dai_shouri#1'], targets: {} }).state;
    expect(after.stress).toBe(0);
  });

  it('緊張1つだけならカタルシス役は成立しない（解放ボーナスのみ）', () => {
    const b = computeScore({
      data,
      cards: makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'kyuushutsu', 1)], 3, { stress: 1 }).cards,
      week: 3,
      selection: { cards: ['kyuushutsu#1'], targets: {} },
      stress: 1,
    });
    expect(b.combos.find((c) => c.comboId === 'catharsis')).toBeUndefined();
    expect(b.stressReleased).toBe(1);
  });

  it('人気度は緊張で1未満にはならない', () => {
    const b = computeScore({
      data,
      cards: makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'haiboku', 1)], 2, { stress: 5 }).cards,
      week: 2,
      selection: { cards: ['haiboku#1'], targets: {} },
      stress: 5,
    });
    expect(b.popularityTotal).toBe(1);
  });

  it('復活と真の覚醒でも緊張を解放できる（v5.5: 解放手段の拡充）', () => {
    const revive = computeScore({
      data,
      cards: makeState(
        [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1, { zone: 'dead' }), makeInstance(data, 'fukkatsu', 1)],
        5,
        { stress: 3 },
      ).cards,
      week: 5,
      selection: { cards: ['fukkatsu#1'], targets: { 'fukkatsu#1': 'heroine#1' } },
      stress: 3,
    });
    expect(revive.stressReleased).toBe(3);
    expect(revive.combos.find((c) => c.comboId === 'catharsis')?.status).toBe('applied');

    const awaken = computeScore({
      data,
      cards: makeState(
        [makeInstance(data, 'hero', 1, { flags: { training: 0, love: false } }), makeInstance(data, 'kakusei', 1)],
        5,
        { stress: 2 },
      ).cards,
      week: 5,
      selection: { cards: ['kakusei#1'], targets: { 'kakusei#1': 'hero#1' } },
      stress: 2,
      // v7.4: 「継承の覚醒」は過去に「先駆者との別れ」を成立させていることが前提になった
      recentComboHistory: [['shitei_no_wakare']],
    });
    expect(awaken.stressReleased).toBe(2);
    expect(awaken.weekMultiplier).toBe(3); // 継承の覚醒も同時に成立する
  });

  it('緊張が2以上たまるとショップで解放カードが提示される（v5.5）', () => {
    const base = { ...createRun(data, 11, { mangaTitle: 'テスト' }), funds: 10 };
    const calm = rollPack(data, base, 16);
    const tense = rollPack(data, { ...base, stress: 3 }, 16);
    const relief = ['dai_shouri', 'kyuushutsu', 'fukkatsu', 'kakusei'];
    expect(tense.some((id) => relief.includes(id))).toBe(true);
    expect(tense).not.toEqual(calm);
  });

  it('ジャイアントキリング: 敵優勢のまま大勝利で話題+8', () => {
    const b = computeScore({
      data,
      cards: makeState(
        [makeInstance(data, 'hero', 1), makeInstance(data, 'shukuteki', 1), makeInstance(data, 'dai_shouri', 1)],
        5,
      ).cards,
      week: 5,
      selection: { cards: ['dai_shouri#1'], targets: {} },
    });
    expect(b.combos.find((c) => c.comboId === 'giant_killing')?.status).toBe('applied');
  });

  it('成長の実感: 敗北→修行を経た後の大勝利で成立する', () => {
    const b = computeScore({
      data,
      cards: makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'dai_shouri', 1)], 6, { stress: 1 }).cards,
      week: 6,
      selection: { cards: ['dai_shouri#1'], targets: {} },
      stress: 1,
      pastPlayedDefIds: ['haiboku', 'shugyou'],
      recentComboHistory: [[], []],
    });
    expect(b.combos.find((c) => c.comboId === 'seichou_no_jikkan')?.status).toBe('applied');
  });
});

describe('伏線の寝かせ（v5.3）', () => {
  it('長く寝かせた伏線ほど回収時の話題性が高い', () => {
    const cards = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen_kaishu', 1)], 10, {
      foreshadowTokens: 2,
    }).cards;

    const fresh = computeScore({
      data,
      cards,
      week: 10,
      selection: { cards: ['fukusen_kaishu#1'], targets: {} },
      foreshadowTokens: 2,
      foreshadowWeeks: [9, 9],
    });
    const aged = computeScore({
      data,
      cards,
      week: 10,
      selection: { cards: ['fukusen_kaishu#1'], targets: {} },
      foreshadowTokens: 2,
      foreshadowWeeks: [2, 3],
    });
    // 直近: 2×2 + (1+1) = 6 / 寝かせ: 2×2 + (8+7) = 19
    expect(fresh.comboBuzzTotal).toBe(6);
    expect(aged.comboBuzzTotal).toBe(19);
  });

  it('伏線を張った週が記録され、回収でリセットされる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen', 1)], 3);
    const after = resolveWeek(data, state, { cards: ['fukusen#1'], targets: {} }).state;
    expect(after.foreshadowWeeks).toEqual([3]);

    const w2 = {
      ...after,
      week: 7,
      hand: ['fukusen_kaishu#1'],
      cards: [...after.cards, makeInstance(data, 'fukusen_kaishu', 1)],
    };
    const collected = resolveWeek(data, w2, { cards: ['fukusen_kaishu#1'], targets: {} }).state;
    expect(collected.foreshadowWeeks).toEqual([]);
    expect(collected.foreshadowTokens).toBe(0);
  });
});

describe('夢オチによる立て直し（v5.3）', () => {
  it('死亡済みキャラを全員場に戻し、全キャラの人気度が恒久-2される', () => {
    const state = makeState(
      [
        makeInstance(data, 'hero', 1, { zone: 'dead' }),
        makeInstance(data, 'heroine', 1, { zone: 'dead' }),
        makeInstance(data, 'rival', 1),
        makeInstance(data, 'yumeochi', 1),
      ],
      6,
    );
    const result = resolveWeek(data, state, { cards: ['yumeochi#1'], targets: {} });
    const cards = result.state.cards;
    expect(cards.find((c) => c.instanceId === 'hero#1')!.zone).toBe('field');
    expect(cards.find((c) => c.instanceId === 'heroine#1')!.zone).toBe('field');
    // 場にいたキャラは信頼低下を受ける
    expect(cards.find((c) => c.instanceId === 'rival#1')!.permanentPopularityBonus).toBe(-2);
    // 次週の鮮度低下も予約される
    expect(result.state.pendingFreshnessPenalty).toBe(0.25);
  });

  it('全滅した翌週に夢オチを使えば連載を続けられる', () => {
    const state = makeState(
      [
        makeInstance(data, 'hero', 1, { zone: 'dead' }),
        makeInstance(data, 'heroine', 1, { zone: 'dead' }),
        makeInstance(data, 'yumeochi', 1),
      ],
      6,
    );
    const result = resolveWeek(data, state, { cards: ['yumeochi#1'], targets: {} });
    // キャスト0でも復帰手段を使ったので連載続行不能にはならない
    expect(result.outcome).toBe('continue');
    expect(result.state.cards.filter((c) => c.zone === 'field')).toHaveLength(2);
  });
});
