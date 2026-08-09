/**
 * v7.31: 実機プレイで出た3件の指摘への対応。
 *
 * 1. 最終回のチュートリアルが v7.27 までの内容（展開カード5枚）のままだった → UI文言なのでテストは持たない
 * 2. 最終回なのに「打ち切られないか心配」という読者の声が出る／編集部の要求が期限切れになる
 * 3. 場にライバルや相棒を置くと、あとは毎週バトルを選ぶだけで同じ役が成立し続ける
 */
import { describe, expect, it } from 'vitest';
import { previewScore, resolveWeek } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { COMBO_FRESHNESS_DECAY, COMBO_FRESHNESS_MIN, type WeekLogEntry } from './types';
import { pickVoices } from '../ui/voices';

const data = loadTestData();
const FINALE = 25;

const week = (w: number, popularity: number, buzz: number): WeekLogEntry => ({
  week: w,
  playedInstanceIds: [],
  playedDefinitionIds: [],
  comboIds: [],
  score: popularity * buzz,
  quota: 100,
  cleared: true,
  warningsAfter: 0,
  popularity,
  buzz,
});

/** 主人公＋ライバルが場にいて、手札に「バトル」が1枚ある状態（役「ライバル対決」が成立する形） */
function rivalDuelState(overrides: Parameters<typeof makeState>[2] = {}, w = 3) {
  const cards = [
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'rival', 1),
    makeInstance(data, 'battle', 1, { zone: 'hand' }),
  ];
  return makeState(cards, w, { highlightIds: ['hero#1', 'rival#1'], ...overrides });
}

const RIVAL_DUEL_SELECTION = { cards: ['battle#1'], targets: {} };

/** その週に成立した役の明細を引く */
const appliedCombo = (b: ReturnType<typeof previewScore>, comboId: string) =>
  b.combos.find((c) => c.comboId === comboId && c.status === 'applied');

describe('役の鮮度: 同じ役を繰り返すと加算が目減りする（v7.31）', () => {
  it('初成立は満額（ライバル対決は人気度+15）', () => {
    const b = previewScore(data, rivalDuelState(), RIVAL_DUEL_SELECTION);
    const combo = appliedCombo(b, 'rival_taiketsu');
    expect(combo).toBeDefined();
    expect(combo!.freshness).toBe(1);
    expect(combo!.popularityAdd).toBe(15);
  });

  it('鮮度が下がっているぶんだけ人気度加算が減る', () => {
    const b = previewScore(data, rivalDuelState({ comboFreshness: { rival_taiketsu: 0.8 } }), RIVAL_DUEL_SELECTION);
    // 15 × 0.8 = 12
    expect(appliedCombo(b, 'rival_taiketsu')!.popularityAdd).toBe(12);
  });

  it('下限を下回る値が入っていても COMBO_FRESHNESS_MIN で頭打ちになる', () => {
    const b = previewScore(data, rivalDuelState({ comboFreshness: { rival_taiketsu: 0.05 } }), RIVAL_DUEL_SELECTION);
    expect(appliedCombo(b, 'rival_taiketsu')!.freshness).toBe(COMBO_FRESHNESS_MIN);
    expect(appliedCombo(b, 'rival_taiketsu')!.popularityAdd).toBe(Math.round(15 * COMBO_FRESHNESS_MIN));
  });

  it('鮮度が下がっても役自体は成立し続ける（0にはならない）', () => {
    const b = previewScore(data, rivalDuelState({ comboFreshness: { rival_taiketsu: COMBO_FRESHNESS_MIN } }), RIVAL_DUEL_SELECTION);
    expect(appliedCombo(b, 'rival_taiketsu')).toBeDefined();
    expect(appliedCombo(b, 'rival_taiketsu')!.popularityAdd).toBeGreaterThan(0);
  });

  it('週スコアが実際に下がる（鮮度が効いているのは明細だけではない）', () => {
    const fresh = previewScore(data, rivalDuelState(), RIVAL_DUEL_SELECTION);
    const stale = previewScore(data, rivalDuelState({ comboFreshness: { rival_taiketsu: COMBO_FRESHNESS_MIN } }), RIVAL_DUEL_SELECTION);
    expect(stale.popularityTotal).toBeLessThan(fresh.popularityTotal);
    expect(stale.finalScore).toBeLessThan(fresh.finalScore);
  });

  it('話題性加算にも掛かる（阿吽の呼吸は話題性+2）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'battle', 1, { zone: 'hand' }),
    ];
    const base = makeState(cards, 3, { highlightIds: ['hero#1', 'aibou#1'] });
    const fresh = previewScore(data, base, RIVAL_DUEL_SELECTION);
    const stale = previewScore(
      data,
      makeState(cards, 3, { highlightIds: ['hero#1', 'aibou#1'], comboFreshness: { aun_no_kokyuu: 0.5 } }),
      RIVAL_DUEL_SELECTION,
    );
    expect(appliedCombo(fresh, 'aun_no_kokyuu')!.buzzAdd).toBe(2);
    expect(appliedCombo(stale, 'aun_no_kokyuu')!.buzzAdd).toBe(1);
  });

  /*
   * 乗算役は据え置き。「覚醒×3」が鮮度で ×2.4 になると、
   * カードに書いてある倍率と画面の数字が食い違って読めなくなる
   */
  it('乗算役には掛からない', () => {
    const b = previewScore(data, rivalDuelState({ comboFreshness: { rival_taiketsu: COMBO_FRESHNESS_MIN } }), RIVAL_DUEL_SELECTION);
    for (const combo of b.combos.filter((c) => c.status === 'applied')) {
      if (combo.scoreMultiplier > 1) expect(Number.isInteger(combo.scoreMultiplier * 2)).toBe(true);
      if (combo.charMultiplier > 1) expect(Number.isInteger(combo.charMultiplier * 2)).toBe(true);
    }
  });
});

