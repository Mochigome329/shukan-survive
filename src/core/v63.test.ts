/** v6.3: 悪役会議（敵になれる控えキャラを敵デビューさせ、既存の敵の人気を高める） */
import { describe, expect, it } from 'vitest';
import { previewScore, resolveWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

describe('悪役会議（v6.3）', () => {
  it('敵になれない控えキャラ（相棒）は対象にできない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1, { zone: 'bench' }), makeInstance(data, 'akuyaku_kaigi', 1)];
    const state = makeState(cards, 5);
    const ng = { cards: ['akuyaku_kaigi#1'], targets: { 'akuyaku_kaigi#1': 'aibou#1' } };
    expect(validateSelection(data, state, ng).ok).toBe(false);
  });

  it('flexFactionの控えキャラは対象にでき、選択なしで敵としてデビューする', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'bench' }),
      makeInstance(data, 'akuyaku_kaigi', 1),
    ];
    const state = makeState(cards, 5);
    const selection = { cards: ['akuyaku_kaigi#1'], targets: { 'akuyaku_kaigi#1': 'osananajimi#1' } };
    expect(validateSelection(data, state, selection).ok).toBe(true);

    const after = resolveWeek(data, state, selection).state;
    const osananajimi = after.cards.find((c) => c.instanceId === 'osananajimi#1')!;
    expect(osananajimi.zone).toBe('field');
    expect(osananajimi.faction).toBe('enemy');
  });

  it('既定陣営が敵の控えキャラ（非flexFaction）も対象にできる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shukuteki', 1, { zone: 'bench' }), makeInstance(data, 'akuyaku_kaigi', 1)];
    const state = makeState(cards, 5);
    const selection = { cards: ['akuyaku_kaigi#1'], targets: { 'akuyaku_kaigi#1': 'shukuteki#1' } };
    expect(validateSelection(data, state, selection).ok).toBe(true);
    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'shukuteki#1')!.faction).toBe('enemy');
  });

  it('場の敵キャラのうち最も人気度が低い者だけを恒久強化する（仲間・今週デビューした敵より人気の高い敵は対象外）', () => {
    const cards = [
      makeInstance(data, 'hero', 1), // ally 10
      makeInstance(data, 'aibou', 1), // ally 8（全体では最も低いが対象外のはず）
      makeInstance(data, 'rival', 1), // enemy 15（既存の敵の中で最も低い）
      makeInstance(data, 'teki_kanbu_brain', 1, { zone: 'bench' }), // enemy 16（デビューさせても15より高いので対象外のまま）
      makeInstance(data, 'akuyaku_kaigi', 1),
    ];
    const state = makeState(cards, 5);
    const selection = { cards: ['akuyaku_kaigi#1'], targets: { 'akuyaku_kaigi#1': 'teki_kanbu_brain#1' } };
    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'rival#1')!.permanentPopularityBonus).toBe(4);
    expect(after.cards.find((c) => c.instanceId === 'aibou#1')!.permanentPopularityBonus).toBe(0);
    expect(after.cards.find((c) => c.instanceId === 'teki_kanbu_brain#1')!.permanentPopularityBonus).toBe(0);
  });

  it('今週デビューした敵も、その週のうちから強化対象になりうる', () => {
    // 場に敵がいない状態で、デビューさせたキャラ自身が唯一の敵になる
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'osananajimi', 1, { zone: 'bench' }), makeInstance(data, 'akuyaku_kaigi', 1)];
    const state = makeState(cards, 5);
    const selection = { cards: ['akuyaku_kaigi#1'], targets: { 'akuyaku_kaigi#1': 'osananajimi#1' } };
    const b = previewScore(data, state, selection);
    const osananajimi = b.characters.find((c) => c.name === '幼なじみ');
    expect(osananajimi).toBeDefined();

    const after = resolveWeek(data, state, selection).state;
    expect(after.cards.find((c) => c.instanceId === 'osananajimi#1')!.permanentPopularityBonus).toBe(4);
  });

  it('UI経由(gameReducer)では陣営選択のプロンプトを出さずそのまま確定できる', async () => {
    const { gameReducer, initialGameState } = await import('../state/gameReducer');
    type GS = import('../state/gameReducer').GameState;
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench' }), // flexFactionだが敵になれない控えではない…実際は敵にもなれる
      makeInstance(data, 'akuyaku_kaigi', 1),
    ];
    const run = makeState(cards, 5);
    let state: GS = { ...initialGameState(data), screen: 'play', run };

    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'akuyaku_kaigi#1' });
    // 控え候補が1人だけなら自動割当され、対象待ちにならない
    expect(state.pendingTargetDev).toBeNull();
    expect(state.pendingFactionChoice).toBeNull();

    const confirmed = gameReducer(state, { type: 'confirmPlay' });
    expect(confirmed.screen).toBe('result');
    expect(confirmed.run!.cards.find((c) => c.instanceId === 'heroine#1')!.faction).toBe('enemy');
  });
});
