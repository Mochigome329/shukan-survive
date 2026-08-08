import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

function score(cards: ReturnType<typeof makeInstance>[], play: string[], targets: Record<string, string> = {}, week = 20) {
  const state = makeState(cards, week);
  return computeScore({ data, cards: state.cards, week, selection: { cards: play, targets } });
}

describe('全滅は単独でも役として成立する（v7.19）', () => {
  it('「全滅」を出すだけで役「全滅」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'zenmetsu', 1)];
    const b = score(cards, ['zenmetsu#1']);
    expect(applied(b)).toContain('全滅');
  });

  it('「悲しい過去」も揃えると、より強い「全滅エンド」に差し替わる（二重成立しない）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'zenmetsu', 1),
      makeInstance(data, 'kanashii_kako', 1),
    ];
    const b = score(cards, ['zenmetsu#1', 'kanashii_kako#1'], { 'kanashii_kako#1': 'hero#1' });
    const names = applied(b);
    expect(names).toContain('全滅エンド');
    expect(names).not.toContain('全滅');
  });
});

describe('大勝利は場の最弱の敵を自動で撃破する（v7.20, v7.22）', () => {
  it('敵が複数いれば、人気度が最も低い敵がwaitingへ送られる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }), // 15
      makeInstance(data, 'shukuteki', 1, { faction: 'enemy' }), // 20
      makeInstance(data, 'dai_shouri', 1),
    ];
    const b = score(cards, ['dai_shouri#1']);
    expect(b.stateChanges).toContainEqual({ type: 'moveZone', instanceId: 'rival#1', to: 'waiting' });
    expect(b.stateChanges).not.toContainEqual({ type: 'moveZone', instanceId: 'shukuteki#1', to: 'waiting' });
  });

  it('敵が場にいなければ何も起きない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'dai_shouri', 1)];
    const b = score(cards, ['dai_shouri#1']);
    expect(b.stateChanges.some((c) => c.type === 'moveZone')).toBe(false);
  });

  it('同じ週に別カードで既に敵の退場（死亡）が決まっていれば、追加の撃破は発生しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'shukuteki', 1, { faction: 'enemy', playCount: 3 }),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }), // 撃破すれば普段はこちら（最弱）が選ばれるはずの敵
      makeInstance(data, 'shibou', 1),
      makeInstance(data, 'dai_shouri', 1),
    ];
    const b = score(cards, ['shibou#1', 'dai_shouri#1'], { 'shibou#1': 'shukuteki#1' });
    expect(b.stateChanges).toContainEqual({ type: 'moveZone', instanceId: 'shukuteki#1', to: 'dead' });
    // 大勝利ぶんの追加撃破は一切発生しない（rivalも動かない）
    expect(b.stateChanges.filter((c) => c.type === 'moveZone')).toHaveLength(1);
  });

  it('同じ週に敵の退場が決まっていなければ、従来どおり最弱の敵を撃破する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'rival', 1, { faction: 'enemy' }),
      makeInstance(data, 'shugyou', 1),
      makeInstance(data, 'dai_shouri', 1),
    ];
    // 死亡・撃破・途中離脱を含まない展開（修行）を混ぜても、大勝利の自動撃破は普通に発生する
    const b = score(cards, ['shugyou#1', 'dai_shouri#1'], { 'shugyou#1': 'aibou#1' });
    expect(b.stateChanges).toContainEqual({ type: 'moveZone', instanceId: 'rival#1', to: 'waiting' });
  });

  /*
   * v7.22: 実プレイで「敵が父しかいないのに、最終回でも場に残っていた」という報告があった。
   * 原因は、自動撃破の対象を今週ハイライトされた出演者（最大6人）に限っていたこと。
   * 撃破は対象選択UIが無い自動効果なので、「在籍してはいるが今週の出演枠に
   * たまたま入っていなかった」だけで不発になっても、プレイヤーには気づきようがない。
   * 出演の有無に関わらず、在籍している敵全員を対象にするよう直した
   */
  it('敵が在籍しているが今週の出演枠（6人）に入っていなくても、撃破の対象になる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'osananajimi', 1),
      makeInstance(data, 'shishou', 1),
      makeInstance(data, 'mascot', 1),
      makeInstance(data, 'chichi', 1, { faction: 'enemy', debutFaction: 'enemy' }),
      makeInstance(data, 'dai_shouri', 1),
    ];
    // 出演6人を父以外で埋める。父は在籍しているが今週は出演していない
    const highlightIds = ['hero#1', 'heroine#1', 'aibou#1', 'osananajimi#1', 'shishou#1', 'mascot#1'];
    const state = makeState(cards, 24, { highlightIds });
    const b = computeScore({ data, cards: state.cards, week: 24, selection: { cards: ['dai_shouri#1'], targets: {} } });
    expect(b.stateChanges).toContainEqual({ type: 'moveZone', instanceId: 'chichi#1', to: 'waiting' });
  });

  it('控え・死亡済み・再登場待ちの敵は対象にならない（場にいる敵だけ）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { faction: 'enemy', zone: 'bench' }),
      makeInstance(data, 'shukuteki', 1, { faction: 'enemy', zone: 'dead' }),
      makeInstance(data, 'teki_kanbu_power', 1, { faction: 'enemy', zone: 'waiting' }),
      makeInstance(data, 'dai_shouri', 1),
    ];
    const b = score(cards, ['dai_shouri#1']);
    expect(b.stateChanges.some((c) => c.type === 'moveZone')).toBe(false);
  });
});
