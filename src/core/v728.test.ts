/**
 * v7.28: 最終回を「結末を選ぶだけの回」にする。
 * 展開カードは出さず、人気度・話題性はこれまでの中央値をベースにする。
 * ノルマは廃止し、必ず完結できるようにした。
 */
import { describe, expect, it } from 'vitest';
import { COMBO_REGISTRY, YUUSHUU_NO_BI_MIN_SCORE, YUUSHUU_NO_BI_RATIO } from './combos';
import { createDemands } from './demands';
import { finaleBase, finaleBaseScore } from './finale';
import { previewScore, resolveWeek, startWeek } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { MAX_WARNINGS, type WeekLogEntry } from './types';

const data = loadTestData();
const FINALE = 25;

/** 人気度・話題性を記録した通常週のログを組み立てる（quotaは母集団の判定に使うので正の値） */
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

/** 採点済みの最終回のログ（ノルマ無し＝quota 0） */
const finaleWeek = (popularity: number, buzz: number): WeekLogEntry => ({
  ...week(FINALE, popularity, buzz),
  quota: 0,
});

describe('最終回のベース点は過去週の中央値（v7.28）', () => {
  it('人気度と話題性それぞれの中央値を取る', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 100, 10), week(2, 200, 20), week(3, 300, 30)],
    });
    expect(finaleBase(state)).toEqual({ popularity: 200, buzz: 20 });
  });

  it('偶数個なら中央2つの平均を取り、切り捨てる', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 100, 10), week(2, 150, 15), week(3, 250, 25), week(4, 300, 30)],
    });
    // 人気度 (150+250)/2 = 200、話題性 (15+25)/2 = 20
    expect(finaleBase(state)).toEqual({ popularity: 200, buzz: 20 });
  });

  it('ボス週「人気投票」（第16話）は話題性が固定1なので母集団から外す', () => {
    const withVote = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(15, 100, 10), week(16, 5000, 1), week(17, 300, 30)],
    });
    // 第16話を含めると話題性の中央値が1に引きずられる。外して (10,30) の中央値=20
    expect(finaleBase(withVote).buzz).toBe(20);
  });

  it('記録の無い古いセーブは、週スコアの中央値から逆算する', () => {
    const legacy = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      // popularity / buzz が無い（v7.28より前に保存された）週ログ
      log: [
        { week: 1, playedInstanceIds: [], playedDefinitionIds: [], comboIds: [], score: 1200, quota: 100, cleared: true, warningsAfter: 0 },
        { week: 2, playedInstanceIds: [], playedDefinitionIds: [], comboIds: [], score: 3000, quota: 100, cleared: true, warningsAfter: 0 },
        { week: 3, playedInstanceIds: [], playedDefinitionIds: [], comboIds: [], score: 6000, quota: 100, cleared: true, warningsAfter: 0 },
      ],
    });
    const base = finaleBase(legacy);
    // 中央値3000を再現できる組み合わせになっている（0点の最終回にはならない）
    expect(base.popularity * base.buzz).toBe(3000);
  });

  it('週ログが空でも壊れない', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, { log: [] });
    expect(finaleBase(state)).toEqual({ popularity: 0, buzz: 0 });
  });

  /*
   * 採点時はまだ最終回が記録されていないので影響しないが、
   * 採点後（年表の集計）に呼ぶと自分自身を数えてベース点がずれる
   */
  it('採点後に呼んでも、最終回自身は母集団に入らない', () => {
    const log = [week(1, 100, 10), week(2, 200, 20), week(3, 300, 30)];
    const before = makeState([makeInstance(data, 'hero', 1)], FINALE, { log });
    // 最終回（人気9999・話題999）を記録したあとでも中央値は変わらない
    const after = makeState([makeInstance(data, 'hero', 1)], FINALE, { log: [...log, finaleWeek(9999, 999)] });
    expect(finaleBase(after)).toEqual(finaleBase(before));
    expect(finaleBase(after)).toEqual({ popularity: 200, buzz: 20 });
  });
});

describe('最終回は展開カードを出さない（v7.28）', () => {
  it('最終回は手札が配られない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'battle', 90, { zone: 'activeDeck' }),
      makeInstance(data, 'nichijou', 91, { zone: 'activeDeck' }),
    ];
    expect(startWeek(data, makeState(cards, FINALE, { hand: [] })).hand).toEqual([]);
  });

  it('カードを1枚も出さなくても、中央値ベースでスコアが出る', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
    });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    // 後日談: 話題性+3、キャスト全員の人気度+10（出演1人ぶん）
    expect(b.popularityTotal).toBe(210);
    expect(b.buzzApplied).toBe(23);
    expect(b.finalScore).toBeGreaterThan(0);
  });

  it('結末カードの人気度倍率がベース点に掛かる（新世代の物語×2）', () => {
    const log = [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)];
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, { log });
    const plain = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    const doubled = previewScore(data, state, { cards: [], targets: {} }, 'shinsedai');
    // 後日談は +10×1人 で210、新世代は 200×2 で400
    expect(plain.popularityTotal).toBe(210);
    expect(doubled.popularityTotal).toBe(400);
  });
});

