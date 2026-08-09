/**
 * v7.30: 短期連載モード（全13話）。
 *
 * 絶対話数のゲート（第5話まで／第17話以降）を幕ゲートへ置き換え、
 * ノルマ・幕・要求・カード解放週・バランス値をキャンペーン単位で持つようにした。
 * ここでは「短期が意図どおり動くこと」と「通常連載が変わっていないこと」の両方を固定する。
 */
import { describe, expect, it } from 'vitest';
import { COMBO_REGISTRY } from './combos';
import { campaignOf, finaleWeekOf, normalizeMode, totalWeeksOf, unlockWeekOf } from './campaign';
import { DEMANDS_LONG, DEMANDS_SHORT } from './demands';
import { createRun, previewScore, startWeek } from './run';
import { loadSave, saveRun } from './save';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { RunState } from './types';

const data = loadTestData();
const short = data.campaigns.short;
const long = data.campaigns.long;

/**
 * vitestはnode環境で動くのでlocalStorageが無い。
 * jsdomを足すほどの用ではないため、最小限のインメモリ実装を差し込む（v68.test.ts と同じ）
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
}

describe('キャンペーンの定義', () => {
  it('短期は全13話、最終回は第13話', () => {
    expect(short.totalWeeks).toBe(13);
    expect(finaleWeekOf(short)).toBe(13);
  });

  it('通常は全25話のまま（既存の挙動を変えない）', () => {
    expect(long.totalWeeks).toBe(25);
    expect(finaleWeekOf(long)).toBe(25);
  });

  it('短期のボス週は4・8・12話', () => {
    const bosses = [...short.quotas.values()].filter((q) => q.boss).map((q) => [q.week, q.boss]);
    expect(bosses).toEqual([
      [4, '合併号'],
      [8, '人気投票'],
      [12, '新連載攻勢'],
    ]);
  });

  it('短期の幕は 序1-3 / 破4-9 / 急10-12', () => {
    expect(short.acts.map((a) => a.startWeek)).toEqual([1, 4, 10]);
  });

  it('短期の要求は5件、通常は8件', () => {
    expect(short.demands).toHaveLength(5);
    expect(long.demands).toHaveLength(8);
    // 数量目標（役の種類数）は短期では課さない
    expect(short.demands.map((d) => d.id)).not.toContain('battle_7');
    // 代替条件があり短期でも狙える battle_2 は残す
    expect(short.demands.map((d) => d.id)).toContain('battle_2');
  });

  it('短期の要求の期限は全部が最終回より前', () => {
    for (const d of short.demands) expect(d.deadline).toBeLessThan(finaleWeekOf(short));
  });
});

describe('normalizeMode（不正値・未設定は通常連載へ寄せる）', () => {
  it.each([
    ['short', 'short'],
    ['long', 'long'],
    [undefined, 'long'],
    ['', 'long'],
    ['SHORT', 'long'],
    [42, 'long'],
    [null, 'long'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMode(input)).toBe(expected);
  });

  it('modeを持たない古いランは通常連載として扱う', () => {
    const legacy = makeState([makeInstance(data, 'hero', 1)], 1) as RunState;
    delete legacy.mode;
    expect(campaignOf(data, legacy).mode).toBe('long');
    expect(totalWeeksOf(data, legacy)).toBe(25);
  });
});

describe('カード解放週（短期は前倒しするが、比率換算そのままにはしない）', () => {
  const unlockOf = (id: string, mode: 'long' | 'short') =>
    unlockWeekOf(data.campaigns[mode], data.definitions.get(id)!);

  it('通常連載は cards.json の値をそのまま使う', () => {
    expect(unlockOf('title_kaishu', 'long')).toBe(10);
    expect(unlockOf('zenin_seikan', 'long')).toBe(17);
  });

  it('短期は上書き値を使う（大技が破の序盤に出ないよう比率換算より遅らせる）', () => {
    // 比率換算なら 10×12/24=5 だが、話題性8＋全員恒久+2 の大技なので6へ
    expect(unlockOf('title_kaishu', 'short')).toBe(6);
    // 「全員生還」は急の開始（10話）に合わせる（比率換算なら9）
    expect(unlockOf('zenin_seikan', 'short')).toBe(10);
  });

  it('上書きの無いカードは通常と同じ', () => {
    expect(unlockOf('battle', 'short')).toBe(unlockOf('battle', 'long'));
  });

  it('解放週は必ず最終回より前（短期で入手できないカードを作らない）', () => {
    for (const def of data.definitions.values()) {
      expect(unlockWeekOf(short, def)).toBeLessThan(finaleWeekOf(short));
    }
  });
});

describe('幕ゲート: 序盤専用役は短期では第3話まで', () => {
  /** 「顔見せ回」= 新キャラ登場 + 日常回。序の間だけ成立する */
  const kaomise = (week: number, mode: 'long' | 'short') => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'shinchara', 1, { zone: 'hand' }),
      makeInstance(data, 'nichijou', 1, { zone: 'hand' }),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
    ];
    const state = makeState(cards, week, { mode });
    const b = previewScore(data, state, {
      cards: ['shinchara#1', 'nichijou#1'],
      targets: { 'shinchara#1': 'aibou#1' },
    });
    return b.combos.some((c) => c.comboId === 'kaomise' && c.status === 'applied');
  };

  it('通常連載は第5話まで成立し、第6話からは成立しない', () => {
    expect(kaomise(5, 'long')).toBe(true);
    expect(kaomise(6, 'long')).toBe(false);
  });

  it('短期連載は第3話まで成立し、第4話からは成立しない', () => {
    expect(kaomise(3, 'short')).toBe(true);
    expect(kaomise(4, 'short')).toBe(false);
  });
});

