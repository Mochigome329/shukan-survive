import { describe, expect, it } from 'vitest';
import { previewScore, validateSelection } from './run';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import { gameReducer, initialGameState, type GameState } from '../state/gameReducer';

const data = loadTestData();

/** 全滅後の状態: 主人公以外3人が死亡済み、主人公も死亡済み。ライバルは開始時に仲間側を選んだ想定 */
function wipedOut(extra: string[] = []) {
  return [
    makeInstance(data, 'hero', 1, { permanentPopularityBonus: 20, zone: 'dead' }),
    makeInstance(data, 'heroine', 1, { permanentPopularityBonus: 15, zone: 'dead' }),
    makeInstance(data, 'rival', 1, { permanentPopularityBonus: 15, zone: 'dead', faction: 'ally', debutFaction: 'ally' }),
    makeInstance(data, 'aibou', 1, { permanentPopularityBonus: 10, zone: 'dead' }),
    ...extra.map((id, i) => makeInstance(data, id, i + 1)),
  ];
}

const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);

describe('全滅からの立て直し（v5.7）', () => {
  it('復活と同じ週に、復活させたキャラを対象指定できる', () => {
    const state = makeState(wipedOut(['fukkatsu', 'nouryoku_kakusei']), 21);
    const selection = {
      cards: ['fukkatsu#1', 'nouryoku_kakusei#2'],
      targets: { 'fukkatsu#1': 'hero#1', 'nouryoku_kakusei#2': 'hero#1' },
    };
    // 復活対象はまだzone='dead'だが、今週キャストに加わるので対象に取れる
    expect(validateSelection(data, state, selection).ok).toBe(true);

    // 場のキャラでも復活対象でもないキャラは対象にできない
    const bad = { cards: ['fukkatsu#1', 'nouryoku_kakusei#2'], targets: { 'fukkatsu#1': 'hero#1', 'nouryoku_kakusei#2': 'rival#1' } };
    expect(validateSelection(data, state, bad).ok).toBe(false);
  });

  it('「新キャラ登場」でデビューさせたキャラも同じ週に対象指定できる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'shukuteki', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'sainou_no_henrin', 1),
    ];
    const state = makeState(cards, 5);
    const selection = {
      cards: ['shinchara#1', 'sainou_no_henrin#1'],
      targets: { 'shinchara#1': 'shukuteki#1', 'sainou_no_henrin#1': 'shukuteki#1' },
    };
    expect(validateSelection(data, state, selection).ok).toBe(true);
  });

  it('役「奇跡の生還」: 3人以上死亡した状態の「復活」で週スコア×3', () => {
    const state = makeState(wipedOut(['fukkatsu', 'dai_shouri']), 21, { stress: 2 });
    const b = previewScore(data, state, { cards: ['fukkatsu#1', 'dai_shouri#2'], targets: { 'fukkatsu#1': 'hero#1' } });
    expect(applied(b)).toContain('奇跡の生還');

    // 死亡が2人だけなら成立しない
    const few = makeState(
      [
        makeInstance(data, 'hero', 1, { zone: 'dead' }),
        makeInstance(data, 'heroine', 1, { zone: 'dead' }),
        makeInstance(data, 'rival', 1),
        makeInstance(data, 'fukkatsu', 1),
      ],
      21,
    );
    expect(applied(previewScore(data, few, { cards: ['fukkatsu#1'], targets: { 'fukkatsu#1': 'hero#1' } }))).not.toContain('奇跡の生還');
  });

  it('役「背水の陣」: キャストがひとりの状態で「バトル」を描くとそのキャラの人気度×3', () => {
    const cards = [
      makeInstance(data, 'hero', 1, { permanentPopularityBonus: 20 }),
      makeInstance(data, 'heroine', 1, { zone: 'dead' }),
      makeInstance(data, 'battle', 1),
    ];
    const b = previewScore(data, makeState(cards, 21), { cards: ['battle#1'], targets: {} });
    expect(applied(b)).toContain('背水の陣');
    expect(b.popularityTotal).toBe((10 + 20) * 3);

    // ふたり以上いれば成立しない
    const two = [...cards, makeInstance(data, 'rival', 1)];
    expect(applied(previewScore(data, makeState(two, 21), { cards: ['battle#1'], targets: {} }))).not.toContain('背水の陣');
  });

  it('画面上でも、復活させたキャラを強化カードの対象にタップできる', () => {
    // 死亡2人・場1人。復活の対象が2択なので自動割当されず、タップ待ちになる
    const cards = [
      makeInstance(data, 'hero', 1, { zone: 'dead' }),
      makeInstance(data, 'heroine', 1, { zone: 'dead' }),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'fukkatsu', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
    ];
    let state: GameState = { ...initialGameState(data), screen: 'play', run: makeState(cards, 21) };

    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'fukkatsu#1' });
    expect(state.pendingTargetDev).toBe('fukkatsu#1'); // 復活の対象待ち
    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'hero#1' });
    expect(state.selection.targets['fukkatsu#1']).toBe('hero#1');

    // 能力覚醒を足すと、場のライバルと「今週復活する主人公」の2択になる
    state = gameReducer(state, { type: 'tapHandCard', instanceId: 'nouryoku_kakusei#1' });
    expect(state.pendingTargetDev).toBe('nouryoku_kakusei#1');
    state = gameReducer(state, { type: 'tapCastChar', instanceId: 'hero#1' });
    expect(state.selection.targets['nouryoku_kakusei#1']).toBe('hero#1');
    expect(state.pendingTargetDev).toBeNull();
    expect(validateSelection(data, state.run!, state.selection).ok).toBe(true);
  });

  it('「夢オチ」は戻ってきた全員を今週のキャストに数える', () => {
    const state = makeState(wipedOut(['yumeochi']), 21);
    const b = computeScore({
      data,
      cards: state.cards,
      week: 21,
      selection: { cards: ['yumeochi#1'], targets: {} },
      stress: 0,
    });
    // 4人分の人気度（10+20 / 12+15 / 15+15 / 8+10 = 105）で採点される。
    // 数えていなかった頃はキャスト0人扱いで下限1点だった
    expect(b.popularityTotal).toBe(105);

    // 夢オチには「奇跡の生還」の倍率は乗らない（全員まとめて戻る分が既に大きい）
    expect(applied(b)).not.toContain('奇跡の生還');
  });
});
