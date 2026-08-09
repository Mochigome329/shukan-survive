import { describe, expect, it } from 'vitest';
import { ENDING_CARDS } from './finale';
import { resolveWeek, startWeek } from './run';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const FINALE_WEEK = 25;
const anyEnding = () => ENDING_CARDS[0]!.id;

/** 役の成立だけを見たいので、状態を組んで1週ぶんのスコアを計算する */
function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week: number,
) {
  const state = makeState(cards, week);
  return computeScore({
    data,
    cards: state.cards,
    week,
    selection: { cards: selection.cards, targets: selection.targets ?? {} },
  });
}

describe('最終回の伏線回収（v7.16）', () => {
  it('通常週は、同じ週に張った伏線が次週へ残る（従来どおり）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'fukusen_kaishu', 1),
      makeInstance(data, 'densetsu', 1), // 伏線トークン+2
    ];
    const state = makeState(cards, 10, { foreshadowTokens: 3, foreshadowWeeks: [5, 6, 7] });
    const r = resolveWeek(data, state, { cards: ['fukusen_kaishu#1', 'densetsu#1'], targets: {} });
    expect(r.state.foreshadowTokens).toBe(2);
    expect(r.state.foreshadowWeeks).toEqual([10, 10]);
  });

  it('最終回は、同じ週に張った伏線も回収に巻き込む（未回収の減点が付かない）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'fukusen_kaishu', 1),
      makeInstance(data, 'densetsu', 1),
    ];
    const state = makeState(cards, FINALE_WEEK, { foreshadowTokens: 3, foreshadowWeeks: [5, 6, 7] });
    const r = resolveWeek(data, state, { cards: ['fukusen_kaishu#1', 'densetsu#1'], targets: {} }, [], anyEnding());
    expect(r.breakdown.combos.find((c) => c.comboId === 'fukusen_kaishu')?.status).toBe('applied');
    expect(r.state.foreshadowTokens).toBe(0);
    expect(r.state.foreshadowWeeks).toEqual([]);
  });

  it('最終回でも、伏線回収をしていなければ張ったぶんは未回収のまま残る', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'densetsu', 1)];
    const state = makeState(cards, FINALE_WEEK, { foreshadowTokens: 1, foreshadowWeeks: [5] });
    const r = resolveWeek(data, state, { cards: ['densetsu#1'], targets: {} }, [], anyEnding());
    expect(r.state.foreshadowTokens).toBe(3);
  });
});

describe('闇堕ちでも裏切り系の役が成立する（v7.16）', () => {
  const betrayalCase = (devId: string, targetDefId: string) => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, targetDefId, 1),
      makeInstance(data, devId, 1),
    ];
    return score(cards, { cards: [`${devId}#1`], targets: { [`${devId}#1`]: `${targetDefId}#1` } }, 12);
  };

  // 幼なじみ・相棒・ライバル・マスコット・ヒロインには、より細かい裏切り役が別にあって
  // 総称の「衝撃の裏切り」を抑制するので、どれにも当たらない師匠で見る
  it('仲間を対象にした闇堕ちで「衝撃の裏切り」が成立する', () => {
    const b = betrayalCase('yamiochi', 'shishou');
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('applied');
  });

  it('裏切りでも従来どおり成立する', () => {
    const b = betrayalCase('uragiri', 'shishou');
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('applied');
  });

  it('闇堕ちでキャラ限定の裏切り役（獅子心中の虫）も成立する', () => {
    const b = betrayalCase('yamiochi', 'mascot');
    expect(b.combos.find((c) => c.comboId === 'shishinchuu_no_mushi')?.status).toBe('applied');
  });

  it('主人公は闇堕ちの対象にしても裏切り役にはならない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'yamiochi', 1)];
    const b = score(cards, { cards: ['yamiochi#1'], targets: { 'yamiochi#1': 'hero#1' } }, 12);
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')).toBeUndefined();
  });

  it('敵を仲間へ戻す役は闇堕ちでは成立しない（落とす方向なので筋が通らない）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }),
      makeInstance(data, 'yamiochi', 1),
    ];
    const b = score(cards, { cards: ['yamiochi#1'], targets: { 'yamiochi#1': 'rival#1' } }, 12);
    expect(b.combos.find((c) => c.comboId === 'kanchigai_suruna')).toBeUndefined();
  });
});

/*
 * v7.28: 最終回は展開カードを出さない回になったので、
 * 「今更なカードを抽選から外す」（v7.16）という対症療法ごと不要になった。
 * 手札が配られないこと自体をここで固定する
 */
describe('最終回は手札を配らない（v7.28、v7.16の除外リストを置き換え）', () => {
  const deck = () => [
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'battle', 90, { zone: 'activeDeck' }),
    makeInstance(data, 'dai_shouri', 91, { zone: 'activeDeck' }),
    makeInstance(data, 'nichijou', 92, { zone: 'activeDeck' }),
  ];

  it('最終回は手札が空になる', () => {
    const state = startWeek(data, makeState(deck(), FINALE_WEEK, { hand: [] }));
    expect(state.hand).toEqual([]);
  });

  it('仕入れ・ストックがあっても最終回では配られない', () => {
    const state = startWeek(
      data,
      makeState(deck(), FINALE_WEEK, { hand: [], guaranteedNextHand: ['battle#90'], stockedIds: ['nichijou#92'] }),
    );
    expect(state.hand).toEqual([]);
  });

  it('通常週は今までどおり手札が配られる', () => {
    const state = startWeek(data, makeState(deck(), 20, { hand: [] }));
    expect(state.hand.length).toBeGreaterThan(0);
  });
});
