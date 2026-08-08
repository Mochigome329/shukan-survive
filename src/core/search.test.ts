import { describe, expect, it } from 'vitest';
import { createRun, startWeek, validateSelection } from './run';
import { enumerateLegalPlays, findBestPlay } from './search';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const newRun = (seed = 1) => createRun(data, seed, { mangaTitle: 'テスト連載' });

describe('search（14.8節、v5.2）', () => {
  it('固定手札での第1話最高スコアは806（役5種の同時成立）', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'shugyou', 1),
      makeInstance(data, 'nichijou', 1),
      makeInstance(data, 'nichijou', 2),
    ]);
    const best = findBestPlay(data, state);
    expect(best).not.toBeNull();
    // バトル+修行(→主人公)+日常回×2: 人気(37+10+15)=62 × 話題(5 + 2+4) = 682
    // 平和な日常は上位役（非日常へ）に抑制される
    expect(best!.breakdown.finalScore).toBe(682);
    // 神回（第3層）はノルマの3倍以上で成立する。第1話のノルマ300では900に届かず不成立（v6.1）
    expect(best!.breakdown.combos.filter((c) => c.status === 'applied').map((c) => c.comboId).sort()).toEqual([
      'hijou_e',
      'hissatsu_hatsuhirou',
      'oudou',
      'rival_taiketsu',
    ]);
    expect(best!.breakdown.combos.filter((c) => c.status === 'suppressed').map((c) => c.comboId).sort()).toEqual([
      'heiwa_na_nichijou',
    ]);
  });

  it('控えキャラがいれば新キャラ登場のデビュー先が列挙される', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ]);
    const plays = enumerateLegalPlays(data, state);
    expect(plays.some((p) => p.targets['shinchara#1'] === 'aibou#1')).toBe(true);

    const noBench = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'shinchara', 1)]);
    expect(enumerateLegalPlays(data, noBench).some((p) => p.cards.includes('shinchara#1'))).toBe(false);
  });

  it('敵になれる控えキャラがいれば悪役会議のデビュー先も列挙される（v6.6c）', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'osananajimi', 1, { zone: 'bench' }), // flexFactionなので敵になれる
      makeInstance(data, 'akuyaku_kaigi', 1),
    ]);
    const plays = enumerateLegalPlays(data, state);
    expect(plays.some((p) => p.targets['akuyaku_kaigi#1'] === 'osananajimi#1')).toBe(true);

    // 敵になれない控えキャラ（相棒）しかいなければ悪役会議は候補に出ない
    const onlyAlly = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'akuyaku_kaigi', 1),
    ]);
    expect(enumerateLegalPlays(data, onlyAlly).some((p) => p.cards.includes('akuyaku_kaigi#1'))).toBe(false);
  });

  it('列挙された合法手はすべてvalidateSelectionを通過し、空プレイも含む', () => {
    const state = startWeek(data, newRun());
    const plays = enumerateLegalPlays(data, state);
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.some((p) => p.cards.length === 0)).toBe(true);
    for (const play of plays) {
      expect(validateSelection(data, state, play).ok).toBe(true);
    }
  });

  it('対象割当のバリエーションが場のキャスト全員分列挙される', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'shugyou', 1),
    ]);
    const plays = enumerateLegalPlays(data, state);
    const withShugyou = plays.filter((p) => p.cards.includes('shugyou#1'));
    const targets = new Set(withShugyou.map((p) => p.targets['shugyou#1']));
    expect(targets).toEqual(new Set(['hero#1', 'heroine#1']));
  });

  it('死亡済みキャラがいなければ復活入りのプレイは列挙されない', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukkatsu', 1)]);
    const plays = enumerateLegalPlays(data, state);
    expect(plays.some((p) => p.cards.includes('fukkatsu#1'))).toBe(false);
  });
});
