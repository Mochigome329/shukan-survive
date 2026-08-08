/** v6.2: ハイライトの自動化とチュートリアル、デビュー時の陣営選択、撃破、主人公の闇堕ち例外 */
import { describe, expect, it } from 'vitest';
import { castOf, previewScore, resolveWeek, rosterOf, startWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

describe('ハイライトの自動化（v6.2）', () => {
  it('在籍6人以下のうちは、途中でデビューしたキャラも次週から自動でハイライトされる', () => {
    // 主人公+2人でスタートし、新キャラ登場でマスコットをデビューさせる（在籍4人、上限内）
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 5);
    const after = resolveWeek(data, state, {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'mascot#1' },
    }).state;
    // 週末時点で在籍4人。highlightIdsを介さず翌週startWeekした時点で自動的に4人とも含まれる
    const next = startWeek(data, { ...after, week: 6 });
    expect(rosterOf(data, next)).toHaveLength(4);
    expect(castOf(data, next).map((c) => c.instanceId).sort()).toEqual(
      rosterOf(data, next).map((c) => c.instanceId).sort(),
    );
  });
});

describe('出演者選択のチュートリアル（v6.2）', () => {
  it('在籍が7人目になった翌週の編集会議明けに一度だけ説明を出す', async () => {
    const { gameReducer, initialGameState } = await import('../state/gameReducer');
    type GS = import('../state/gameReducer').GameState;
    const sevenCast = [
      'hero',
      'heroine',
      'rival',
      'aibou',
      'osananajimi',
      'shishou',
      'mascot', // 7人目
    ].map((id) => makeInstance(data, id, 1, { zone: 'field' }));
    const run = makeState(sevenCast, 5, { funds: 0 });
    let state: GS = { ...initialGameState(data), screen: 'shop', run };

    state = gameReducer(state, { type: 'leaveShop' });
    expect(state.showHighlightTutorial).toBe(true);
    expect(state.highlightTutorialShown).toBe(true);

    // 一度閉じたら、次の編集会議明けでは出ない
    state = gameReducer(state, { type: 'dismissHighlightTutorial' });
    state = { ...state, screen: 'shop' };
    state = gameReducer(state, { type: 'leaveShop' });
    expect(state.showHighlightTutorial).toBe(false);
  });

  it('在籍6人以下のままなら説明は出ない', async () => {
    const { gameReducer, initialGameState } = await import('../state/gameReducer');
    type GS = import('../state/gameReducer').GameState;
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1)];
    const run = makeState(cards, 5, { funds: 0 });
    let state: GS = { ...initialGameState(data), screen: 'shop', run };
    state = gameReducer(state, { type: 'leaveShop' });
    expect(state.showHighlightTutorial).toBe(false);
  });
});

