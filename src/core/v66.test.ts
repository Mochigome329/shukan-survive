/** v6.6: 謎の転校生の撤去と敵幹部2分化、マスコットのflexFaction化、デビュー時の陣営の記録と復活・おかえり、新役3つ */
import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import { resolveWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week = 1,
) {
  const state = makeState(cards, week);
  return computeScore({ data, cards: state.cards, week, selection: { cards: selection.cards, targets: selection.targets ?? {} } });
}

describe('謎の転校生の撤去と敵幹部2分化（v6.6）', () => {
  it('謎の転校生はもう定義に存在しない', () => {
    expect(data.definitions.has('tenkousei')).toBe(false);
  });

  it('敵幹部（パワータイプ）・敵幹部（頭脳タイプ）がそれぞれ独立したキャラとして存在する', () => {
    const power = data.definitions.get('teki_kanbu_power');
    const brain = data.definitions.get('teki_kanbu_brain');
    expect(power?.kind).toBe('character');
    expect(brain?.kind).toBe('character');
  });

  it('昇進と粛清は敵幹部（頭脳タイプ）でも成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'teki_kanbu_brain', 1),
      makeInstance(data, 'shukuteki', 1),
      makeInstance(data, 'shibou', 1),
    ];
    const b = score(cards, { cards: ['shibou#1'], targets: { 'shibou#1': 'teki_kanbu_brain#1' } });
    expect(b.combos.find((c) => c.comboId === 'shoushin_to_shukusei')?.status).toBe('applied');
  });
});

describe('マスコットのflexFaction化と対象拡大（v6.6）', () => {
  it('マスコットは控えから敵としてデビューできる（新キャラ登場+陣営選択）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 3);
    const selection = {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'mascot#1' },
      factionChoices: { 'shinchara#1': 'enemy' as const },
    };
    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'mascot#1')!.faction).toBe('enemy');
  });

  it('意外な活躍: マスコットが場にいる状態でも成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'dai_shouri', 1)];
    const b = score(cards, { cards: ['dai_shouri#1'] });
    expect(b.combos.find((c) => c.comboId === 'igai_no_katsuyaku')?.status).toBe('applied');
  });

  it('意地を見せる: マスコットを対象に能力覚醒+バトルで成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'mascot', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
      makeInstance(data, 'battle', 1),
    ];
    const b = score(cards, {
      cards: ['nouryoku_kakusei#1', 'battle#1'],
      targets: { 'nouryoku_kakusei#1': 'mascot#1' },
    });
    expect(b.combos.find((c) => c.comboId === 'iji_wo_miseru')?.status).toBe('applied');
  });

  it('勇気の発露もマスコットを対象に含む（v6.6b）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'hitodasuke', 1)];
    const b = score(cards, { cards: ['hitodasuke#1'] });
    expect(b.combos.find((c) => c.comboId === 'yuuki_no_hatsuro')?.status).toBe('applied');
  });
});

describe('マスコット・ヒロインの裏切り専用役（v6.6）', () => {
  it('獅子心中の虫: マスコットの裏切りで成立し、衝撃の裏切りは抑制される', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'mascot#1' } });
    expect(b.combos.find((c) => c.comboId === 'shishinchuu_no_mushi')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('suppressed');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'mascot#1', amount: 4 });
  });

  it('絶望: ヒロインの裏切りで成立し、緊張+2される', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'heroine#1' } });
    expect(b.combos.find((c) => c.comboId === 'zetsubou')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('suppressed');
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 2 });
  });
});

describe('デビュー時の陣営の記録と、復活・おかえりでの復元（v6.6）', () => {
  it('控えからデビューすると、そのときの陣営がdebutFactionとして記録される', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 3);
    const selection = {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'osananajimi#1' },
      factionChoices: { 'shinchara#1': 'enemy' as const },
    };
    const after = resolveWeek(data, state, selection).state;
    const osananajimi = after.cards.find((c) => c.instanceId === 'osananajimi#1')!;
    expect(osananajimi.faction).toBe('enemy');
    expect(osananajimi.debutFaction).toBe('enemy');
  });

  it('裏切りで敵になったキャラが死亡→復活すると、デビュー時の陣営（仲間）に戻る', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'ally' }),
      makeInstance(data, 'fukkatsu', 1),
    ];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['fukkatsu#1'],
      targets: { 'fukkatsu#1': 'aibou#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.faction).toBe('ally');
  });

  it('デビュー時に敵として登場したキャラは、死亡→復活しても敵のまま', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'fukkatsu', 1),
    ];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['fukkatsu#1'],
      targets: { 'fukkatsu#1': 'osananajimi#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'osananajimi#1')!.faction).toBe('enemy');
  });

  /*
   * v7.17: 「全員生還」で戻るのは登場時に味方だった者だけになった。
   * 裏切って敵として死んだ仲間（相棒）は戻って陣営も復元されるが、
   * 最初から敵だった者（ライバル）は戻らない
   */
  it('夢オチ（reviveAllDead）で復帰するのは元が味方だった者。復帰時はデビュー時の陣営に戻る', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'dead', faction: 'enemy', debutFaction: 'ally' }),
      makeInstance(data, 'rival', 1, { zone: 'dead', faction: 'ally', debutFaction: 'enemy' }),
      makeInstance(data, 'yumeochi', 1),
    ];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, { cards: ['yumeochi#1'], targets: {} }).state;
    const aibou = after.cards.find((c) => c.instanceId === 'aibou#1')!;
    expect(aibou.zone).toBe('field');
    expect(aibou.faction).toBe('ally');
    const rival = after.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rival.zone).toBe('dead');
  });

  it('「おかえり」: 敵陣営になった仲間をデビュー時の陣営へ戻す', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { faction: 'enemy', debutFaction: 'ally' }),
      makeInstance(data, 'okaeri', 1),
    ];
    const state = makeState(cards, 10);
    const valid = validateSelection(data, state, { cards: ['okaeri#1'], targets: { 'okaeri#1': 'aibou#1' } });
    expect(valid.ok).toBe(true);
    const after = resolveWeek(data, state, { cards: ['okaeri#1'], targets: { 'okaeri#1': 'aibou#1' } }).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.faction).toBe('ally');
  });

  it('「おかえり」: すでにデビュー時の陣営なら何も起きない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'okaeri', 1)];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, { cards: ['okaeri#1'], targets: { 'okaeri#1': 'aibou#1' } }).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.faction).toBe('ally');
  });
});

