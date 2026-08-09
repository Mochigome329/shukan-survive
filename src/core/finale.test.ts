import { describe, expect, it } from 'vitest';
import {
  completionBonus,
  endingById,
  ENDING_SLOTS,
  offeredEndings,
  yumeochiCount,
  COMPLETION_BONUS_CAP,
  FINALE_MAX_PLAY_CARDS,
} from './finale';
import { previewScore, returnableCharacters, returnCharacter, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { RunState, WeekLogEntry } from './types';

const data = loadTestData();
const FINALE = 25;

const log = (over: Partial<WeekLogEntry>): WeekLogEntry => ({
  week: 1,
  playedInstanceIds: [],
  playedDefinitionIds: [],
  comboIds: [],
  score: 0,
  quota: 0,
  cleared: true,
  warningsAfter: 0,
  ...over,
});

const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

describe('最終回の固有ルール（v5.9）', () => {
  it('第25話は最終回として定義されている', () => {
    expect(data.campaigns.long.quotas.get(FINALE)?.final).toBe(true);
  });

  it('プレイ上限が5枚に増える', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      ...Array.from({ length: 5 }, (_, i) => makeInstance(data, 'nichijou', i + 1)),
    ];
    const five = { cards: ['nichijou#1', 'nichijou#2', 'nichijou#3', 'nichijou#4', 'nichijou#5'], targets: {} };
    expect(FINALE_MAX_PLAY_CARDS).toBe(5);
    expect(validateSelection(data, makeState(cards, FINALE), five).ok).toBe(true);
    // 通常週は4枚まで
    expect(validateSelection(data, makeState(cards, 20), five).ok).toBe(false);
  });

  it('再登場待ちは待機期間も週1人の制限も無視して全員戻せる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { zone: 'waiting', leftWeek: 24 }), // 先週離脱
      makeInstance(data, 'aibou', 1, { zone: 'waiting', leftWeek: 24 }),
    ];
    const finale = makeState(cards, FINALE);
    expect(returnableCharacters(data, finale)).toHaveLength(2);

    const after1 = returnCharacter(data, finale, 'rival#1');
    const after2 = returnCharacter(data, after1, 'aibou#1'); // 2人目も戻せる
    expect(after2.cards.filter((c) => c.zone === 'field')).toHaveLength(3);

    // 通常週は先週離脱では戻せない
    expect(returnableCharacters(data, makeState(cards, 20))).toHaveLength(0);
  });

  it('総集編と宴会は最終回では使えない', () => {
    for (const id of ['soushuhen', 'enkai']) {
      const cards = [makeInstance(data, 'hero', 1), makeInstance(data, id, 1)];
      const v = validateSelection(data, makeState(cards, FINALE), { cards: [`${id}#1`], targets: {} });
      expect(v.ok).toBe(false);
      expect((v as { reason: string }).reason).toContain('最終回');
    }
  });
});

describe('完結ボーナス（v5.9）', () => {
  it('通常連載は仕込み役の種類数×0.1で増え、×2.0で頭打ちになる', () => {
    const withSetups = (n: number) =>
      ({ setupComboHistory: Array.from({ length: n }, (_, i) => `s${i}`) }) as unknown as RunState;
    const per = data.campaigns.long.balance.completionBonusPerCombo;
    expect(completionBonus(withSetups(0), per)).toBe(1);
    expect(completionBonus(withSetups(5), per)).toBe(1.5);
    expect(completionBonus(withSetups(10), per)).toBe(2);
    expect(completionBonus(withSetups(20), per)).toBe(COMPLETION_BONUS_CAP);
  });

  it('短期連載は0.25/種で、4種で頭打ちになる（v7.30）', () => {
    const withSetups = (n: number) =>
      ({ setupComboHistory: Array.from({ length: n }, (_, i) => `s${i}`) }) as unknown as RunState;
    const per = data.campaigns.short.balance.completionBonusPerCombo;
    expect(completionBonus(withSetups(2), per)).toBe(1.5);
    expect(completionBonus(withSetups(4), per)).toBe(2);
    expect(completionBonus(withSetups(10), per)).toBe(COMPLETION_BONUS_CAP);
  });

  it('最終回のスコアに完結ボーナスが掛かる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const plain = previewScore(data, makeState(cards, FINALE), { cards: ['nichijou#1'], targets: {} });
    const boosted = previewScore(
      data,
      makeState(cards, FINALE, { setupComboHistory: ['a', 'b', 'c', 'd', 'e'] }),
      { cards: ['nichijou#1'], targets: {} },
    );
    expect(plain.completionBonus).toBe(1);
    expect(boosted.completionBonus).toBe(1.5);
    expect(boosted.finalScore).toBe(Math.floor(plain.finalScore * 1.5));
  });
});

