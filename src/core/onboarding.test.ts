import { describe, expect, it } from 'vitest';
import { createRun, startWeek, previewScore } from './run';
import { loadTestData } from './testHelpers';
import { prepareFirstIssue, firstIssueGuide } from './onboarding';
import { gameReducer, initialGameState } from '../state/gameReducer';

const data = loadTestData();
describe('第1話を描きながら覚える', () => {
  it('初回手札に必要な2枚を保証し、枚数・デッキ・シードを維持する', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const run = createRun(data, seed, { mangaTitle: 'テスト' });
      const prepared = prepareFirstIssue(run);
      const drawn = startWeek(data, prepared);
      expect(drawn.hand).toHaveLength(7);
      expect(new Set(drawn.hand).size).toBe(7);
      expect(drawn.cards.filter(c => drawn.hand.includes(c.instanceId)).map(c => c.definitionId)).toEqual(expect.arrayContaining(['battle', 'shugyou']));
      expect(prepared.cards).toEqual(run.cards);
      expect(prepared.runSeed).toBe(seed);
      expect(run.guaranteedNextHand).toEqual([]);
    }
  });
  it('第2話以降は手札を操作しない', () => {
    const run = { ...createRun(data, 7, { mangaTitle: 'テスト' }), week: 2 };
    expect(prepareFirstIssue(run)).toBe(run);
  });
  it('説明なしの開始は従来の抽選と同じ', () => {
    const state = { ...initialGameState(data), tutorialEnabled: false };
    const action = { type: 'startRun' as const, seed: 17, mangaTitle: 'テスト', startingCast: [] };
    const started = gameReducer(state, action);
    expect(started.run).toEqual(startWeek(data, createRun(data, 17, { mangaTitle: 'テスト', startingCast: [] })));
  });
  it('選択と対象指定に反応し、解除すれば案内も戻る', () => {
    const run = startWeek(data, prepareFirstIssue(createRun(data, 1, { mangaTitle: 'テスト' })));
    const id = (def: string) => run.cards.find(c => c.definitionId === def && (def === 'hero' || run.hand.includes(c.instanceId)))!.instanceId;
    const battle = id('battle'), training = id('shugyou'), hero = id('hero');
    expect(firstIssueGuide(run, { cards: [], targets: {} }, null).step).toBe(1);
    expect(firstIssueGuide(run, { cards: [battle], targets: {} }, null).step).toBe(2);
    expect(firstIssueGuide(run, { cards: [battle, training], targets: {} }, training).step).toBe(3);
    const selection = { cards: [battle, training], targets: { [training]: hero } };
    expect(firstIssueGuide(run, selection, null).step).toBe(4);
    expect(previewScore(data, run, selection).combos.some(c => c.comboId === 'oudou' && c.status === 'applied')).toBe(true);
    expect(firstIssueGuide(run, { cards: [training], targets: { [training]: hero } }, null).step).toBe(1);
  });
  it('確定後は第1話の案内が残らず、編集会議の説明は有効', () => {
    let state = gameReducer(initialGameState(data), { type: 'startRun', seed: 1, mangaTitle: 'テスト', startingCast: [] });
    state = gameReducer(state, { type: 'confirmPlay' });
    expect(state.tutorialStep).toBeNull();
    expect(state.tutorialEnabled).toBe(true);
  });
});