describe('思い届かず（v6.6）', () => {
  it('裏切りで敵になった仲間が死亡すると成立し、緊張+1される', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { faction: 'enemy', debutFaction: 'ally' }),
      makeInstance(data, 'shibou', 1),
    ];
    const b = score(cards, { cards: ['shibou#1'], targets: { 'shibou#1': 'aibou#1' } });
    expect(b.combos.find((c) => c.comboId === 'omoi_todokazu')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 1 });
  });

  it('デビュー時から敵のキャラが死亡しても不成立', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'shibou', 1)];
    const b = score(cards, { cards: ['shibou#1'], targets: { 'shibou#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'omoi_todokazu')).toBeUndefined();
  });

  it('仲間のまま死亡しても不成立', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'shibou', 1)];
    const b = score(cards, { cards: ['shibou#1'], targets: { 'shibou#1': 'aibou#1' } });
    expect(b.combos.find((c) => c.comboId === 'omoi_todokazu')).toBeUndefined();
  });
});

describe('裏切りの向きで分かれる専用役（v6.6b）', () => {
  it('嫉妬心はライバルの味方→敵の裏切りでも成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1, { faction: 'ally' }), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'shitto_shin')?.status).toBe('applied');
  });

  it('あの頃みたいに: 幼なじみ・相棒の敵→味方の裏切りで成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'uragiri', 1),
    ];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'osananajimi#1' } });
    expect(b.combos.find((c) => c.comboId === 'ano_koro_mitaini')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'osananajimi#1', amount: 4 });
  });

  it('あなたと共に: ヒロインの敵→味方の裏切りで成立し、緊張が全解放される', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'uragiri', 1),
    ];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'heroine#1' } });
    expect(b.combos.find((c) => c.comboId === 'anata_to_tomoni')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'releaseStress' });
  });

  it('勘違いするな: ライバルの敵→味方の裏切りで成立する（既定の敵デビューのまま）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'kanchigai_suruna')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'rival#1', amount: 4 });
  });

  it('向きが逆なら成立しない（嫉妬心は敵→味方では不成立、勘違いするなは味方→敵では不成立）', () => {
    const enemyRival = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'uragiri', 1)];
    const b1 = score(enemyRival, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } });
    expect(b1.combos.find((c) => c.comboId === 'shitto_shin')).toBeUndefined();

    const allyRival = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1, { faction: 'ally' }), makeInstance(data, 'uragiri', 1)];
    const b2 = score(allyRival, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } });
    expect(b2.combos.find((c) => c.comboId === 'kanchigai_suruna')).toBeUndefined();
  });
});

describe('同じキャラを2枚のデビュー展開の対象にできない（v6.6c、外部レビューで指摘）', () => {
  it('新キャラ登場と悪役会議で同じ控えキャラを対象にすると拒否される', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'akuyaku_kaigi', 1),
    ];
    const state = makeState(cards, 5);
    const selection = {
      cards: ['shinchara#1', 'akuyaku_kaigi#1'],
      targets: { 'shinchara#1': 'osananajimi#1', 'akuyaku_kaigi#1': 'osananajimi#1' },
    };
    expect(validateSelection(data, state, selection).ok).toBe(false);
  });

  it('別々の控えキャラを対象にするなら問題ない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'bench' }),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'akuyaku_kaigi', 1),
    ];
    const state = makeState(cards, 5);
    const selection = {
      cards: ['shinchara#1', 'akuyaku_kaigi#1'],
      targets: { 'shinchara#1': 'aibou#1', 'akuyaku_kaigi#1': 'osananajimi#1' },
    };
    expect(validateSelection(data, state, selection).ok).toBe(true);
  });
});