describe('デビュー時の陣営選択（v6.2）', () => {
  it('ヒロインを敵として登場させると、対象キャラの陣営が敵になる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 3);
    const selection = {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'heroine#1' },
      factionChoices: { 'shinchara#1': 'enemy' as const },
    };
    // 選んだ陣営はその週の採点にも反映される
    const b = previewScore(data, state, selection);
    const heroine = b.characters.find((c) => c.name === 'ヒロイン');
    expect(heroine).toBeDefined();

    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'heroine#1')!.faction).toBe('enemy');
  });

  it('陣営を選ばなければ、これまでどおり定義の既定陣営でデビューする', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 3);
    const after = resolveWeek(data, state, {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'heroine#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'heroine#1')!.faction).toBe('ally');
  });

  it('flexFaction ではないキャラ（相棒）は選択の余地なく既定の陣営のまま', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 3);
    const selection = {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'aibou#1' },
      factionChoices: { 'shinchara#1': 'enemy' as const }, // 効果を持たないはず
    };
    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.faction).toBe('ally');
  });

  it('復活・再登場では陣営を選び直さない（デビュー時だけの選択）', () => {
    // ライバルを一度仲間としてデビューさせたという想定（debutFactionもally）。死亡→復活してもデビュー時の陣営のまま
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'dead', faction: 'ally', debutFaction: 'ally' }),
      makeInstance(data, 'fukkatsu', 1),
    ];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['fukkatsu#1'],
      targets: { 'fukkatsu#1': 'rival#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'rival#1')!.faction).toBe('ally');
  });

  it('UI経由(gameReducer)でも、対象を選ぶと陣営選択待ちになり、選ぶと確定できる', async () => {
    const { gameReducer, initialGameState } = await import('../state/gameReducer');
    type GS = import('../state/gameReducer').GameState;
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench' }),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }), // 控えが2人＝対象タップが必要
      makeInstance(data, 'shinchara', 1),
    ];
    const run = makeState(cards, 3);
    let state: GS = { ...initialGameState(data), screen: 'play', run };

    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'shinchara#1' });
    expect(state.pendingTargetDev).toBe('shinchara#1'); // 控え2人なのでタップ待ち

    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'heroine#1' });
    expect(state.pendingTargetDev).toBeNull();
    expect(state.pendingFactionChoice).toBe('shinchara#1'); // ヒロインはflexFaction

    // 陣営を選ぶまでは確定できない
    const blocked = gameReducer(state, { type: 'confirmPlay' });
    expect(blocked.screen).toBe('play');
    expect(blocked.notice).toContain('陣営');

    state = gameReducer(state, { type: 'chooseFaction', devId: 'shinchara#1', faction: 'enemy' });
    expect(state.pendingFactionChoice).toBeNull();
    expect(state.selection.factionChoices).toEqual({ 'shinchara#1': 'enemy' });

    const confirmed = gameReducer(state, { type: 'confirmPlay' });
    expect(confirmed.screen).toBe('result');
    expect(confirmed.run!.cards.find((c) => c.instanceId === 'heroine#1')!.faction).toBe('enemy');
  });
});

describe('撃破（敵専用の途中離脱、v6.2）', () => {
  it('場の敵キャラだけを対象にでき、週末に再登場待ちへ移す', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'gekiha', 1),
    ];
    const state = makeState(cards, 10);
    const ok = { cards: ['gekiha#1'], targets: { 'gekiha#1': 'rival#1' } };
    expect(validateSelection(data, state, ok).ok).toBe(true);

    const after = resolveWeek(data, state, ok).state;
    expect(after.cards.find((c) => c.instanceId === 'rival#1')!.zone).toBe('waiting');
  });

  it('仲間キャラは対象にできない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'gekiha', 1)];
    const state = makeState(cards, 10);
    const ng = { cards: ['gekiha#1'], targets: { 'gekiha#1': 'aibou#1' } };
    expect(validateSelection(data, state, ng).ok).toBe(false);
  });
});

describe('主人公の闇堕ち例外（v6.2、v6.2bで洗脳・裏切りは対象外に整理）', () => {
  it('闇堕ちだけは主人公が対象でも陣営が変わらない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'yamiochi', 1)];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['yamiochi#1'],
      targets: { 'yamiochi#1': 'hero#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.faction).toBe('ally');
  });

  it('洗脳は一時的な対立に近いので、主人公が対象なら従来どおり敵陣営になる（v6.2b）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'sennou', 1)];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['sennou#1'],
      targets: { 'sennou#1': 'hero#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.faction).toBe('enemy');
  });

  it('裏切りも同様に、主人公が対象なら従来どおり敵陣営になる（v6.2b）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'uragiri', 1)];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['uragiri#1'],
      targets: { 'uragiri#1': 'hero#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.faction).toBe('enemy');
  });

  it('闇堕ちを他の仲間にかけると、これまでどおり敵陣営になる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'yamiochi', 1)];
    const state = makeState(cards, 10);
    const after = resolveWeek(data, state, {
      cards: ['yamiochi#1'],
      targets: { 'yamiochi#1': 'aibou#1' },
    }).state;
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.faction).toBe('enemy');
  });
});