describe('役の鮮度の更新（v7.31）', () => {
  it('成立した週の終わりに鮮度が下がる', () => {
    const before = rivalDuelState();
    const after = resolveWeek(data, before, RIVAL_DUEL_SELECTION).state;
    expect(after.comboFreshness?.rival_taiketsu).toBeCloseTo(1 - COMBO_FRESHNESS_DECAY);
  });

  it('繰り返すほど下がり、下限で止まる', () => {
    let state = rivalDuelState();
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = resolveWeek(data, state, RIVAL_DUEL_SELECTION).state;
      seen.push(state.comboFreshness?.rival_taiketsu ?? 1);
      // 次の週も同じ形で描けるよう、手札のバトルを補充して週を戻す
      state = {
        ...state,
        week: state.week - 1,
        cards: state.cards.map((c) => (c.definitionId === 'battle' ? { ...c, zone: 'hand' as const } : c)),
        hand: ['battle#1'],
      };
    }
    expect(seen[0]).toBeCloseTo(0.8);
    expect(seen[1]).toBeCloseTo(0.6);
    expect(seen[2]).toBeCloseTo(0.4);
    // 下限に達したらそれ以上は下がらない
    expect(seen[3]).toBeCloseTo(COMBO_FRESHNESS_MIN);
    expect(seen[4]).toBeCloseTo(COMBO_FRESHNESS_MIN);
  });

  it('成立しなかった週は戻る', () => {
    // ライバルを場から外して「ライバル対決」が成立しない形にする
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const state = makeState(cards, 3, { highlightIds: ['hero#1'], comboFreshness: { rival_taiketsu: 0.4 } });
    const after = resolveWeek(data, state, RIVAL_DUEL_SELECTION).state;
    expect(after.comboFreshness?.rival_taiketsu).toBeCloseTo(0.6);
  });

  it('満額まで戻ったら記録から消える（セーブを無駄に太らせない）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const state = makeState(cards, 3, { highlightIds: ['hero#1'], comboFreshness: { rival_taiketsu: 0.8 } });
    const after = resolveWeek(data, state, RIVAL_DUEL_SELECTION).state;
    expect(after.comboFreshness?.rival_taiketsu).toBeUndefined();
  });
});

