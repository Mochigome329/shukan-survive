import { describe, expect, it } from 'vitest';
import { previewScore, resolveWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { WeekLogEntry } from './types';

const data = loadTestData();
const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

const logOf = (defIds: string[], week = 5): WeekLogEntry => ({
  week,
  playedInstanceIds: [],
  playedDefinitionIds: defIds,
  comboIds: [],
  score: 0,
  quota: 0,
  cleared: true,
  warningsAfter: 0,
});

describe('カードの役割整理（v5.8b）', () => {
  it('「全滅」で倒れるのは仲間だけで、敵は場に残る', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'shukuteki', 1), // 敵
      makeInstance(data, 'zenmetsu', 1),
    ];
    const after = resolveWeek(data, makeState(cards, 20), { cards: ['zenmetsu#1'], targets: {} }).state;
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.zone).toBe('dead');
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.zone).toBe('dead');
    expect(after.cards.find((c) => c.instanceId === 'shukuteki#1')!.zone).toBe('field');
  });

  it('「宴会」は単独プレイ限定になり、役が消えるかわりに緊張も解ける', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1), makeInstance(data, 'battle', 1)];
    const state = makeState(cards, 3, { stress: 2, freshnessByDef: { battle: 0.5 } });

    // 他のカードと一緒には出せない
    expect(validateSelection(data, state, { cards: ['enkai#1', 'battle#1'], targets: {} }).ok).toBe(false);

    const b = previewScore(data, state, { cards: ['enkai#1'], targets: {} });
    expect(b.stressReleased).toBe(2); // 役無効ではなくなったので解放も効く
    const after = resolveWeek(data, state, { cards: ['enkai#1'], targets: {} }).state;
    expect(after.freshnessByDef).toEqual({});
    expect(after.stress).toBe(0);
  });

  it('「喪失」は退場と引き換えに対象を強くする（途中離脱との違い）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'soushitsu', 1)];
    const after = resolveWeek(data, makeState(cards, 10), {
      cards: ['soushitsu#1'],
      targets: { 'soushitsu#1': 'aibou#1' },
    }).state;
    const aibou = after.cards.find((c) => c.instanceId === 'aibou#1')!;
    expect(aibou.zone).toBe('waiting');
    expect(aibou.permanentPopularityBonus).toBe(5);
  });

  it('「一方そのころ」は2週待ちを無視して即戻せて、人気度も上がる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'waiting', leftWeek: 9 }), // 先週離脱＝通常の再登場はまだ不可
      makeInstance(data, 'ippou_sonokoro', 1),
    ];
    const after = resolveWeek(data, makeState(cards, 10), {
      cards: ['ippou_sonokoro#1'],
      targets: { 'ippou_sonokoro#1': 'rival#1' },
    }).state;
    const rival = after.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rival.zone).toBe('field');
    expect(rival.permanentPopularityBonus).toBe(3);
  });

  it('「全員生還」は代償なしで死亡済みを全員戻す（第17話以降）', () => {
    const def = data.definitions.get('zenin_seikan')!;
    // v7.19: maxCopies:1・unlockWeek:17で既に十分に希少なため、レア倍率(0.4x)の重複ペナルティは外した。
    // 以前はショップに一度でも並ぶ確率が実測32%しかなく「ほぼ出ない」状態だった
    expect(def.rare).toBeFalsy();
    expect(def.unlockWeek).toBe(17);

    const cards = [
      makeInstance(data, 'hero', 1, { zone: 'dead' }),
      makeInstance(data, 'aibou', 1, { zone: 'dead' }),
      makeInstance(data, 'zenin_seikan', 1),
    ];
    const after = resolveWeek(data, makeState(cards, 20, { stress: 2 }), { cards: ['zenin_seikan#1'], targets: {} }).state;
    expect(after.cards.filter((c) => c.zone === 'field').length).toBe(2);
    expect(after.stress).toBe(0);
    // 夢オチと違って恒久マイナスはない
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.permanentPopularityBonus).toBe(0);
  });

  it('「共闘」はその週だけ全員の人気度+5（恒久には残らない）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'kyoutou', 1)];
    const state = makeState(cards, 10);
    const b = previewScore(data, state, { cards: ['kyoutou#1'], targets: {} });
    expect(b.popularityTotal).toBe(10 + 8 + 5 * 2);
    const after = resolveWeek(data, state, { cards: ['kyoutou#1'], targets: {} }).state;
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.permanentPopularityBonus).toBe(0);
  });

  it('「弔い合戦」は死亡済み1人につき話題性+2', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead' }),
      makeInstance(data, 'osananajimi', 1, { zone: 'dead' }),
      makeInstance(data, 'tomurai_gassen', 1),
    ];
    const b = previewScore(data, makeState(cards, 20), { cards: ['tomurai_gassen#1'], targets: {} });
    // 基礎2 + 死亡2人×2 = 6
    expect(b.buzzApplied).toBeGreaterThanOrEqual(6);
    expect(applied(b)).toContain('かたき討ち');
  });
});