describe('結末カードの提示（v5.9）', () => {
  const base = (over: Partial<RunState> = {}) =>
    makeState([makeInstance(data, 'hero', 1)], FINALE, over);

  it('何も積んでいなくても「後日談」は必ず選べる', () => {
    const offered = offeredEndings(data, base());
    expect(offered.map((c) => c.id)).toContain('gojitsudan');
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.length).toBeLessThanOrEqual(ENDING_SLOTS);
  });

  it('主人公が死亡していると「意志は受け継がれる」が出る', () => {
    const state = makeState([makeInstance(data, 'hero', 1, { zone: 'dead' })], FINALE);
    expect(offeredEndings(data, state).map((c) => c.id)).toContain('ishi_wa_uketsugareru');
  });

  it('「両想い」を成立させ、相手が生きていれば結婚式が出る', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1)], FINALE, {
      log: [log({ comboIds: ['ryouomoi'] })],
      romanceIds: ['heroine#1'],
    });
    expect(offeredEndings(data, state).map((c) => c.id)).toContain('kekkonshiki');
  });

  it('「両想い」の相手が死んでいると結婚式は出ない（v7.3）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1, { zone: 'dead' })], FINALE, {
      log: [log({ comboIds: ['ryouomoi'] })],
      romanceIds: ['heroine#1'],
    });
    expect(offeredEndings(data, state).map((c) => c.id)).not.toContain('kekkonshiki');
  });

  it('相手が途中離脱（再登場待ち）なら結婚式は出る。最終回は全員戻ってくるため（v7.3）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1, { zone: 'waiting' })], FINALE, {
      log: [log({ comboIds: ['ryouomoi'] })],
      romanceIds: ['heroine#1'],
    });
    expect(offeredEndings(data, state).map((c) => c.id)).toContain('kekkonshiki');
  });

  it('伏線を抱えたままだと「投げっぱなしエンド」が出て、ペナルティが2倍になる', () => {
    const state = base({ foreshadowTokens: 3 });
    expect(offeredEndings(data, state).map((c) => c.id)).toContain('nagepanashi');
    expect(endingById('nagepanashi')!.unresolvedPenaltyMultiplier).toBe(2);
  });

  it('夢オチの使用回数で選択肢が痩せる（1回=枠を1つ占有 / 3回=良い結末が消える）', () => {
    // 結婚式には生きている相手が要る（v7.3）ので、ヒロインを場に置いて romanceIds を持たせる
    const romance = (over: Partial<RunState> = {}) =>
      makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1)], FINALE, {
        romanceIds: ['heroine#1'],
        ...over,
      });
    const goodLog = [log({ comboIds: ['ryouomoi'] })];
    const dream = (n: number) => Array.from({ length: n }, () => log({ playedDefinitionIds: ['yumeochi'] }));

    const none = offeredEndings(data, romance({ log: goodLog }));
    expect(none.map((c) => c.id)).not.toContain('yumeochi_end');
    expect(none.map((c) => c.id)).toContain('kekkonshiki');

    const once = offeredEndings(data, romance({ log: [...goodLog, ...dream(1)] }));
    expect(once.map((c) => c.id)).toContain('yumeochi_end');
    expect(once.map((c) => c.id)).toContain('kekkonshiki'); // 1回なら良い結末も残る

    const thrice = offeredEndings(data, romance({ log: [...goodLog, ...dream(3)] }));
    expect(thrice.map((c) => c.id)).not.toContain('kekkonshiki'); // 3回で良い結末は消える
    expect(thrice.map((c) => c.id)).toContain('yumeochi_end');
    expect(thrice.length).toBeGreaterThan(0); // 選択肢が空にはならない
  });

  it('夢オチの使用回数は週ログから数える（専用の状態を持たない）', () => {
    expect(yumeochiCount(base())).toBe(0);
    expect(yumeochiCount(base({ log: [log({ playedDefinitionIds: ['yumeochi'] })] }))).toBe(1);
  });

  it('選んだ結末カードの効果がスコアに乗る', () => {
    const cards = [makeInstance(data, 'hero', 1, { zone: 'dead' }), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, FINALE);
    const sel = { cards: ['nichijou#1'], targets: {} };
    const plain = previewScore(data, state, sel);
    const withEnding = previewScore(data, state, sel, 'ishi_wa_uketsugareru');
    expect(withEnding.finaleEnding?.name).toBe('意志は受け継がれる');
    expect(withEnding.endingMultiplier).toBe(4);
    expect(withEnding.finalScore).toBeGreaterThan(plain.finalScore);
  });
});

