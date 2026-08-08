import { describe, expect, it } from 'vitest';
import { ENDING_CARDS, endingBuzz, endingById, offeredEndings } from './finale';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { RunState, WeekLogEntry } from './types';

const data = loadTestData();
const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

function score(cards: ReturnType<typeof makeInstance>[], play: string[], targets: Record<string, string> = {}, week = 20) {
  const state = makeState(cards, week);
  return computeScore({ data, cards: state.cards, week, selection: { cards: play, targets } });
}

describe('弔い系は味方の死だけを数える（v7.17）', () => {
  const withDead = (faction: 'ally' | 'enemy', dev: string) => [
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'rival', 1, { zone: 'dead', faction, debutFaction: faction }),
    makeInstance(data, dev, 1),
  ];

  it('かたき討ち: 死んでいるのが敵だけなら成立しない', () => {
    expect(applied(score(withDead('enemy', 'dai_shouri'), ['dai_shouri#1']))).not.toContain('かたき討ち');
  });

  it('かたき討ち: 味方が死んでいれば成立する', () => {
    expect(applied(score(withDead('ally', 'dai_shouri'), ['dai_shouri#1']))).toContain('かたき討ち');
  });

  // buzzTotalは展開カードの素の話題性だけ。1人につきの加算は buzzApplied 側に入る
  it('弔い合戦の話題性は、死んだ敵では増えない', () => {
    const enemy = score(withDead('enemy', 'tomurai_gassen'), ['tomurai_gassen#1']);
    const ally = score(withDead('ally', 'tomurai_gassen'), ['tomurai_gassen#1']);
    expect(enemy.buzzApplied).toBe(2); // 素の話題性2のみ
    // 素の2 ＋ 死んだ味方1人ぶん2 ＋ ここで成立する「かたき討ち」7
    expect(ally.buzzApplied).toBe(11);
  });

  it('奇跡の生還: 死者3人が全員敵なら成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'shukuteki', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'teki_kanbu_power', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'fukkatsu', 1),
    ];
    expect(applied(score(cards, ['fukkatsu#1'], { 'fukkatsu#1': 'rival#1' }))).not.toContain('奇跡の生還');
  });
});

describe('先駆者の力は仲間の師匠・父・母に限る（v7.17）', () => {
  const withMentor = (faction: 'ally' | 'enemy') => [
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'shishou', 1, { faction }),
    makeInstance(data, 'dai_shouri', 1),
  ];

  it('師匠が仲間なら成立する', () => {
    expect(applied(score(withMentor('ally'), ['dai_shouri#1']))).toContain('先駆者の力');
  });

  it('師匠が敵に回っていると成立しない', () => {
    expect(applied(score(withMentor('enemy'), ['dai_shouri#1']))).not.toContain('先駆者の力');
  });
});

describe('悲しき悪役は週に1回まで（v7.17）', () => {
  it('同じ週に2枚別々の敵へ使っても二重に成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }),
      makeInstance(data, 'shukuteki', 1, { faction: 'enemy' }),
      makeInstance(data, 'kanashii_kako', 1),
      makeInstance(data, 'kanashii_kako', 2),
    ];
    const b = score(cards, ['kanashii_kako#1', 'kanashii_kako#2'], {
      'kanashii_kako#1': 'rival#1',
      'kanashii_kako#2': 'shukuteki#1',
    });
    expect(applied(b).filter((n) => n === '悲しき悪役')).toHaveLength(1);
    // 人気度の恒久+5も1人ぶんだけ（対象は人気度の高いほう＝宿敵）
    const adds = b.stateChanges.filter((c) => c.type === 'permanentPopularityAdd');
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({ instanceId: 'shukuteki#1', amount: 5 });
  });
});

describe('追加したバッドエンド（v7.17）', () => {
  const runWith = (overrides: Partial<RunState>): RunState =>
    makeState([makeInstance(data, 'hero', 1)], 25, { log: [], ...overrides });
  const week = (playedDefinitionIds: string[]): WeekLogEntry => ({
    week: 1,
    playedInstanceIds: [],
    playedDefinitionIds,
    comboIds: [],
    score: 0,
    quota: 0,
    cleared: true,
    warningsAfter: 0,
  });

  it('つかの間の平和: 敵が残っていて味方が2人以上死んでいると選べる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'osananajimi', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }),
    ];
    const state = makeState(cards, 25);
    expect(endingById('tsukanoma_no_heiwa')!.available(data, state)).toBe(true);
    // 死んだ味方1人につき話題性+2
    expect(endingBuzz(endingById('tsukanoma_no_heiwa')!, state)).toBe(7 + 2 * 2);
  });

  it('つかの間の平和: 敵を倒しきっていれば選べない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'osananajimi', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'rival', 1, { zone: 'dead', faction: 'enemy' }),
    ];
    expect(endingById('tsukanoma_no_heiwa')!.available(data, makeState(cards, 25))).toBe(false);
  });

  it('荒廃した世界: 大破壊・悲劇・敗北・全滅の合計が5回以上で選べる', () => {
    const four = runWith({ log: [week(['daihakai', 'higeki']), week(['haiboku', 'zenmetsu'])] });
    expect(endingById('kouhai_shita_sekai')!.available(data, four)).toBe(false);
    const five = runWith({ log: [week(['daihakai', 'higeki']), week(['haiboku', 'zenmetsu', 'daihakai'])] });
    expect(endingById('kouhai_shita_sekai')!.available(data, five)).toBe(true);
  });

  it('条件を満たすと最終回の選択肢に並ぶ', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'osananajimi', 1, { zone: 'dead', faction: 'ally' }),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }),
    ];
    const offered = offeredEndings(data, makeState(cards, 25)).map((e) => e.id);
    expect(offered).toContain('tsukanoma_no_heiwa');
  });

  it('2種ともバッドエンド扱いで、最終評価が下がる', () => {
    for (const id of ['tsukanoma_no_heiwa', 'kouhai_shita_sekai']) {
      const card = ENDING_CARDS.find((c) => c.id === id)!;
      expect(card.bad).toBe(true);
      expect(card.finalScoreDelta).toBeLessThan(0);
    }
  });
});

describe('全員生還は、戻らない死亡済みの敵を今週のキャストに数えない（v7.17 codexレビュー指摘）', () => {
  it('死亡済みの敵がいても、その週の人気度に混ざらない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'yumeochi', 1),
    ];
    const state = makeState(cards, 10);
    const b = computeScore({ data, cards: state.cards, week: 10, selection: { cards: ['yumeochi#1'], targets: {} } });
    expect(b.popularityTotal).toBe(10); // 主人公のみ。敵ライバル(15)を含めば25になってしまう
  });

  it('登場時に味方だった死亡済みキャラは、戻る週からちゃんと人気度に入る（従来どおり）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'ally' }),
      makeInstance(data, 'yumeochi', 1),
    ];
    const state = makeState(cards, 10);
    const b = computeScore({ data, cards: state.cards, week: 10, selection: { cards: ['yumeochi#1'], targets: {} } });
    expect(b.popularityTotal).toBe(18); // 主人公10 + 相棒8
  });
});