describe('役の鮮度のセーブ互換（v7.31）', () => {
  /*
   * comboFreshness は省略可フィールドとして足したので SAVE_VERSION は据え置き。
   * v7.30 までのセーブを読んでも落ちず、「全部初出」として続きから遊べること
   */
  it('鮮度を持たない古いセーブでも読める（全部満額として扱う）', () => {
    const state = rivalDuelState();
    const legacy = { ...state, comboFreshness: undefined };
    const b = previewScore(data, legacy, RIVAL_DUEL_SELECTION);
    expect(appliedCombo(b, 'rival_taiketsu')!.freshness).toBe(1);
    expect(appliedCombo(b, 'rival_taiketsu')!.popularityAdd).toBe(15);
  });

  it('鮮度を持たない状態から1週描いても壊れない', () => {
    const legacy = { ...rivalDuelState(), comboFreshness: undefined };
    const after = resolveWeek(data, legacy, RIVAL_DUEL_SELECTION).state;
    expect(after.comboFreshness?.rival_taiketsu).toBeCloseTo(1 - COMBO_FRESHNESS_DECAY);
  });

  it('JSONを往復しても鮮度が残る', () => {
    const state = rivalDuelState({ comboFreshness: { rival_taiketsu: 0.6 } });
    const restored = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(restored.comboFreshness?.rival_taiketsu).toBe(0.6);
    expect(appliedCombo(previewScore(data, restored, RIVAL_DUEL_SELECTION), 'rival_taiketsu')!.popularityAdd).toBe(9);
  });
});

describe('最終回の読者アンケート（v7.31）', () => {
  /*
   * v7.28 で最終回のノルマを0にした結果、voices.ts の達成度（finalScore/quota）が
   * 常に0になり、どれだけ良い最終回でも「打ち切られないか心配」が出ていた
   */
  const finaleBreakdown = (completionBonus: number, endingMultiplier = 1) => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
    });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    return { ...b, completionBonus, endingMultiplier };
  };

  const BAD_VOICES = ['そろそろ大きな動きがほしい', '今週はちょっと停滞気味', '打ち切られないか心配', '展開が読めてしまう'];

  it('積み上げが実った最終回は完結を祝う声になる', () => {
    const voices = pickVoices(finaleBreakdown(2, 1.5), 1, FINALE, true);
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.some((v) => ['最終回、最高でした', 'これが読みたかった', '有終の美すぎる', '完結おめでとう', '単行本出たら買う'].includes(v))).toBe(true);
  });

  it('物足りない最終回でも、打ち切りを匂わせる声は出さない', () => {
    const voices = pickVoices(finaleBreakdown(1, 1), 1, FINALE, true);
    for (const v of voices) expect(BAD_VOICES).not.toContain(v);
  });

  it('どのシードでも「打ち切られないか心配」は最終回に出ない', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const voices = pickVoices(finaleBreakdown(1, 1), seed, FINALE, true);
      for (const v of voices) expect(BAD_VOICES).not.toContain(v);
    }
  });

  it('打ち切りエンド（結末カードを選んでいない）は従来どおり厳しい声のまま', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const b = previewScore(data, makeState(cards, 3, { highlightIds: ['hero#1'] }), RIVAL_DUEL_SELECTION);
    expect(b.finaleEnding).toBeNull();
    // ノルマに遠く届かない週。isEnding=true（打ち切り決定）で呼ぶ
    const voices = pickVoices(b, 1, 3, true);
    expect(voices.some((v) => BAD_VOICES.includes(v))).toBe(true);
  });

  it('通常週の声は今までどおり達成度で決まる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const b = previewScore(data, makeState(cards, 1, { highlightIds: ['hero#1'] }), RIVAL_DUEL_SELECTION);
    const voices = pickVoices(b, 1, 1, false);
    expect(voices.length).toBeGreaterThan(0);
  });
});

describe('最終回では編集部の要求を判定しない（v7.31）', () => {
  it('期限切れの要求があっても、最終回では警告も「読者が離れた」も出ない', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
      // どれも未達のまま期限を過ぎている要求
      demands: [{ id: 'battle_1', text: 'テスト要求', deadline: 3, achievedWeek: null, failed: false }],
      warnings: 0,
    });
    const result = resolveWeek(data, state, { cards: [], targets: {} }, [], 'gojitsudan');
    expect(result.failedDemands).toEqual([]);
    expect(result.state.warnings).toBe(0);
    expect(result.outcome).toBe('continue');
  });

  it('通常週では今までどおり期限切れを判定する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const state = makeState(cards, 5, {
      highlightIds: ['hero#1'],
      demands: [{ id: 'battle_1', text: 'テスト要求', deadline: 3, achievedWeek: null, failed: false }],
    });
    const result = resolveWeek(data, state, RIVAL_DUEL_SELECTION);
    expect(result.failedDemands.length).toBe(1);
  });
});
