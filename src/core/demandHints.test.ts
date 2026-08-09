import { describe, expect, it } from 'vitest';
import { createDemands, DEMANDS_LONG, pendingDemandHints } from './demands';
import { createRun } from './run';
import { rollPack } from './shop';
import { loadTestData } from './testHelpers';
import type { DemandState } from './types';

const data = loadTestData();
const MAX_PLAYABLE = 24;

// 通常連載のヒント窓（v7.30でキャンペーン別になったので、テストは通常連載の値を使う）
const { hintBoostWeeks: HINT_BOOST_WEEKS, hintForceWeeks: HINT_FORCE_WEEKS } = data.campaigns.long.balance;
const makeDemands = () => createDemands(DEMANDS_LONG);
const hintsAt = (demands: DemandState[], week: number) =>
  pendingDemandHints(DEMANDS_LONG, demands, week, HINT_BOOST_WEEKS, HINT_FORCE_WEEKS);

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
    const demands = makeDemands();
    const far = battle6(demands).deadline - HINT_BOOST_WEEKS - 1;
    expect(hintsAt(demands, far)).toEqual({ boost: [], force: [] });
  });

  it('期限が近づくとまず出やすくなり、目前になると提示枠を確保する', () => {
    const demands = makeDemands();
    const deadline = battle6(demands).deadline;

    const early = hintsAt(demands, deadline - HINT_BOOST_WEEKS);
    expect(early.boost).toContain('gekiha');
    expect(early.force).toEqual([]);

    const late = hintsAt(demands, deadline - HINT_FORCE_WEEKS);
    expect(late.boost).toContain('gekiha');
    expect(late.force).toContain('gekiha');
  });

  it('達成済み・失敗済みの要求は手立てを出さない', () => {
    const deadline = battle6(makeDemands()).deadline;
    const week = deadline - 1;

    const achieved = makeDemands().map((d) => (d.id === 'battle_6' ? { ...d, achievedWeek: 9 } : d));
    expect(hintsAt(achieved, week).force).toEqual([]);

    const failed = makeDemands().map((d) => (d.id === 'battle_6' ? { ...d, failed: true } : d));
    expect(hintsAt(failed, week).force).toEqual([]);
  });

  it('期限を過ぎたら出さない（もう間に合わない）', () => {
    const demands = makeDemands();
    const deadline = battle6(demands).deadline;
    expect(hintsAt(demands, deadline + 1)).toEqual({ boost: [], force: [] });
  });

  it('退場手段だけでなく、敵を用意する手段も挙げる（場に敵がいないと達成しようがないため）', () => {
    const demands = makeDemands();
    const { boost } = hintsAt(demands, battle6(demands).deadline - 1);
    expect(boost).toContain('yamiochi');
    expect(boost).toContain('akuyaku_kaigi');
  });

  it('期限目前の編集会議では、必ず手立てが1枚は並ぶ', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト連載' });
    const deadline = battle6(run.demands).deadline;
    const hints = hintsAt(run.demands, deadline - 1).force;
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
