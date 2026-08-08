import { describe, expect, it } from 'vitest';
import { createDemands, HINT_BOOST_WEEKS, HINT_FORCE_WEEKS, pendingDemandHints } from './demands';
import { createRun } from './run';
import { rollPack } from './shop';
import { loadTestData } from './testHelpers';
import type { DemandState } from './types';

const data = loadTestData();
const MAX_PLAYABLE = 24;

/** battle_6「第14話までに強敵を1人退場させる」だけを取り出す */
const battle6 = (demands: DemandState[]) => demands.find((d) => d.id === 'battle_6')!;

/**
 * 編集部の要求に対する「手立てカード」の供給（v7.16）。
 *
 * 要求は達成条件を示すだけで、それを叶えるカードが回ってくるかは運任せだった。
 * 「何をすればいいかは分かっているのにカードが来ない」で詰むのを防ぐ。
 */
describe('要求の手立てカードの供給', () => {
  it('期限が遠いうちは何も足さない', () => {
    const demands = createDemands();
    const far = battle6(demands).deadline - HINT_BOOST_WEEKS - 1;
    expect(pendingDemandHints(demands, far)).toEqual({ boost: [], force: [] });
  });

  it('期限が近づくとまず出やすくなり、目前になると提示枠を確保する', () => {
    const demands = createDemands();
    const deadline = battle6(demands).deadline;

    const early = pendingDemandHints(demands, deadline - HINT_BOOST_WEEKS);
    expect(early.boost).toContain('gekiha');
    expect(early.force).toEqual([]);

    const late = pendingDemandHints(demands, deadline - HINT_FORCE_WEEKS);
    expect(late.boost).toContain('gekiha');
    expect(late.force).toContain('gekiha');
  });

  it('達成済み・失敗済みの要求は手立てを出さない', () => {
    const deadline = battle6(createDemands()).deadline;
    const week = deadline - 1;

    const achieved = createDemands().map((d) => (d.id === 'battle_6' ? { ...d, achievedWeek: 9 } : d));
    expect(pendingDemandHints(achieved, week).force).toEqual([]);

    const failed = createDemands().map((d) => (d.id === 'battle_6' ? { ...d, failed: true } : d));
    expect(pendingDemandHints(failed, week).force).toEqual([]);
  });

  it('期限を過ぎたら出さない（もう間に合わない）', () => {
    const demands = createDemands();
    const deadline = battle6(demands).deadline;
    expect(pendingDemandHints(demands, deadline + 1)).toEqual({ boost: [], force: [] });
  });

  it('退場手段だけでなく、敵を用意する手段も挙げる（場に敵がいないと達成しようがないため）', () => {
    const demands = createDemands();
    const { boost } = pendingDemandHints(demands, battle6(demands).deadline - 1);
    expect(boost).toContain('yamiochi');
    expect(boost).toContain('akuyaku_kaigi');
  });

  it('期限目前の編集会議では、必ず手立てが1枚は並ぶ', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト連載' });
    const deadline = battle6(run.demands).deadline;
    const hints = pendingDemandHints(run.demands, deadline - 1).force;
    // 購入回数を変えて何度引いても、必ず1枚は含まれる
    for (let purchases = 0; purchases < 30; purchases++) {
      const pack = rollPack(data, { ...run, week: deadline - 1, shopPurchases: purchases }, MAX_PLAYABLE);
      expect(pack.some((id) => hints.includes(id))).toBe(true);
    }
  });

  it('緊張の解放が優先される（放置すると打ち切りに直結するため）', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト連載' });
    const deadline = battle6(run.demands).deadline;
    const RELIEF = ['dai_shouri', 'kyuushutsu', 'fukkatsu', 'kakusei'];
    let reliefPacks = 0;
    for (let purchases = 0; purchases < 30; purchases++) {
      const pack = rollPack(data, { ...run, week: deadline - 1, stress: 2, shopPurchases: purchases }, MAX_PLAYABLE);
      if (pack.some((id) => RELIEF.includes(id))) reliefPacks += 1;
    }
    expect(reliefPacks).toBe(30);
  });

  it('期限が遠い週の提示内容は今までと変わらない', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト連載' });
    const far = battle6(run.demands).deadline - HINT_BOOST_WEEKS - 1;
    const withDemands = rollPack(data, { ...run, week: far }, MAX_PLAYABLE);
    const withoutDemands = rollPack(data, { ...run, week: far, demands: [] }, MAX_PLAYABLE);
    expect(withDemands).toEqual(withoutDemands);
  });
});
