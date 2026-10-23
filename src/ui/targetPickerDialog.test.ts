import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadTestData, makeInstance, makeState } from '../core/testHelpers';
import { initialGameState, type GameState } from '../state/gameReducer';
import { TargetPickerDialog } from './TargetPickerDialog';

const data = loadTestData();
const hero = makeInstance(data, 'hero', 1);
const ally = makeInstance(data, 'aibou', 1, { faction: 'enemy', permanentPopularityBonus: 3 });
const training = makeInstance(data, 'shugyou', 1);
const base: GameState = {
  ...initialGameState(data), screen: 'play', run: makeState([hero, ally, training]),
  selection: { cards: [training.instanceId], targets: {} }, pendingTargetDev: training.instanceId,
};
const render = (state: GameState) => renderToStaticMarkup(createElement(TargetPickerDialog, { state, dispatch: () => {} }));

describe('TargetPickerDialog', () => {
  it('shows the selected development effect and each eligible character with their current faction', () => {
    const markup = render(base);
    expect(markup).toContain('<dialog');
    expect(markup).toContain('「修行」の対象を選ぶ');
    expect(markup).toContain('1個につき人気度+3');
    expect(markup).toContain('主人公');
    expect(markup).toContain('相棒');
    expect(markup).toContain('敵');
    expect(markup).toContain('カードを手札に戻す');
  });
  it('shows a clear way back when no target exists', () => {
    const revive = makeInstance(data, 'fukkatsu', 1);
    const markup = render({ ...base, run: makeState([hero, revive]),
      selection: { cards: [revive.instanceId], targets: {} }, pendingTargetDev: revive.instanceId });
    expect(markup).toContain('対象にできるキャラがいません');
    expect(markup).toContain('カードを手札に戻す');
    expect(markup).not.toContain('target-picker-candidate');
  });
  it('uses the same dialog to choose the selected debut character faction', () => {
    const debut = makeInstance(data, 'shinchara', 1);
    const heroine = makeInstance(data, 'heroine', 1, { zone: 'bench' });
    const markup = render({ ...base, run: makeState([hero, heroine, debut]),
      selection: { cards: [debut.instanceId], targets: { [debut.instanceId]: heroine.instanceId } },
      pendingTargetDev: null, pendingFactionChoice: debut.instanceId });
    expect(markup).toContain('ヒロイン');
    expect(markup).toContain('仲間として登場');
    expect(markup).toContain('敵として登場');
    expect(markup).not.toContain('target-picker-candidate');
  });
  it('renders nothing when no choice is pending', () => {
    expect(render({ ...base, pendingTargetDev: null, pendingFactionChoice: null })).toBe('');
  });
});
