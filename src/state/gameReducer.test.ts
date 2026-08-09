import { describe, expect, it } from 'vitest';
import { loadTestData, makeInstance } from '../core/testHelpers';
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

describe('陣営を選べるキャラのデビュー選択（v7.18）', () => {
  function playState(): GameState {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    run.cards = [
      makeInstance(data, 'hero', 1, { zone: 'field' }),
      makeInstance(data, 'heroine', 1, { zone: 'field' }),
      makeInstance(data, 'rival', 1, { zone: 'field' }),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'unmei_deai', 1, { zone: 'hand' }),
      makeInstance(data, 'shugyou', 1, { zone: 'hand' }),
    ];
    return { ...initialGameState(data), screen: 'play', run };
  }

  it('陣営を選んだ後に、対象選択が要る別カードを選んでも選び直しを求めない', () => {
    let state = playState();
    // 運命的な出会い: 対象はmascotで一意なので自動割当、陣営選択待ちになる
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'unmei_deai#1' });
    expect(state.pendingFactionChoice).toBe('unmei_deai#1');

    state = gameReducer(state, { type: 'chooseFaction', devId: 'unmei_deai#1', faction: 'ally' });
    expect(state.selection.factionChoices?.['unmei_deai#1']).toBe('ally');

    // 修行: 対象候補が複数（主人公・ヒロイン・ライバル）あるので対象選択待ちになる。
    // このとき既に選んだ陣営が消えてはいけない
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'shugyou#1' });
    expect(state.pendingTargetDev).toBe('shugyou#1');
    expect(state.selection.factionChoices?.['unmei_deai#1']).toBe('ally');

    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'hero#1' });
    expect(state.pendingFactionChoice).toBeNull();
    expect(state.selection.factionChoices?.['unmei_deai#1']).toBe('ally');
  });
});

describe('チュートリアルをスキップした場合、編集会議の説明も出さない（v7.18）', () => {
  it('タイトルで不要と答えると、以降ずっとtutorialEnabledがfalseのまま', () => {
    let state: GameState = { ...initialGameState(data), screen: 'setup' };
    state = gameReducer(state, { type: 'openSetup', withTutorial: false });
    state = gameReducer(state, { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: ['heroine', 'aibou'] });
    expect(state.tutorialStep).toBeNull();
    expect(state.tutorialEnabled).toBe(false);
  });

  it('スキップを選んでいれば、初回の編集会議でも説明を出さない', () => {
    let state: GameState = { ...initialGameState(data), screen: 'setup' };
    state = gameReducer(state, { type: 'openSetup', withTutorial: false });
    state = gameReducer(state, { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: ['heroine', 'aibou'] });
    const withResult: GameState = {
      ...state,
      screen: 'result',
      lastResult: { breakdown: { finalScore: 0 } as never, outcome: 'continue', achievedDemands: [], failedDemands: [] },
    };
    const afterShop = gameReducer(withResult, { type: 'proceedFromResult' });
    expect(afterShop.shopTutorialStep).toBeNull();
    expect(afterShop.shopTutorialShown).toBe(true);
  });

  it('必要と答えていれば、従来どおり編集会議の説明が出る', () => {
    let state: GameState = { ...initialGameState(data), screen: 'setup' };
    state = gameReducer(state, { type: 'openSetup', withTutorial: true });
    state = gameReducer(state, { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: ['heroine', 'aibou'] });
    expect(state.tutorialEnabled).toBe(true);
    const withResult: GameState = {
      ...state,
      screen: 'result',
      lastResult: { breakdown: { finalScore: 0 } as never, outcome: 'continue', achievedDemands: [], failedDemands: [] },
    };
    const afterShop = gameReducer(withResult, { type: 'proceedFromResult' });
    expect(afterShop.shopTutorialStep).toBe(0);
  });
});

