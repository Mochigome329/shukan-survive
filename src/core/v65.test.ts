/** v6.5: 導き手役（師弟の別れ/意志を継ぐ者/先駆者の力）の父母対応、伝説を聞く系3役、幼なじみ/相棒の新役 */
import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
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

describe('導き手役の父母対応（v6.5）', () => {
  it('先駆者との別れ: 父の死亡でも成立する', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'chichi', 1), makeInstance(data, 'shibou', 1)],
      { cards: ['shibou#1'], targets: { 'shibou#1': 'chichi#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shitei_no_wakare')?.status).toBe('applied');
  });

  it('先駆者との別れ: 母の死亡でも成立する', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'haha', 1), makeInstance(data, 'shibou', 1)],
      { cards: ['shibou#1'], targets: { 'shibou#1': 'haha#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shitei_no_wakare')?.status).toBe('applied');
  });

  it('意志を継ぐ者: 父が死亡済みの状態で「技ゲット」をプレイすると成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'chichi', 1, { zone: 'dead' }),
      makeInstance(data, 'waza_get', 1),
    ];
    const b = score(cards, { cards: ['waza_get#1'], targets: { 'waza_get#1': 'hero#1' } });
    expect(b.combos.find((c) => c.comboId === 'densho')?.status).toBe('applied');
  });

  it('先駆者の力: 場に母がいる状態で「大勝利」をプレイすると成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'haha', 1), makeInstance(data, 'dai_shouri', 1)];
    const b = score(cards, { cards: ['dai_shouri#1'] });
    expect(b.combos.find((c) => c.comboId === 'senkusha_no_chikara')?.status).toBe('applied');
  });
});

describe('かませ犬の再定義（v6.5）', () => {
  it('新キャラ登場+途中離脱（同じキャラ）+バトルで成立し、その新顔以外の敵の人気が恒久+5', () => {
    const cards = [
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'ridatsu', 1),
      makeInstance(data, 'battle', 1),
    ];
    const selection = {
      cards: ['shinchara#1', 'ridatsu#1', 'battle#1'],
      targets: { 'shinchara#1': 'mascot#1', 'ridatsu#1': 'mascot#1' },
    };
    const b = score(cards, selection);
    const combo = b.combos.find((c) => c.comboId === 'kamase_inu');
    expect(combo?.status).toBe('applied');
    expect(combo?.boundCharIds).toContain('mascot#1');
    expect(combo?.boundCharIds).toContain('rival#1');
  });

  it('離脱させたのが別のキャラなら不成立', () => {
    const cards = [
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'ridatsu', 1),
      makeInstance(data, 'battle', 1),
    ];
    const selection = {
      cards: ['shinchara#1', 'ridatsu#1', 'battle#1'],
      targets: { 'shinchara#1': 'mascot#1', 'ridatsu#1': 'aibou#1' },
    };
    const b = score(cards, selection);
    expect(b.combos.find((c) => c.comboId === 'kamase_inu')).toBeUndefined();
  });
});

describe('伝説を聞く系の新役（v6.5）', () => {
  it('伝説武器ゲット: 「伝説を聞く」+「武器ゲット」で成立し、対象の人気度が恒久+3', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'densetsu', 1), makeInstance(data, 'buki_get', 1)];
    const b = score(cards, { cards: ['densetsu#1', 'buki_get#1'], targets: { 'buki_get#1': 'hero#1' } });
    expect(b.combos.find((c) => c.comboId === 'densetsu_buki')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'hero#1', amount: 3 });
  });

  it('伝説技ゲット: 「伝説を聞く」+「技ゲット」で成立し、対象の人気度が恒久+3', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'densetsu', 1), makeInstance(data, 'waza_get', 1)];
    const b = score(cards, { cards: ['densetsu#1', 'waza_get#1'], targets: { 'waza_get#1': 'hero#1' } });
    expect(b.combos.find((c) => c.comboId === 'densetsu_waza')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'hero#1', amount: 3 });
  });

  it('宝探し: 「伝説を聞く」+「キーアイテム探し」で成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'densetsu', 1), makeInstance(data, 'key_item', 1)];
    const b = score(cards, { cards: ['densetsu#1', 'key_item#1'] });
    expect(b.combos.find((c) => c.comboId === 'takara_sagashi')?.status).toBe('applied');
  });

  it('武器ゲットだけでは伝説武器ゲットは成立しない（新装備は成立する）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'buki_get', 1), makeInstance(data, 'battle', 1)];
    const b = score(cards, { cards: ['buki_get#1', 'battle#1'], targets: { 'buki_get#1': 'hero#1' } });
    expect(b.combos.find((c) => c.comboId === 'densetsu_buki')).toBeUndefined();
    expect(b.combos.find((c) => c.comboId === 'shinsoubi')?.status).toBe('applied');
  });
});

describe('幼なじみ・相棒の新役（v6.5）', () => {
  it('あの頃の僕たち: 場に幼なじみがいる状態で「回想」をプレイすると成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'osananajimi', 1), makeInstance(data, 'kaisou', 1)];
    const b = score(cards, { cards: ['kaisou#1'] });
    expect(b.combos.find((c) => c.comboId === 'ano_koro_no_bokutachi')?.status).toBe('applied');
  });

  it('嫉妬心: 幼なじみを対象に「裏切り」をプレイすると成立し、衝撃の裏切りは抑制される', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'osananajimi', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'osananajimi#1' } });
    expect(b.combos.find((c) => c.comboId === 'shitto_shin')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('suppressed');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'osananajimi#1', amount: 4 });
  });

  it('嫉妬心: 相棒を対象でも成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'aibou#1' } });
    expect(b.combos.find((c) => c.comboId === 'shitto_shin')?.status).toBe('applied');
  });

  it('幼なじみ・相棒・マスコット・ヒロイン以外の仲間の裏切りは、これまでどおり衝撃の裏切りのまま', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shishou', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'shishou#1' } });
    expect(b.combos.find((c) => c.comboId === 'shitto_shin')).toBeUndefined();
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('applied');
  });
});
