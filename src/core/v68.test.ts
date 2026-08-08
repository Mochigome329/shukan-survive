/** v6.8: 連載年表（週の出来事の記録・物語10類型の事後判定）とセーブ・ロード */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveWeek } from './run';
import { clearSave, loadSave, SAVE_VERSION, saveRun } from './save';
import { detectStoryType, STORY_TYPES, storyTypeContext } from './storyTypes';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { RunState, WeekLogEntry } from './types';

const data = loadTestData();

/**
 * vitestはnode環境で動くのでlocalStorageが無い。
 * jsdomを足すほどの用ではないため、最小限のインメモリ実装を差し込む
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

/** 年表・型判定用に、週ログだけを持つ最小のランを作る */
function runWithLog(entries: Partial<WeekLogEntry>[], overrides: Partial<RunState> = {}): RunState {
  const log = entries.map((e, i) => ({
    week: i + 1,
    playedInstanceIds: [],
    playedDefinitionIds: [],
    comboIds: [],
    score: 1000,
    quota: 500,
    cleared: true,
    warningsAfter: 0,
    ...e,
  }));
  return makeState([makeInstance(data, 'hero', 1)], log.length + 1, { log, ...overrides });
}

describe('連載年表の出来事の記録（v6.8）', () => {
  it('デビュー・死亡・離脱が週ログに残る', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'shibou', 1),
    ];
    const state = makeState(cards, 5);
    const after = resolveWeek(data, state, {
      cards: ['shinchara#1', 'shibou#1'],
      targets: { 'shinchara#1': 'mascot#1', 'shibou#1': 'aibou#1' },
    }).state;
    const events = after.log[after.log.length - 1]!.events ?? [];
    expect(events).toContainEqual({ kind: 'debut', name: 'マスコット' });
    expect(events).toContainEqual({ kind: 'death', name: '相棒' });
  });

  it('裏切りによる陣営の変化が「敵対」として残る', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'uragiri', 1)];
    const state = makeState(cards, 5);
    const after = resolveWeek(data, state, { cards: ['uragiri#1'], targets: { 'uragiri#1': 'aibou#1' } }).state;
    expect(after.log[after.log.length - 1]!.events).toContainEqual({ kind: 'toEnemy', name: '相棒' });
  });

  it('デビュー時の陣営確定は「変化」として記録しない（陣営が実際に変わっていないため）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ];
    const state = makeState(cards, 5);
    const after = resolveWeek(data, state, {
      cards: ['shinchara#1'],
      targets: { 'shinchara#1': 'mascot#1' },
    }).state;
    const events = after.log[after.log.length - 1]!.events ?? [];
    expect(events).toEqual([{ kind: 'debut', name: 'マスコット' }]);
  });

  it('何も起きなかった週の出来事は空になる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, 5);
    const after = resolveWeek(data, state, { cards: ['nichijou#1'], targets: {} }).state;
    expect(after.log[after.log.length - 1]!.events).toEqual([]);
  });
});