describe('幕ゲート: 第三幕専用役は短期では第10話から', () => {
  /** 「最終決戦」= バトル + 総力戦。急の間だけ成立する */
  const saishuuKessen = (week: number, mode: 'long' | 'short') => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'battle', 1, { zone: 'hand' }),
      makeInstance(data, 'souryokusen', 1, { zone: 'hand' }),
    ];
    const state = makeState(cards, week, { mode });
    const b = previewScore(data, state, { cards: ['battle#1', 'souryokusen#1'], targets: {} });
    return b.combos.some((c) => c.comboId === 'saishuu_kessen' && c.status === 'applied');
  };

  it('通常連載は第17話から成立する', () => {
    expect(saishuuKessen(16, 'long')).toBe(false);
    expect(saishuuKessen(17, 'long')).toBe(true);
  });

  it('短期連載は第10話から成立する（急を落とさない）', () => {
    expect(saishuuKessen(9, 'short')).toBe(false);
    expect(saishuuKessen(10, 'short')).toBe(true);
  });
});

describe('短期のラン生成', () => {
  it('createRun が短期の要求を持つ', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト', mode: 'short' });
    expect(run.mode).toBe('short');
    expect(run.demands).toHaveLength(DEMANDS_SHORT.length);
    expect(run.demands.map((d) => d.id)).not.toContain('battle_7');
  });

  it('mode を省略すると通常連載の要求になる', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    expect(run.mode).toBe('long');
    expect(run.demands).toHaveLength(DEMANDS_LONG.length);
  });

  it('短期の最終回（第13話）は手札を配らずノルマも無い', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1, { zone: 'activeDeck' })];
    const state = startWeek(data, makeState(cards, 13, { mode: 'short', hand: [] }));
    expect(state.hand).toEqual([]);
    const b = previewScore(data, state, { cards: [], targets: {} }, 'gojitsudan');
    expect(b.quota).toBe(0);
    expect(b.cleared).toBe(true);
  });
});

