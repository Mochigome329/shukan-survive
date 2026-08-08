/** v6.9: 読者の声が全役をカバーしているか、その週の役を踏まえた内容になっているか */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMBO_REGISTRY } from './combos';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { pickVoices, VOICED_COMBO_IDS } from '../ui/voices';

const data = loadTestData();

/** voices.ts のソースから、日本語を含む文字列リテラル（＝声の文言）を抜き出す */
function readVoiceStrings(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../ui/voices.ts', import.meta.url)), 'utf8');
  return [...src.matchAll(/'([^']*)'/g)].map((m) => m[1]!).filter((s) => /[ぁ-んァ-ヶ一-龠]/.test(s));
}

describe('読者の声（v6.9）', () => {
  it('すべての役に専用の声が用意されている', () => {
    const missing = COMBO_REGISTRY.filter((c) => !VOICED_COMBO_IDS.includes(c.id)).map((c) => `${c.id}(${c.name})`);
    expect(missing).toEqual([]);
  });

  it('声のIDに、存在しない役が混ざっていない', () => {
    const known = new Set(COMBO_REGISTRY.map((c) => c.id));
    expect(VOICED_COMBO_IDS.filter((id) => !known.has(id))).toEqual([]);
  });

  it('声はすべて日本語（英字・キリル文字の混入がない）', () => {
    // 文言を書き起こす際に別言語の断片が紛れ込んだことがあるため、機械的に弾く
    const bad = readVoiceStrings().filter((v) => /[A-Za-zЀ-ӿ]/.test(v));
    expect(bad).toEqual([]);
  });

  it('その週に成立した役に対応する声が選ばれる', () => {
    // 「王道」（主人公＋バトル＋主人公対象の修行）が成立する週
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'shugyou', 1)];
    const state = makeState(cards, 1);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['battle#1', 'shugyou#1'], targets: { 'shugyou#1': 'hero#1' } },
    });
    expect(b.combos.some((c) => c.comboId === 'oudou' && c.status === 'applied')).toBe(true);
    const voices = pickVoices(b, 1, 1);
    expect(voices.some((v) => v === '修行からのバトル、これだよこれ' || v === '王道は裏切らない')).toBe(true);
  });

  it('同じ週・同じシードなら常に同じ声が出る（決定的）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, 3);
    const b = computeScore({ data, cards: state.cards, week: 3, selection: { cards: ['nichijou#1'], targets: {} } });
    expect(pickVoices(b, 99, 3)).toEqual(pickVoices(b, 99, 3));
  });

  it('声は重複せず、最大3件までしか返さない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'shugyou', 1)];
    const state = makeState(cards, 1);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 1,
      selection: { cards: ['battle#1', 'shugyou#1'], targets: { 'shugyou#1': 'hero#1' } },
    });
    const voices = pickVoices(b, 7, 1);
    expect(voices.length).toBeLessThanOrEqual(3);
    expect(new Set(voices).size).toBe(voices.length);
  });
});
