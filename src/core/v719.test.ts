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

describe('大勝利は場の最弱の敵を自動で撃破する（v7.20）', () => {
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
});
