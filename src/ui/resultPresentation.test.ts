import { describe, expect, it } from 'vitest';
import type { ComboScoreDetail } from '../core/types';
import { getPayoffNote, selectFeaturedCombos } from './resultPresentation';
import { loadTestData, makeInstance, makeState } from '../core/testHelpers';
import { previewScore } from '../core/run';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultComboBanner } from './ResultScreen';
import { ComboCutIn } from './ComboCutIn';

function combo(comboId: string, overrides: Partial<ComboScoreDetail> = {}): ComboScoreDetail {
  return {
    comboId, name: comboId, status: 'applied', freshness: 1,
    popularityAdd: 0, buzzAdd: 2, scoreMultiplier: 1, charMultiplier: 1,
    cutInTemplate: 'normal', boundCharIds: [], ...overrides,
  };
}

describe('selectFeaturedCombos', () => {
  it('groups known ordinary combos while featuring first discoveries in their original order', () => {
    const ordinary = combo('ordinary');
    const first = combo('first');
    const second = combo('second', { cutInTemplate: 'shock' });
    expect(selectFeaturedCombos([ordinary, first, second], new Set(['first', 'second'])))
      .toEqual([first, second]);
  });

  it('features known setup combos even when their presentation is emotional', () => {
    const setup = combo('shitei_no_wakare', { cutInTemplate: 'emotion' });
    expect(selectFeaturedCombos([setup], new Set())).toEqual([setup]);
  });

  it('features known payoff combos without requiring a setup flag', () => {
    const payoff = combo('payoff', { cutInTemplate: 'setupPayoff' });
    expect(selectFeaturedCombos([payoff], new Set())).toEqual([payoff]);
  });

  it('keeps suppressed and unapplied discoveries out of effect cutins', () => {
    const suppressed = combo('suppressed', { status: 'suppressed' });
    const unapplied = combo('unapplied', { status: 'notApplied', cutInTemplate: 'setupPayoff' });
    expect(selectFeaturedCombos([suppressed, unapplied], new Set(['suppressed', 'unapplied'])))
      .toEqual([]);
  });

  it('handles no combos and never edits score details', () => {
    expect(selectFeaturedCombos([], new Set())).toEqual([]);
    const detail = Object.freeze(combo('first', { buzzAdd: 25 }));
    const input = Object.freeze([detail]);
    expect(selectFeaturedCombos(input, new Set(['first']))[0]).toBe(detail);
    expect(detail.buzzAdd).toBe(25);
  });
});

it('keeps permanent effect explanations visible for known combos without a cutin', () => {
  const known = combo('densetsu_buki_get', { extraText: '対象の人気度が恒久+3' });
  expect(selectFeaturedCombos([known], new Set())).toEqual([]);
  const markup = renderToStaticMarkup(createElement(ResultComboBanner, { combo: known, isNew: false }));
  expect(markup).toContain('対象の人気度が恒久+3');
  expect(markup).toContain('話題性 +2');
});

it('only exposes the replay action when the result supplies a replay handler', () => {
  const known = combo('ordinary');
  const unavailable = renderToStaticMarkup(createElement(ResultComboBanner, { combo: known, isNew: false }));
  const available = renderToStaticMarkup(createElement(ResultComboBanner, { combo: known, isNew: false, onReplay: () => {} }));
  expect(unavailable).not.toContain('見開きを見る');
  expect(available).toContain('見開きを見る');
  expect(available).toContain('aria-haspopup="dialog"');
});

it('renders a persistent replay as a dialog with a return action and all effect explanations', () => {
  const detail = combo('payoff', { cutInTemplate: 'setupPayoff', extraText: '対象の人気度が恒久+3' });
  const markup = renderToStaticMarkup(createElement(ComboCutIn, {
    combo: detail, effectText: '人気度 +8', freshnessNote: '見飽きられ ×0.8',
    payoffNote: '第2話から仕込んだ伏線3本が、ここでつながった。', isNew: true,
    isReplay: true, skipLabel: '結果に戻る', onSkip: () => {},
  }));
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toContain('結果に戻る');
  expect(markup).not.toContain('演出を飛ばす');
  expect(markup).toContain('対象の人気度が恒久+3');
  expect(markup).toContain('人気度 +8');
  expect(markup).toContain('見飽きられ ×0.8');
  expect(markup).toContain('第2話から仕込んだ伏線3本');
  expect(markup).toContain('役図鑑に登録');
});

it('keeps the automatic cutin as a transient presentation with its original skip action', () => {
  const markup = renderToStaticMarkup(createElement(ComboCutIn, {
    combo: combo('ordinary'), effectText: '話題性 +2', freshnessNote: null,
    isNew: false, onSkip: () => {},
  }));
  expect(markup).toContain('演出を飛ばす');
  expect(markup).not.toContain('role="dialog"');
  expect(markup).not.toContain('結果に戻る');
});

describe('getPayoffNote', () => {
  const data = loadTestData();
  const run = makeState([makeInstance(data, 'hero', 1)], 6,
    { foreshadowTokens: 3, foreshadowWeeks: [4, 2, 3] });
  const breakdown = previewScore(data, run, { cards: [], targets: {} });
  const consumed = { ...breakdown, stateChanges: [{ type: 'consumeForeshadowTokens' as const }] };

  it('links actual consumption to the earliest setup and pre-resolution token count', () => {
    expect(getPayoffNote(run, consumed)).toBe('第2話から仕込んだ伏線3本が、ここでつながった。');
  });
  it('does not claim recovery for unconsumed setup or for newly planted tokens alone', () => {
    expect(getPayoffNote(run, breakdown)).toBeNull();
    expect(getPayoffNote({ ...run, foreshadowTokens: 0, foreshadowWeeks: [] }, consumed)).toBeNull();
  });
  it('avoids inventing a setup week when historical dates are absent', () => {
    expect(getPayoffNote({ ...run, foreshadowWeeks: [] }, consumed))
      .toBe('仕込んだ伏線3本が、ここでつながった。');
  });
  it('describes substantial actual stress release, but not stored stress or a single point', () => {
    expect(getPayoffNote(run, { ...breakdown, stressReleased: 4 })).toBe('溜めた緊張4を、一気に解放。');
    expect(getPayoffNote({ ...run, stress: 4 }, breakdown)).toBeNull();
    expect(getPayoffNote(run, { ...breakdown, stressReleased: 1 })).toBeNull();
  });
  it('prioritizes setup recovery when both payoffs happen', () => {
    expect(getPayoffNote(run, { ...consumed, stressReleased: 4 }))
      .toBe('第2話から仕込んだ伏線3本が、ここでつながった。');
  });
});
