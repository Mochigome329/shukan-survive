import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadTestData } from '../core/testHelpers';
import { gameReducer, initialGameState, type GameState } from '../state/gameReducer';
import { WeekPlayScreen } from './WeekPlayScreen';

const data = loadTestData();
function firstIssue(): GameState {
  const setup = gameReducer(initialGameState(data), { type: 'openSetup', withTutorial: true });
  return gameReducer(setup, { type: 'startRun', seed: 1, mangaTitle: '原稿テスト', startingCast: ['heroine', 'aibou'], mode: 'short' });
}
const render = (state: GameState) => renderToStaticMarkup(createElement(WeekPlayScreen, { state, dispatch: () => {} }));

describe('漫画原稿の表示', () => {
  it('手札の後に入稿操作を置き、読み上げ・キーボード順も見た目と揃える', () => {
    const html = render(firstIssue());
    expect(html.indexOf('class="hand"')).toBeLessThan(html.indexOf('class="preview"'));
    expect(html).toContain('この原稿を入稿する');
  });
  it('原稿に選んだカードも補正後の話題性と鮮度を表示する', () => {
    let state = firstIssue();
    const battle = state.run!.cards.find(c => c.definitionId === 'battle')!;
    state = { ...state, run: { ...state.run!, freshnessByDef: { battle: .5 }, permanentBuzzByDef: { battle: 2 } } };
    state = gameReducer(state, { type: 'tapHandCard', instanceId: battle.instanceId });
    const def = data.definitions.get('battle')!;
    if (def.kind !== 'development') throw new Error('battle must be a development');
    const buzz = def.buzz * .5 + 2;
    const html = render(state);
    expect(html).toContain(`話題+${Number.isInteger(buzz) ? buzz : buzz.toFixed(1)} / 鮮度50%`);
    expect(html).toContain('バトルを原稿から戻す');
  });
  it('対象のあるコマを戻すと対象も解除し、再び手札で選べる', () => {
    let state = firstIssue();
    const training = state.run!.cards.find(c => c.definitionId === 'shugyou')!;
    const hero = state.run!.cards.find(c => c.definitionId === 'hero')!;
    state = gameReducer(state, { type: 'tapHandCard', instanceId: training.instanceId });
    state = gameReducer(state, { type: 'tapCastChar', instanceId: hero.instanceId });
    expect(render(state)).toContain('修行、対象 主人公を原稿から戻す');
    state = gameReducer(state, { type: 'tapFieldCard', instanceId: training.instanceId });
    expect(state.selection.targets[training.instanceId]).toBeUndefined();
    expect(state.selection.cards).not.toContain(training.instanceId);
    expect(render(state)).toContain('修行の効果を読む');
  });
});