describe('短期のバランス値', () => {
  it('完結ボーナスは0.25/種（4種で上限×2）、伝説の完結は4種', () => {
    expect(short.balance.completionBonusPerCombo).toBe(0.25);
    expect(short.balance.legendaryCompletionCombos).toBe(4);
  });

  /*
   * v7.30の実装中、これらの値をキャンペーンに定義しただけで
   * 実際の判定に配線し忘れていた（定義はされているが誰も読まない状態）。
   * 「設定値が本当に効いているか」を実際のスコア計算で確かめる
   */
  it('完結ボーナスの倍率が実際のスコアに効いている', () => {
    const cards = [makeInstance(data, 'hero', 1)];
    const setups = ['a', 'b'];
    const shortRun = makeState(cards, 13, { mode: 'short', setupComboHistory: setups, log: [] });
    const longRun = makeState(cards, 25, { mode: 'long', setupComboHistory: setups, log: [] });
    // 同じ2種でも 短期は 1+0.25×2=1.5 / 通常は 1+0.1×2=1.2
    expect(previewScore(data, shortRun, { cards: [], targets: {} }, 'gojitsudan').completionBonus).toBe(1.5);
    expect(previewScore(data, longRun, { cards: [], targets: {} }, 'gojitsudan').completionBonus).toBe(1.2);
  });

  it('「伝説の完結」の必要種類数がキャンペーンごとに効いている', () => {
    const cards = [makeInstance(data, 'hero', 1)];
    const setups = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
    const legendary = (b: { combos: { comboId: string; status: string }[] }) =>
      b.combos.some((c) => c.comboId === 'densetsu_no_kanketsu' && c.status === 'applied');

    // 短期は4種で成立、3種では成立しない
    const short4 = makeState(cards, 13, { mode: 'short', setupComboHistory: setups(4) });
    const short3 = makeState(cards, 13, { mode: 'short', setupComboHistory: setups(3) });
    expect(legendary(previewScore(data, short4, { cards: [], targets: {} }, 'gojitsudan'))).toBe(true);
    expect(legendary(previewScore(data, short3, { cards: [], targets: {} }, 'gojitsudan'))).toBe(false);

    // 通常連載は4種では成立しない（10種必要）
    const long4 = makeState(cards, 25, { mode: 'long', setupComboHistory: setups(4) });
    expect(legendary(previewScore(data, long4, { cards: [], targets: {} }, 'gojitsudan'))).toBe(false);
  });

  it('有終の美の絶対下限は通常より低い', () => {
    expect(short.balance.yuushuuMinScore).toBeLessThan(long.balance.yuushuuMinScore);
  });

  it('ボス予告と要求ヒントの窓は短期のほうが短い', () => {
    expect(short.balance.bossBriefingLead).toBeLessThan(long.balance.bossBriefingLead);
    expect(short.balance.hintBoostWeeks).toBeLessThan(long.balance.hintBoostWeeks);
  });
});

describe('セーブと再開', () => {
  it('短期のランを保存して読み直すと mode が保たれる', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト', mode: 'short' });
    expect(saveRun(run, 'play')).toBe(true);
    expect(loadSave()?.run.mode).toBe('short');
  });

  it('mode を持たない古いセーブは通常連載として読める', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    delete (run as RunState).mode;
    saveRun(run, 'play');
    expect(loadSave()?.run.mode).toBe('long');
  });

  it('壊れた mode は通常連載へ正規化される', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    (run as unknown as { mode: string }).mode = 'とんでもない値';
    saveRun(run, 'play');
    expect(loadSave()?.run.mode).toBe('long');
  });
});

describe('役の説明文（幕ゲート化に追随しているか）', () => {
  it('絶対話数の表記が残っていない', () => {
    const stale = COMBO_REGISTRY.filter((c) => /第5話までに|第17話以降/.test(c.conditionText));
    expect(stale.map((c) => c.id)).toEqual([]);
  });
});