describe('最終回のノルマは廃止（v7.28）', () => {
  it('ノルマは0で、必ず達成扱いになる', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, { log: [week(1, 10, 1)] });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    expect(b.quota).toBe(0);
    expect(b.cleared).toBe(true);
  });

  it('ノルマが無いので原稿料は発生しない', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, { log: [week(1, 200, 20)] });
    expect(previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan').fee).toBe(0);
  });

  it('通常週のノルマ判定と原稿料は今までどおり', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'hand' })];
    const b = previewScore(data, makeState(cards, 1), { cards: ['battle#1'], targets: {} });
    expect(b.quota).toBeGreaterThan(0);
  });

  /*
   * 期限切れの編集部の要求は警告を増やす。現状はどの要求も期限が第16話までなので
   * 最終回に期限切れは起きないが、「最終回は必ず完結できる」をルールとして保証しておく
   */
  it('警告が上限に達しても最終回は打ち切られない', () => {
    const cards = [makeInstance(data, 'hero', 1)];
    const state = makeState(cards, FINALE, {
      warnings: MAX_WARNINGS - 1,
      log: [week(1, 200, 20)],
      // すべての要求を未達のまま最終回に持ち込む（期限はとうに過ぎている）
      demands: createDemands(),
    });
    const result = resolveWeek(data, state, { cards: [], targets: {} }, [], 'gojitsudan');
    expect(result.outcome).toBe('continue');
    expect(result.cancelReason).toBeUndefined();
  });

  it('通常週なら警告が上限に達すると打ち切りになる', () => {
    const cards = [makeInstance(data, 'hero', 1)];
    // ノルマに遠く届かない週を、警告があと1つで上限という状態で迎える
    const state = makeState(cards, 20, { warnings: MAX_WARNINGS - 1 });
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.outcome).toBe('cancelled');
  });
});

describe('「有終の美」はベース点の3倍が基準（v7.28）', () => {
  const yuushuu = COMBO_REGISTRY.find((c) => c.id === 'yuushuu_no_bi')!;
  const applied = (b: { combos: { comboId: string; status: string }[] }) =>
    b.combos.some((c) => c.comboId === 'yuushuu_no_bi' && c.status === 'applied');

  it('第3層（スコア計算後）の役のまま', () => {
    expect(yuushuu.layer).toBe(3);
    expect(yuushuu.phase).toBe('postScore');
  });

  it('ベース点の3倍に届かなければ成立しない', () => {
    // 後日談は週スコア×1なので、ベース点をわずかに超える程度にしかならない
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
    });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    expect(b.finalScore).toBeLessThan(finaleBaseScore(state) * YUUSHUU_NO_BI_RATIO);
    expect(applied(b)).toBe(false);
  });

  it('週スコア×4の結末なら成立する', () => {
    const cards = [makeInstance(data, 'hero', 1, { zone: 'dead' }), makeInstance(data, 'heroine', 1)];
    const state = makeState(cards, FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
    });
    // 意志は受け継がれる: 主人公の死亡が条件。週スコア×4
    const b = previewScore(data, state, { cards: [], targets: {} }, 'ishi_wa_uketsugareru');
    expect(b.finalScore).toBeGreaterThanOrEqual(finaleBaseScore(state) * YUUSHUU_NO_BI_RATIO);
    expect(applied(b)).toBe(true);
  });

  /*
   * v7.29: gpt-5.6-solのシミュレーション分析で判明した逆転現象の再現テスト。
   * ベース点が低い（弱い）連載ほど、結末カードの定額加算（後日談の「全員+10」等）が
   * 相対的に大きく効くため、相対3倍条件だけでは弱い連載のほうが有終の美を取りやすくなっていた。
   * 絶対点10,000のAND条件で、この種の「弱いのに3倍」を弾けることを確認する
   */
  it('相対3倍を満たしても、絶対点10,000未満なら成立しない（弱い連載優遇の是正）', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, {
      log: [week(1, 10, 2), week(2, 10, 2), week(3, 10, 2)],
    });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    expect(b.finalScore).toBeGreaterThanOrEqual(finaleBaseScore(state) * YUUSHUU_NO_BI_RATIO);
    expect(b.finalScore).toBeLessThan(YUUSHUU_NO_BI_MIN_SCORE);
    expect(applied(b)).toBe(false);
  });

  it('相対3倍・絶対10,000の両方を満たせば成立する', () => {
    const cards = [makeInstance(data, 'hero', 1, { zone: 'dead' }), makeInstance(data, 'heroine', 1)];
    const state = makeState(cards, FINALE, {
      log: [week(1, 200, 20), week(2, 200, 20), week(3, 200, 20)],
    });
    const b = previewScore(data, state, { cards: [], targets: {} }, 'ishi_wa_uketsugareru');
    expect(b.finalScore).toBeGreaterThanOrEqual(YUUSHUU_NO_BI_MIN_SCORE);
    expect(applied(b)).toBe(true);
  });

  it('ベース点が0（記録なし）なら成立しない', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], FINALE, { log: [] });
    expect(applied(previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan'))).toBe(false);
  });
});

describe('廃止した役（v7.28）', () => {
  it('「取り戻した日々」は登録から消えている', () => {
    expect(COMBO_REGISTRY.find((c) => c.id === 'torimodoshita_hibi')).toBeUndefined();
  });
});