describe('役の付け替えと追加（v5.8b）', () => {
  it('「勇気の発露」「意外な活躍」「意地を見せる」は三枚目・一般人・弱虫が対象', () => {
    // 相棒（人気8）では成立しない
    const aibou = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'hitodasuke', 1)];
    expect(applied(previewScore(data, makeState(aibou, 5), { cards: ['hitodasuke#1'], targets: {} }))).not.toContain('勇気の発露');

    // 弱虫なら成立する
    const yowa = [makeInstance(data, 'hero', 1), makeInstance(data, 'yowamushi', 1), makeInstance(data, 'hitodasuke', 1)];
    const b = previewScore(data, makeState(yowa, 5), { cards: ['hitodasuke#1'], targets: {} });
    expect(applied(b)).toContain('勇気の発露');
    expect(b.popularityTotal).toBe(10 + 5 * 3);
  });

  it('「意地を見せる」: 弱虫を対象に能力覚醒＋バトルで、恒久+6', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'yowamushi', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
      makeInstance(data, 'battle', 1),
    ];
    const b = previewScore(data, makeState(cards, 10), {
      cards: ['nouryoku_kakusei#1', 'battle#1'],
      targets: { 'nouryoku_kakusei#1': 'yowamushi#1' },
    });
    expect(applied(b)).toContain('意地を見せる');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'yowamushi#1', amount: 6 });
  });

  it('「どんでん返し」は正反対の2枚なら裏切り＋改心以外でも成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'dai_shouri', 1),
      makeInstance(data, 'dai_pinch', 1),
    ];
    const b = previewScore(data, makeState(cards, 12), { cards: ['dai_shouri#1', 'dai_pinch#1'], targets: {} });
    expect(applied(b)).toContain('どんでん返し');
  });

  it('「先駆者の力」: 師匠が場にいる状態で大勝利', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shishou', 1), makeInstance(data, 'dai_shouri', 1)];
    expect(applied(previewScore(data, makeState(cards, 12), { cards: ['dai_shouri#1'], targets: {} }))).toContain('先駆者の力');
  });

  it('「母は強し」「おふくろの味」: 母がいる回に成立する', () => {
    const pinch = [makeInstance(data, 'hero', 1), makeInstance(data, 'haha', 1), makeInstance(data, 'dai_pinch', 1)];
    const b1 = previewScore(data, makeState(pinch, 12), { cards: ['dai_pinch#1'], targets: {} });
    expect(applied(b1)).toContain('母は強し');
    expect(b1.popularityTotal).toBe(10 + 9 * 3 - 6); // 緊張1で-6

    // v7.25: 「日常回」単独ではなく「日常回」+「骨休め」のAND条件になった
    const nichijou = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'haha', 1),
      makeInstance(data, 'nichijou', 1),
      makeInstance(data, 'honeyasume', 1),
    ];
    expect(
      applied(previewScore(data, makeState(nichijou, 12), { cards: ['nichijou#1', 'honeyasume#1'], targets: {} })),
    ).toContain('おふくろの味');
  });

  it('「昇進と粛清」: 敵幹部と宿敵が揃った状態で敵を死亡させる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'teki_kanbu_power', 1),
      makeInstance(data, 'shukuteki', 1),
      makeInstance(data, 'shibou', 1),
    ];
    const b = previewScore(data, makeState(cards, 18), { cards: ['shibou#1'], targets: { 'shibou#1': 'teki_kanbu_power#1' } });
    expect(applied(b)).toContain('昇進と粛清');
  });

  it('「雨降って地固まる」: 過去に大喧嘩を描いた状態で仲直り', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'nakanaori', 1)];
    const withPast = makeState(cards, 12, { stress: 1, log: [logOf(['oogenka'])] });
    expect(applied(previewScore(data, withPast, { cards: ['nakanaori#1'], targets: {} }))).toContain('雨降って地固まる');
    // 喧嘩していなければ成立しない
    expect(applied(previewScore(data, makeState(cards, 12), { cards: ['nakanaori#1'], targets: {} }))).not.toContain('雨降って地固まる');
  });

  it('「不穏な日常」「決戦前夜」: 第17話以降の日常回・宴会に意味を持たせる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    expect(applied(previewScore(data, makeState(cards, 20), { cards: ['nichijou#1'], targets: {} }))).toContain('不穏な日常');
    // 第16話以前は成立しない
    expect(applied(previewScore(data, makeState(cards, 10), { cards: ['nichijou#1'], targets: {} }))).not.toContain('不穏な日常');

    const enkai = [makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1)];
    expect(applied(previewScore(data, makeState(enkai, 20), { cards: ['enkai#1'], targets: {} }))).toContain('決戦前夜');
  });

  it('「大長編」: 5週連続で役を成立させ続けると週スコア×1.5', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shishou', 1), makeInstance(data, 'dai_shouri', 1)];
    const history = [['a'], ['b'], ['c'], ['d']];
    const b = previewScore(data, makeState(cards, 15, { setupComboHistory: [], log: [] }), {
      cards: ['dai_shouri#1'],
      targets: {},
    });
    // 履歴なしでは成立しない
    expect(applied(b)).not.toContain('大長編');

    const withHistory = makeState(cards, 15, { log: history.map((ids, i) => ({ ...logOf([], 11 + i), comboIds: ids })) });
    expect(applied(previewScore(data, withHistory, { cards: ['dai_shouri#1'], targets: {} }))).toContain('大長編');
  });
});
