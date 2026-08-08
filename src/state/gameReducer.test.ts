import { describe, expect, it } from 'vitest';
import { loadTestData } from '../core/testHelpers';
import { createRun, startWeek } from '../core/run';
import { BOSS_BRIEFING_LEAD, gameReducer, initialGameState, type GameAction, type GameState } from './gameReducer';

const data = loadTestData();

/** 編集会議から第`week`話へ入る直前の状態を作る */
function atShopBefore(week: number, over: Partial<GameState> = {}): GameState {
  const run = { ...createRun(data, 1, { mangaTitle: 'テスト' }), week };
  return { ...initialGameState(data), screen: 'shop', run, ...over };
}

const bossWeeks = [...data.quotas.values()].filter((q) => q.boss).map((q) => q.week);

describe('ボス週の事前ブリーフィング（v7.5）', () => {
  it('ボス週が定義されている話数を把握している（前提の確認）', () => {
    expect(bossWeeks.length).toBeGreaterThanOrEqual(3);
  });

  it('各ボス週のちょうど5話前に、そのボス週のブリーフィングが出る', () => {
    for (const boss of bossWeeks) {
      const enterWeek = boss - BOSS_BRIEFING_LEAD;
      if (enterWeek < 1) continue;
      const next = gameReducer(atShopBefore(enterWeek), { type: 'leaveShop' });
      expect(next.bossBriefingWeek, `第${enterWeek}話開始時に第${boss}話のブリーフィング`).toBe(boss);
    }
  });

  it('5話より前（まだ遠い）のうちは出ない', () => {
    const boss = Math.min(...bossWeeks);
    const enterWeek = boss - BOSS_BRIEFING_LEAD - 1;
    if (enterWeek >= 1) {
      const next = gameReducer(atShopBefore(enterWeek), { type: 'leaveShop' });
      expect(next.bossBriefingWeek).toBeNull();
    }
  });

  it('同じボス週のブリーフィングは二度出ない', () => {
    const boss = Math.min(...bossWeeks);
    const enterWeek = boss - BOSS_BRIEFING_LEAD;
    const first = gameReducer(atShopBefore(enterWeek), { type: 'leaveShop' });
    expect(first.bossBriefingWeek).toBe(boss);
    expect(first.briefedBossWeeks).toContain(boss);

    // 説明済みの状態で次の週へ進んでも、同じボス週では出さない
    const second = gameReducer(
      atShopBefore(enterWeek + 1, { briefedBossWeeks: first.briefedBossWeeks }),
      { type: 'leaveShop' },
    );
    expect(second.bossBriefingWeek).toBeNull();
  });

  it('閉じるとブリーフィングは消える', () => {
    const boss = Math.min(...bossWeeks);
    const shown = gameReducer(atShopBefore(boss - BOSS_BRIEFING_LEAD), { type: 'leaveShop' });
    expect(gameReducer(shown, { type: 'dismissBossBriefing' }).bossBriefingWeek).toBeNull();
  });
});

describe('初回チュートリアルの要否（v7.5）', () => {
  const startAction: GameAction = { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: [] };

  it('タイトルで「表示する」を選ぶとステップ0から始まる', () => {
    const setup = gameReducer(initialGameState(data), { type: 'openSetup', withTutorial: true });
    expect(gameReducer(setup, startAction).tutorialStep).toBe(0);
  });

  it('「いらない」を選ぶとチュートリアルは出ない', () => {
    const setup = gameReducer(initialGameState(data), { type: 'openSetup', withTutorial: false });
    expect(gameReducer(setup, startAction).tutorialStep).toBeNull();
  });

  it('最後のステップまで進めると自動的に閉じる', () => {
    const setup = gameReducer(initialGameState(data), { type: 'openSetup', withTutorial: true });
    let s = gameReducer(setup, startAction);
    const seen: number[] = [];
    for (let i = 0; i < 20 && s.tutorialStep !== null; i++) {
      seen.push(s.tutorialStep);
      s = gameReducer(s, { type: 'advanceTutorial' });
    }
    expect(s.tutorialStep).toBeNull();
    expect(seen[0]).toBe(0);
    expect(seen.length).toBeGreaterThan(1);
  });
});

describe('連載中の役図鑑オーバーレイ（v7.5）', () => {
  it('開閉してもランは保持される', () => {
    const setup = gameReducer(initialGameState(data), { type: 'openSetup', withTutorial: false });
    const playing = gameReducer(setup, { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: [] });
    const opened = gameReducer(playing, { type: 'toggleCodexOverlay' });
    expect(opened.codexOpen).toBe(true);
    expect(opened.run).not.toBeNull();
    expect(opened.screen).toBe('play');

    const closed = gameReducer(opened, { type: 'toggleCodexOverlay' });
    expect(closed.codexOpen).toBe(false);
    expect(closed.run).not.toBeNull();
  });
});

describe('初回の編集会議で説明を出す（v7.5）', () => {
  it('1回目だけ出て、2回目からは出ない', () => {
    const run = startWeek(data, createRun(data, 1, { mangaTitle: 'テスト' }));
    const base: GameState = {
      ...initialGameState(data),
      screen: 'result',
      run,
      lastResult: { breakdown: { finalScore: 0 } as never, outcome: 'continue', achievedDemands: [], failedDemands: [] },
    };
    const first = gameReducer(base, { type: 'proceedFromResult' });
    expect(first.shopTutorialStep).toBe(0);
    expect(first.shopTutorialShown).toBe(true);

    const second = gameReducer({ ...base, shopTutorialShown: true }, { type: 'proceedFromResult' });
    expect(second.shopTutorialStep).toBeNull();
  });
});