describe('物語10類型の事後判定（v6.8）', () => {
  it('10類型すべてが定義されており、IDが重複していない', () => {
    expect(STORY_TYPES).toHaveLength(10);
    expect(new Set(STORY_TYPES.map((t) => t.id)).size).toBe(10);
  });

  it('師弟の別れ＋意志を継ぐ者で〈通過儀礼〉になる', () => {
    const run = runWithLog([{ comboIds: ['shitei_no_wakare'] }, { comboIds: ['densho'] }]);
    expect(detectStoryType(data, run)?.id).toBe('rites_of_passage');
  });

  it('伏線回収を2回以上で〈動機の在処〉になる', () => {
    const run = runWithLog([{ comboIds: ['fukusen_kaishu'] }, { comboIds: ['fukusen_kaishu'] }]);
    expect(detectStoryType(data, run)?.id).toBe('whydunit');
  });

  it('主役級でない者の見せ場＋ジャイアントキリングで〈愚者の勝利〉になる', () => {
    const run = runWithLog([{ comboIds: ['igai_no_katsuyaku'] }, { comboIds: ['giant_killing'] }]);
    expect(detectStoryType(data, run)?.id).toBe('fool_triumphant');
  });

  it('覚醒＋能力覚醒で〈選ばれし者〉になる', () => {
    const run = runWithLog([{ comboIds: ['keishou_no_kakusei'], playedDefinitionIds: ['nouryoku_kakusei'] }]);
    expect(detectStoryType(data, run)?.id).toBe('superhero');
  });

  it('組織の掟＋おかえりで〈組織の掟〉になる', () => {
    const run = runWithLog([{ playedDefinitionIds: ['soshiki_no_okite'] }, { playedDefinitionIds: ['okaeri'] }]);
    expect(detectStoryType(data, run)?.id).toBe('institutionalized');
  });

  it('デビュー3回＋仲間5人で〈果てなき旅路〉になる', () => {
    const allies = ['hero', 'heroine', 'aibou', 'osananajimi', 'mascot'].map((id) => makeInstance(data, id, 1));
    const log = [1, 2, 3].map((week) => ({
      week,
      playedInstanceIds: [],
      playedDefinitionIds: ['shinchara'],
      comboIds: [],
      score: 1000,
      quota: 500,
      cleared: true,
      warningsAfter: 0,
    }));
    const run = makeState(allies, 10, { log });
    expect(detectStoryType(data, run)?.id).toBe('golden_fleece');
  });

  it('条件を満たさないランは型なし（null）', () => {
    const run = runWithLog([{ playedDefinitionIds: ['nichijou'] }]);
    expect(detectStoryType(data, run)).toBeNull();
  });

  it('複数成立したら条件の厳しい方が選ばれる', () => {
    // 〈通過儀礼〉(strictness 5) と 〈巻き込まれた男〉(strictness 2) が同時に成立する状況
    const run = runWithLog([
      { comboIds: ['shitei_no_wakare', 'ubawareta_nichijou'], playedDefinitionIds: ['dai_shouri'] },
      { comboIds: ['densho'] },
    ]);
    const type = detectStoryType(data, run)!;
    expect(type.id).toBe('rites_of_passage');
    expect(type.strictness).toBe(5);
  });

  it('判定材料は週ログから集計される（役・展開の通算回数）', () => {
    const ctx = storyTypeContext(
      data,
      runWithLog([
        { comboIds: ['fukusen_kaishu'], playedDefinitionIds: ['battle'] },
        { comboIds: ['fukusen_kaishu'], playedDefinitionIds: ['battle', 'nichijou'] },
      ]),
    );
    expect(ctx.comboCounts.get('fukusen_kaishu')).toBe(2);
    expect(ctx.playedCounts.get('battle')).toBe(2);
    expect(ctx.playedDefIds.has('nichijou')).toBe(true);
  });
});

describe('セーブ・ロード（v6.8）', () => {
  beforeEach(() => {
    clearSave();
  });

  it('保存したランをそのまま読み戻せる', () => {
    const run = makeState([makeInstance(data, 'hero', 1)], 7, { mangaTitle: '保存テスト', funds: 5 });
    expect(saveRun(run, 'play')).toBe(true);
    const loaded = loadSave();
    expect(loaded?.version).toBe(SAVE_VERSION);
    expect(loaded?.phase).toBe('play');
    expect(loaded?.run.week).toBe(7);
    expect(loaded?.run.mangaTitle).toBe('保存テスト');
    expect(loaded?.run.funds).toBe(5);
  });

  it('中断した画面（編集会議）も保存される', () => {
    saveRun(makeState([makeInstance(data, 'hero', 1)], 3), 'shop');
    expect(loadSave()?.phase).toBe('shop');
  });

  it('セーブが無ければnull', () => {
    expect(loadSave()).toBeNull();
  });

  it('clearSaveで消える', () => {
    saveRun(makeState([makeInstance(data, 'hero', 1)], 3));
    expect(loadSave()).not.toBeNull();
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('壊れたJSONが入っていてもnullを返す（クラッシュしない）', () => {
    localStorage.setItem('uchikiri-survivor:save', '{壊れている');
    expect(loadSave()).toBeNull();
  });

  it('RunStateの体をなしていないデータはnullを返す', () => {
    localStorage.setItem('uchikiri-survivor:save', JSON.stringify({ version: 1, savedAt: '', run: { week: 3 } }));
    expect(loadSave()).toBeNull();
  });

  it('未来のバージョンで保存されたセーブは読まない', () => {
    const run = makeState([makeInstance(data, 'hero', 1)], 3);
    localStorage.setItem(
      'uchikiri-survivor:save',
      JSON.stringify({ version: SAVE_VERSION + 1, savedAt: new Date().toISOString(), run }),
    );
    expect(loadSave()).toBeNull();
  });

  it('カードの状態（陣営・ゾーン・デビュー時陣営）まで保存される', () => {
    const run = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'aibou', 1, { faction: 'enemy', debutFaction: 'ally', zone: 'dead' }),
      ],
      9,
    );
    saveRun(run);
    const aibou = loadSave()!.run.cards.find((c) => c.instanceId === 'aibou#1')!;
    expect(aibou.faction).toBe('enemy');
    expect(aibou.debutFaction).toBe('ally');
    expect(aibou.zone).toBe('dead');
  });
});
