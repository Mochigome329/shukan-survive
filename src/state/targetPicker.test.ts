import { describe, expect, it } from 'vitest';
import { loadTestData, makeInstance, makeState } from '../core/testHelpers';
import { gameReducer, initialGameState, pendingTargetCandidates, type GameState } from './gameReducer';

const data = loadTestData();
function setup(card: string): GameState {
  const cards = [
    makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1),
    makeInstance(data, 'mascot', 1, { zone: 'bench' }),
    makeInstance(data, 'aibou', 1, { zone: 'bench' }),
    makeInstance(data, 'shishou', 1, { zone: 'dead' }),
    makeInstance(data, 'heroine', 1, { zone: 'waiting' }),
    makeInstance(data, card, 1),
  ];
  return { ...initialGameState(data), screen: 'play', run: makeState(cards, 10) };
}
function select(card: string) { return gameReducer(setup(card), { type: 'tapHandCard', instanceId: `${card}#1` }); }

describe('immediate target choice', () => {
  it.each([
    ['shugyou', ['hero#1', 'rival#1']],
    ['nouryoku_kakusei', ['hero#1', 'rival#1']],
    ['fukkatsu', ['shishou#1']],
    ['shinchara', ['mascot#1', 'aibou#1']],
    ['ippou_sonokoro', ['heroine#1']],
    ['gekiha', ['rival#1']],
    ['akuyaku_kaigi', ['mascot#1']],
  ])('asks immediately for %s and offers only its target type', (card, ids) => {
    const state = select(card as string);
    expect(state.pendingTargetDev).toBe(`${card}#1`);
    expect(state.selection.targets[`${card}#1`]).toBeUndefined();
    expect(pendingTargetCandidates(state).map(c => c.instanceId)).toEqual(ids);
  });
  it('does not silently auto-select the only target, even for the protagonist', () => {
    const initial = setup('shugyou');
    initial.run = { ...initial.run!, cards: initial.run!.cards.filter(c => c.definitionId !== 'rival') };
    const state = gameReducer(initial, { type: 'tapHandCard', instanceId: 'shugyou#1' });
    expect(state.pendingTargetDev).toBe('shugyou#1');
    expect(pendingTargetCandidates(state).map(c => c.instanceId)).toEqual(['hero#1']);
  });
  it('keeps an empty choice cancellable without advancing the week or consuming cards', () => {
    const initial = setup('fukkatsu');
    initial.run = { ...initial.run!, cards: initial.run!.cards.filter(c => c.zone !== 'dead') };
    const pending = gameReducer(initial, { type: 'tapHandCard', instanceId: 'fukkatsu#1' });
    expect(pendingTargetCandidates(pending)).toEqual([]);
    const cancelled = gameReducer(pending, { type: 'tapFieldCard', instanceId: 'fukkatsu#1' });
    expect(cancelled.pendingTargetDev).toBeNull();
    expect(cancelled.selection.cards).toEqual([]);
    expect(cancelled.run).toBe(initial.run);
  });
  it('resolves the target first, then asks the debut faction, and can cancel both', () => {
    let state = select('shinchara');
    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'mascot#1' });
    expect(state.pendingTargetDev).toBeNull();
    expect(state.pendingFactionChoice).toBe('shinchara#1');
    state = gameReducer(state, { type: 'tapFieldCard', instanceId: 'shinchara#1' });
    expect(state.pendingFactionChoice).toBeNull();
    expect(state.selection.targets).toEqual({});
  });
  it('lets a character debuting this issue receive a following training card', () => {
    let state = setup('shinchara');
    const training = makeInstance(data, 'shugyou', 1);
    state.run = { ...state.run!, cards: [...state.run!.cards, training], hand: [...state.run!.hand, training.instanceId] };
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'shinchara#1' });
    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'aibou#1' });
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'shugyou#1' });
    expect(pendingTargetCandidates(state).map(c => c.instanceId)).toContain('aibou#1');
  });
  it('leaves non-target cards, redraw, and stocking without a target prompt', () => {
    expect(select('battle').pendingTargetDev).toBeNull();
    for (const mode of ['redrawMode', 'stockMode'] as const) {
      const state = gameReducer({ ...setup('shugyou'), [mode]: true }, { type: 'tapHandCard', instanceId: 'shugyou#1' });
      expect(state.pendingTargetDev).toBeNull();
    }
  });
});
