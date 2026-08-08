import { describe, expect, it } from 'vitest';
import { previewScore, resolveWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

describe('ジャンルの名残の撤去（v5.8）', () => {
  it('ラブコメ・ミステリータグは残っていない', () => {
    for (const def of data.definitions.values()) {
      expect(def.tags.every((t) => t === 'battle')).toBe(true);
    }
  });

  it('「学園編」は削除され、「温泉回」は「宴会」になっている', () => {
    expect(data.definitions.get('gakuen_hen')).toBeUndefined();
    expect(data.definitions.get('onsen_kai')).toBeUndefined();
    expect(data.definitions.get('enkai')?.name).toBe('宴会');
  });

  it('宴会は従来どおり役を無効化して鮮度を全回復する', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1)], 3, {
      freshnessByDef: { battle: 0.5, nichijou: 0.25 },
    });
    const after = resolveWeek(data, state, { cards: ['enkai#1'], targets: {} }).state;
    expect(after.freshnessByDef).toEqual({});
  });
});

describe('追加カードと役（v5.8）', () => {
  it('「一方そのころ」で再登場待ちのキャラを場に戻せる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'waiting', leftWeek: 5 }),
      makeInstance(data, 'ippou_sonokoro', 1),
    ];
    const state = makeState(cards, 9);
    const sel = { cards: ['ippou_sonokoro#1'], targets: { 'ippou_sonokoro#1': 'rival#1' } };
    expect(validateSelection(data, state, sel).ok).toBe(true);

    // 場のキャラや控えは対象にできない
    expect(validateSelection(data, state, { cards: ['ippou_sonokoro#1'], targets: { 'ippou_sonokoro#1': 'hero#1' } }).ok).toBe(false);

    const after = resolveWeek(data, state, sel).state;
    expect(after.cards.find((c) => c.instanceId === 'rival#1')!.zone).toBe('field');
  });

  it('「骨休め」は役を消さずに、出さなかった展開の鮮度回復を厚くする', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'honeyasume', 1)];
    const state = makeState(cards, 3, { freshnessByDef: { battle: 0.25 } });
    const after = resolveWeek(data, state, { cards: ['honeyasume#1'], targets: {} }).state;
    // 通常の回復は+25%だが、骨休めで+50%になる
    expect(after.freshnessByDef['battle']).toBe(0.75);
  });

  it('「記憶喪失」は仕込みフラグを失うかわりに人気度が大きく上がる', () => {
    const cards = [
      makeInstance(data, 'hero', 1, { flags: { training: 2, love: true } }),
      makeInstance(data, 'kioku_soushitsu', 1),
    ];
    const state = makeState(cards, 9);
    const after = resolveWeek(data, state, {
      cards: ['kioku_soushitsu#1'],
      targets: { 'kioku_soushitsu#1': 'hero#1' },
    }).state;
    const hero = after.cards.find((c) => c.instanceId === 'hero#1')!;
    expect(hero.flags).toEqual({ training: 0, love: false });
    expect(hero.permanentPopularityBonus).toBe(6);
  });

  it('「自己犠牲」は対象を失うかわりに残り全員を強化する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'jiko_gisei', 1),
    ];
    const state = makeState(cards, 20);
    const after = resolveWeek(data, state, { cards: ['jiko_gisei#1'], targets: { 'jiko_gisei#1': 'aibou#1' } }).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.zone).toBe('dead');
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.permanentPopularityBonus).toBe(3);
    expect(after.stress).toBe(1);
  });

  it('役「父を超える」: 場に父がいる状態で主人公が覚醒すると人気度×2', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'chichi', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
    ];
    const b = previewScore(data, makeState(cards, 12), {
      cards: ['nouryoku_kakusei#1'],
      targets: { 'nouryoku_kakusei#1': 'hero#1' },
    });
    expect(applied(b)).toContain('父を超える');
    // 主人公10×2 + 父11 = 31
    expect(b.popularityTotal).toBe(31);
  });

  it('役「勇気の発露」: 弱いキャラがいる状態の「人助け」でそのキャラの人気度×3', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'yowamushi', 1),
      makeInstance(data, 'hitodasuke', 1),
    ];
    const b = previewScore(data, makeState(cards, 4), { cards: ['hitodasuke#1'], targets: {} });
    expect(applied(b)).toContain('勇気の発露');
    // 主人公10 + 弱虫5×3 = 25
    expect(b.popularityTotal).toBe(25);
  });

  it('役「悪にも絆」: 敵キャラと一般人がいる状態で「日常回」か「人助け」', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'ippanjin', 1),
      makeInstance(data, 'shukuteki', 1),
      makeInstance(data, 'nichijou', 1),
    ];
    const b = previewScore(data, makeState(cards, 10), { cards: ['nichijou#1'], targets: {} });
    expect(applied(b)).toContain('悪にも絆');

    // 一般人がいなければ成立しない
    const noCivilian = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'shukuteki', 1),
      makeInstance(data, 'nichijou', 1),
    ];
    expect(applied(previewScore(data, makeState(noCivilian, 10), { cards: ['nichijou#1'], targets: {} }))).not.toContain('悪にも絆');
  });

  it('役「敵の敵は味方」: 敵2人以上の状態で「一時休戦」', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'teki_kanbu_power', 1),
      makeInstance(data, 'ichiji_kyuusen', 1),
    ];
    const b = previewScore(data, makeState(cards, 12, { stress: 1 }), { cards: ['ichiji_kyuusen#1'], targets: {} });
    expect(applied(b)).toContain('敵の敵は味方');
  });

  it('役「どんでん返し」: 同じ週に「裏切り」と「改心」', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'uragiri', 1),
      makeInstance(data, 'kaishin', 1),
    ];
    const b = previewScore(data, makeState(cards, 12), {
      cards: ['uragiri#1', 'kaishin#1'],
      targets: { 'uragiri#1': 'hero#1', 'kaishin#1': 'rival#1' },
    });
    expect(applied(b)).toContain('どんでん返し');
  });

  it('役「因縁の決着」: 過去に「因縁」を描いていれば「大勝利」で週スコア×2', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'dai_shouri', 1)];
    const withPast = makeState(cards, 20, {
      log: [
        {
          week: 8,
          playedInstanceIds: ['innen#1'],
          playedDefinitionIds: ['innen'],
          comboIds: [],
          score: 0,
          quota: 0,
          cleared: true,
          warningsAfter: 0,
        },
      ],
    });
    expect(applied(previewScore(data, withPast, { cards: ['dai_shouri#1'], targets: {} }))).toContain('因縁の決着');
    // 「因縁」を描いていなければ成立しない
    expect(applied(previewScore(data, makeState(cards, 20), { cards: ['dai_shouri#1'], targets: {} }))).not.toContain('因縁の決着');
  });

  it('役「間一髪」: 同じ週に「大ピンチ」と「救出」', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'dai_pinch', 1), makeInstance(data, 'kyuushutsu', 1)];
    const b = previewScore(data, makeState(cards, 12), { cards: ['dai_pinch#1', 'kyuushutsu#1'], targets: {} });
    expect(applied(b)).toContain('間一髪');
  });
});