describe('セーブから再開すると、チュートリアルの選択が忘れられる（v7.21）', () => {
  it('再開直後はtutorialEnabledがfalseになる（もう初回ではないため）', () => {
    const run = startWeek(data, createRun(data, 1, { mangaTitle: 'テスト' }));
    const resumed = gameReducer({ ...initialGameState(data), screen: 'title' }, { type: 'resumeRun', run, phase: 'play' });
    expect(resumed.tutorialEnabled).toBe(false);
    expect(resumed.tutorialStep).toBeNull();
  });

  it('「不要」を選んで始めたランでも、アプリを閉じて再開した後の編集会議に説明が出ない', () => {
    let state: GameState = { ...initialGameState(data), screen: 'setup' };
    state = gameReducer(state, { type: 'openSetup', withTutorial: false });
    state = gameReducer(state, { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: ['heroine', 'aibou'] });
    const run = state.run!;

    // アプリを閉じて再度開く＝セーブから再開
    const resumed = gameReducer({ ...initialGameState(data), screen: 'title' }, { type: 'resumeRun', run, phase: 'play' });
    const withResult: GameState = {
      ...resumed,
      screen: 'result',
      lastResult: { breakdown: { finalScore: 0 } as never, outcome: 'continue', achievedDemands: [], failedDemands: [] },
    };
    const afterShop = gameReducer(withResult, { type: 'proceedFromResult' });
    expect(afterShop.shopTutorialStep).toBeNull();
  });

  it('編集会議中に中断していた場合の再開でも、説明は出ない', () => {
    const run = startWeek(data, createRun(data, 1, { mangaTitle: 'テスト' }));
    const resumed = gameReducer({ ...initialGameState(data), screen: 'title' }, { type: 'resumeRun', run, phase: 'shop' });
    expect(resumed.screen).toBe('shop');
    expect(resumed.shopTutorialStep).toBeNull();
    expect(resumed.shopTutorialShown).toBe(true);
  });
});

/** 第`week`話の読者アンケート結果画面（continue）の状態を作る */
function atResultBefore(week: number, over: Partial<GameState> = {}): GameState {
  const run = { ...createRun(data, 1, { mangaTitle: 'テスト' }), week };
  return {
    ...initialGameState(data),
    screen: 'result',
    run,
    lastResult: { breakdown: { finalScore: 0 } as never, outcome: 'continue', achievedDemands: [], failedDemands: [] },
    ...over,
  };
}

describe('第24話後の編集会議は飛ばす（v7.28）', () => {
  /*
   * 最終回は展開カードを出さず、キャストもベース点（中央値）に置き換わるので、
   * 仕入れたキャラも展開も出番が無いまま連載が終わる。会議を開いても選べることが無いので飛ばす
   */
  it('次が最終回（第25話）なら、編集会議を経由せず直接プレイ画面へ入る', () => {
    const next = gameReducer(atResultBefore(25), { type: 'proceedFromResult' });
    expect(next.screen).toBe('play');
    expect(next.shopPack).toBeNull();
    expect(next.run!.week).toBe(25);
    // startWeekが呼ばれ、最終回なので手札は空になっている
    expect(next.run!.hand).toEqual([]);
  });

  it('次が最終回でなければ、今までどおり編集会議へ行く', () => {
    const next = gameReducer(atResultBefore(20), { type: 'proceedFromResult' });
    expect(next.screen).toBe('shop');
    expect(next.shopPack).not.toBeNull();
  });

  it('最終回直行でも、通常の編集会議通過（leaveShop）と同じフィールドが揃う', () => {
    const viaFinaleSkip = gameReducer(atResultBefore(25), { type: 'proceedFromResult' });
    const viaShop = gameReducer(atShopBefore(25), { type: 'leaveShop' });
    expect(viaFinaleSkip.showFinaleTutorial).toBe(viaShop.showFinaleTutorial);
    expect(viaFinaleSkip.showFinaleTutorial).toBe(true);
  });
});

/** 控えキャラを1枚持った状態でplay画面に入っているGameStateを作る */
function atPlayWithBenchChar(): GameState {
  const run = { ...createRun(data, 1, { mangaTitle: 'テスト' }), cards: [makeInstance(data, 'heroine', 1, { zone: 'bench' })] };
  return { ...initialGameState(data), screen: 'play', run };
}

describe('ニックネーム（v7.29）', () => {
  it('setNicknameで対象のCardInstanceが更新される', () => {
    const next = gameReducer(atPlayWithBenchChar(), { type: 'setNickname', instanceId: 'heroine#1', nickname: 'ゆき' });
    expect(next.run!.cards.find((c) => c.instanceId === 'heroine#1')!.nickname).toBe('ゆき');
  });

  it('nullで既定名に戻す（undefinedになる）', () => {
    const named = gameReducer(atPlayWithBenchChar(), { type: 'setNickname', instanceId: 'heroine#1', nickname: 'ゆき' });
    const cleared = gameReducer(named, { type: 'setNickname', instanceId: 'heroine#1', nickname: null });
    expect(cleared.run!.cards.find((c) => c.instanceId === 'heroine#1')!.nickname).toBeUndefined();
  });

  it('不正なinstanceIdならnoticeが立ち、状態は変わらない', () => {
    const before = atPlayWithBenchChar();
    const next = gameReducer(before, { type: 'setNickname', instanceId: 'nope#1', nickname: 'ゆき' });
    expect(next.notice).toBeTruthy();
    expect(next.run).toBe(before.run);
  });
});