describe('完結ボーナスの積み上げ演出用データ（v6.3）', () => {
  it('最終回では、完結ボーナスの元になった仕込み役IDの一覧をそのまま返す', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, FINALE, { setupComboHistory: ['shitei_no_wakare', 'keishou_no_kakusei', 'ryouomoi'] });
    const b = previewScore(data, state, { cards: ['nichijou#1'], targets: {} });
    expect(b.setupComboIds).toEqual(['shitei_no_wakare', 'keishou_no_kakusei', 'ryouomoi']);
  });

  it('通常週では空配列', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, 10, { setupComboHistory: ['keishou_no_kakusei'] });
    const b = previewScore(data, state, { cards: ['nichijou#1'], targets: {} });
    expect(b.setupComboIds).toEqual([]);
  });
});

describe('最終回専用役（v5.9）', () => {
  it('「大団円」: 最終回にキャストが5人以上', () => {
    const cast = ['hero', 'heroine', 'rival', 'aibou', 'osananajimi'].map((id) => makeInstance(data, id, 1));
    const cards = [...cast, makeInstance(data, 'nichijou', 1)];
    expect(applied(previewScore(data, makeState(cards, FINALE), { cards: ['nichijou#1'], targets: {} }))).toContain('大団円');
    // 通常週では成立しない
    expect(applied(previewScore(data, makeState(cards, 20), { cards: ['nichijou#1'], targets: {} }))).not.toContain('大団円');
  });

  it('「伝説の完結」: 仕込み役を10種類以上成立させた状態で最終回を迎える', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const many = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const b = previewScore(data, makeState(cards, FINALE, { setupComboHistory: many }), {
      cards: ['nichijou#1'],
      targets: {},
    });
    expect(applied(b)).toContain('伝説の完結');

    const few = previewScore(data, makeState(cards, FINALE, { setupComboHistory: ['a'] }), {
      cards: ['nichijou#1'],
      targets: {},
    });
    expect(applied(few)).not.toContain('伝説の完結');
  });
});

describe('最終回のフェーズ遷移（v5.9）', () => {
  it('結末を選ばずに確定しようとすると止められ、選べば完結できる', async () => {
    const { gameReducer, initialGameState } = await import('../state/gameReducer');
    type GS = import('../state/gameReducer').GameState;
    // ノルマ7000を超える連載を用意する（育ったキャスト5人＋話題性の高い展開）
    const cast = ['hero', 'heroine', 'rival', 'aibou', 'osananajimi'].map((id) =>
      makeInstance(data, id, 1, { permanentPopularityBonus: 100 }),
    );
    const cards = [...cast, makeInstance(data, 'title_kaishu', 1), makeInstance(data, 'nichijou', 1)];
    const run = makeState(cards, FINALE, { setupComboHistory: ['a', 'b', 'c'] });
    let state: GS = { ...initialGameState(data), screen: 'play', run };

    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'title_kaishu#1' });
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'nichijou#1' });
    // 結末未選択では確定できない
    state = gameReducer(state, { type: 'confirmPlay' });
    expect(state.screen).toBe('play');
    expect(state.notice).toContain('結末');

    state = gameReducer(state, { type: 'selectEnding', endingId: 'gojitsudan' });
    expect(state.selectedEnding).toBe('gojitsudan');
    state = gameReducer(state, { type: 'confirmPlay' });
    expect(state.screen).toBe('result');
    expect(state.lastResult?.breakdown.finaleEnding?.name).toBe('後日談');

    // リザルトを抜けると完結画面へ（第25話の次は無い）
    state = gameReducer(state, { type: 'proceedFromResult' });
    expect(state.screen).toBe('clearedAll');
  });

  /*
   * v7.28: 最終回のノルマは廃止した。展開カードを出さない回になり、
   * プレイヤーが最終回の中でスコアを動かせる手段が結末の選択だけになったので、
   * そこで打ち切りになるのは理不尽、という整理。必ず完結できる
   */
  it('最終回はノルマが無く、素の状態でも打ち切りにならない', () => {
    const cards = [makeInstance(data, 'hero', 1)];
    const state = makeState(cards, FINALE);
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    expect(b.quota).toBe(0);
    expect(b.cleared).toBe(true);
  });
});
