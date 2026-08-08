import { describe, expect, it } from 'vitest';
import { resolveWeek } from './run';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const applied = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'applied').map((c) => c.name);
const suppressed = (b: { combos: { name: string; status: string }[] }) =>
  b.combos.filter((c) => c.status === 'suppressed').map((c) => c.name);

function score(cards: ReturnType<typeof makeInstance>[], play: string[], targets: Record<string, string> = {}, week = 20) {
  const state = makeState(cards, week);
  return computeScore({ data, cards: state.cards, week, selection: { cards: play, targets } });
}

describe('慟哭・復讐鬼（v7.24）', () => {
  it('仲間のヒロインの死亡で「慟哭」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'shibou', 1)];
    const b = score(cards, ['shibou#1'], { 'shibou#1': 'heroine#1' });
    expect(applied(b)).toContain('慟哭');
  });

  it('敵になったヒロインの死亡では「慟哭」は成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { faction: 'enemy' }),
      makeInstance(data, 'shibou', 1),
    ];
    const b = score(cards, ['shibou#1'], { 'shibou#1': 'heroine#1' });
    expect(applied(b)).not.toContain('慟哭');
  });

  it('主人公の死亡では「慟哭」は成立しない（対象外のキャラ）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shibou', 1)];
    const b = score(cards, ['shibou#1'], { 'shibou#1': 'hero#1' });
    expect(applied(b)).not.toContain('慟哭');
  });

  it('相棒の自己犠牲と同じ週に主人公を対象に闇堕ちで「復讐鬼」が成立し、慟哭とダークヒーローを抑制する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'jiko_gisei', 1),
      makeInstance(data, 'yamiochi', 1),
    ];
    const b = score(cards, ['jiko_gisei#1', 'yamiochi#1'], { 'jiko_gisei#1': 'aibou#1', 'yamiochi#1': 'hero#1' });
    expect(applied(b)).toContain('復讐鬼');
    expect(applied(b)).not.toContain('慟哭');
    expect(applied(b)).not.toContain('ダークヒーロー');
    expect(suppressed(b)).toEqual(expect.arrayContaining(['慟哭', 'ダークヒーロー']));
    // 主人公が闇堕ちしても実際の陣営は変わらない仕様（v6.2）とも矛盾しない
    expect(b.stateChanges.some((c) => c.type === 'flipFaction' && c.instanceId === 'hero#1')).toBe(false);
  });

  it('闇堕ちだけでヒロイン/相棒の死亡が無ければ、復讐鬼ではなくダークヒーローが成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'yamiochi', 1)];
    const b = score(cards, ['yamiochi#1'], { 'yamiochi#1': 'hero#1' });
    expect(applied(b)).toContain('ダークヒーロー');
    expect(applied(b)).not.toContain('復讐鬼');
  });
});

describe('なくした絆・取り戻した絆（v7.24）', () => {
  it('仲間の幼なじみへの記憶喪失で「なくした絆」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'osananajimi', 1), makeInstance(data, 'kioku_soushitsu', 1)];
    const b = score(cards, ['kioku_soushitsu#1'], { 'kioku_soushitsu#1': 'osananajimi#1' });
    expect(applied(b)).toContain('なくした絆');
  });

  it('ライバル（対象外のキャラ）への記憶喪失では成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'kioku_soushitsu', 1)];
    const b = score(cards, ['kioku_soushitsu#1'], { 'kioku_soushitsu#1': 'rival#1' });
    expect(applied(b)).not.toContain('なくした絆');
  });

  it('記憶喪失していた相棒に「おかえり」を使うと「取り戻した絆」が成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { lostFlags: { training: 0, love: false } }),
      makeInstance(data, 'okaeri', 1),
    ];
    const b = score(cards, ['okaeri#1'], { 'okaeri#1': 'aibou#1' });
    expect(applied(b)).toContain('取り戻した絆');
  });

  it('記憶喪失していないキャラに「おかえり」を使っても成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'okaeri', 1)];
    const b = score(cards, ['okaeri#1'], { 'okaeri#1': 'aibou#1' });
    expect(applied(b)).not.toContain('取り戻した絆');
  });

  it('記憶喪失→おかえりを実際に1週プレイして流すと、フラグが戻り絆も成立する（結線確認）', () => {
    // training は「出演するだけで自動消費される」既存仕様（v5.6）があるので、
    // 記憶喪失と無関係に0になる。ここでは love だけで確認する
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { flags: { training: 0, love: true } }),
      makeInstance(data, 'kioku_soushitsu', 1),
    ];
    const week1 = resolveWeek(data, makeState(cards, 10), { cards: ['kioku_soushitsu#1'], targets: { 'kioku_soushitsu#1': 'heroine#1' } });
    const afterLoss = week1.state.cards.find((c) => c.instanceId === 'heroine#1')!;
    expect(afterLoss.flags).toEqual({ training: 0, love: false });
    expect(afterLoss.lostFlags).toEqual({ training: 0, love: true });

    const stateWithOkaeri = { ...week1.state, cards: [...week1.state.cards, makeInstance(data, 'okaeri', 1)] };
    const week2 = resolveWeek(data, makeState(stateWithOkaeri.cards, 11), { cards: ['okaeri#1'], targets: { 'okaeri#1': 'heroine#1' } });
    expect(applied(week2.breakdown)).toContain('取り戻した絆');
    const restored = week2.state.cards.find((c) => c.instanceId === 'heroine#1')!;
    expect(restored.flags).toEqual({ training: 0, love: true });
    expect(restored.lostFlags).toBeUndefined();
  });
});

describe('俺に任せて先へ・能ある鷹は（v7.24）', () => {
  it('相棒の自己犠牲で成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'jiko_gisei', 1)];
    const b = score(cards, ['jiko_gisei#1'], { 'jiko_gisei#1': 'aibou#1' });
    expect(applied(b)).toContain('俺に任せて先へ');
  });

  it('主人公の自己犠牲では成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'jiko_gisei', 1)];
    const b = score(cards, ['jiko_gisei#1'], { 'jiko_gisei#1': 'hero#1' });
    expect(applied(b)).not.toContain('俺に任せて先へ');
  });

  it('三枚目の覚醒で「能ある鷹は」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'sanmaime', 1), makeInstance(data, 'kakusei', 1)];
    const b = score(cards, ['kakusei#1'], { 'kakusei#1': 'sanmaime#1' });
    expect(applied(b)).toContain('能ある鷹は');
  });

  it('敵になった三枚目の覚醒では成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'sanmaime', 1, { faction: 'enemy' }), makeInstance(data, 'kakusei', 1)];
    const b = score(cards, ['kakusei#1'], { 'kakusei#1': 'sanmaime#1' });
    expect(applied(b)).not.toContain('能ある鷹は');
  });
});

describe('相棒・三枚目まわりの簡易役（v7.24）', () => {
  it('阿吽の呼吸: 相棒がいる状態でバトル', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'battle', 1)];
    expect(applied(score(cards, ['battle#1']))).toContain('阿吽の呼吸');
  });

  it('悪友: 相棒と三枚目がいる状態で日常回', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'sanmaime', 1), makeInstance(data, 'nichijou', 1)];
    expect(applied(score(cards, ['nichijou#1']))).toContain('悪友');
  });

  it('悪友: 三枚目が敵に回っていると成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'sanmaime', 1, { faction: 'enemy' }),
      makeInstance(data, 'nichijou', 1),
    ];
    expect(applied(score(cards, ['nichijou#1']))).not.toContain('悪友');
  });

  it('切磋琢磨: 相棒か三枚目がいる状態で修行', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'sanmaime', 1), makeInstance(data, 'shugyou', 1)];
    const b = score(cards, ['shugyou#1'], { 'shugyou#1': 'hero#1' });
    expect(applied(b)).toContain('切磋琢磨');
  });

  it('息抜き: 相棒がいる状態で骨休め', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'honeyasume', 1)];
    expect(applied(score(cards, ['honeyasume#1']))).toContain('息抜き');
  });
});

describe('禁断の力まわりの役（v7.24）', () => {
  it('同じキャラに禁断の力+能力覚醒で「代償ある力」が成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'kindan_no_chikara', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
    ];
    const b = score(cards, ['kindan_no_chikara#1', 'nouryoku_kakusei#1'], {
      'kindan_no_chikara#1': 'hero#1',
      'nouryoku_kakusei#1': 'hero#1',
    });
    expect(applied(b)).toContain('代償ある力');
  });

  it('別々のキャラに禁断の力と能力覚醒を使っても成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'kindan_no_chikara', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
    ];
    const b = score(cards, ['kindan_no_chikara#1', 'nouryoku_kakusei#1'], {
      'kindan_no_chikara#1': 'hero#1',
      'nouryoku_kakusei#1': 'aibou#1',
    });
    expect(applied(b)).not.toContain('代償ある力');
  });

  it('同じキャラに禁断の力+武器ゲットで「破壊兵器」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'kindan_no_chikara', 1), makeInstance(data, 'buki_get', 1)];
    const b = score(cards, ['kindan_no_chikara#1', 'buki_get#1'], { 'kindan_no_chikara#1': 'hero#1', 'buki_get#1': 'hero#1' });
    expect(applied(b)).toContain('破壊兵器');
  });

  it('敵を対象に禁断の力で「恐るべき変身」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'kindan_no_chikara', 1)];
    const b = score(cards, ['kindan_no_chikara#1'], { 'kindan_no_chikara#1': 'rival#1' });
    expect(applied(b)).toContain('恐るべき変身');
  });

  it('仲間を対象に禁断の力を使っても「恐るべき変身」は成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'kindan_no_chikara', 1)];
    const b = score(cards, ['kindan_no_chikara#1'], { 'kindan_no_chikara#1': 'hero#1' });
    expect(applied(b)).not.toContain('恐るべき変身');
  });

  it('マスコットとヒロインが両方覚醒すると「変身」が成立する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'mascot', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'nouryoku_kakusei', 1),
      makeInstance(data, 'kakusei', 1),
    ];
    const b = score(cards, ['nouryoku_kakusei#1', 'kakusei#1'], {
      'nouryoku_kakusei#1': 'mascot#1',
      'kakusei#1': 'heroine#1',
    });
    expect(applied(b)).toContain('変身');
  });

  it('マスコットだけ覚醒しても「変身」は成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'nouryoku_kakusei', 1)];
    const b = score(cards, ['nouryoku_kakusei#1'], { 'nouryoku_kakusei#1': 'mascot#1' });
    expect(applied(b)).not.toContain('変身');
  });
});

describe('二重スパイ（v7.24）', () => {
  it('過去に裏切られたことのないキャラでは成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, ['uragiri#1'], { 'uragiri#1': 'rival#1' });
    expect(applied(b)).not.toContain('二重スパイ');
  });

  it('betrayalCountが1以上のキャラを再び裏切ると成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1, { betrayalCount: 1 }), makeInstance(data, 'uragiri', 1)];
    const b = score(cards, ['uragiri#1'], { 'uragiri#1': 'rival#1' });
    expect(applied(b)).toContain('二重スパイ');
  });

  it('実際に2週にわたって裏切りを重ねると、2回目で成立する（結線確認）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'uragiri', 1, { instanceId: 'uragiri#1' })];
    const week1 = resolveWeek(data, makeState(cards, 10), { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } });
    expect(applied(week1.breakdown)).not.toContain('二重スパイ');
    const rivalAfter1 = week1.state.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rivalAfter1.betrayalCount).toBe(1);

    const stateWithSecondUragiri = { ...week1.state, cards: [...week1.state.cards, makeInstance(data, 'uragiri', 2)] };
    const week2 = resolveWeek(data, makeState(stateWithSecondUragiri.cards, 11), {
      cards: ['uragiri#2'],
      targets: { 'uragiri#2': 'rival#1' },
    });
    expect(applied(week2.breakdown)).toContain('二重スパイ');
    const rivalAfter2 = week2.state.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rivalAfter2.betrayalCount).toBe(2);
  });

  it('洗脳は裏切りカウントに数えない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'sennou', 1)];
    const result = resolveWeek(data, makeState(cards, 10), { cards: ['sennou#1'], targets: { 'sennou#1': 'rival#1' } });
    const rival = result.state.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rival.betrayalCount ?? 0).toBe(0);
  });
});

describe('サポーター・奪還（v7.24）', () => {
  it('マスコットがいる状態で日常回だと「サポーター」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'nichijou', 1)];
    expect(applied(score(cards, ['nichijou#1']))).toContain('サポーター');
  });

  it('母がいる状態で日常回だと「サポーター」と「おふくろの味」が両方成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'haha', 1), makeInstance(data, 'nichijou', 1)];
    const b = score(cards, ['nichijou#1']);
    expect(applied(b)).toContain('サポーター');
    expect(applied(b)).toContain('おふくろの味');
  });

  it('ヒロインがいる状態で救出だと「奪還」が成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'kyuushutsu', 1)];
    expect(applied(score(cards, ['kyuushutsu#1']))).toContain('奪還');
  });

  it('ヒロインも母もいない状態で救出しても「奪還」は成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'kyuushutsu', 1)];
    expect(applied(score(cards, ['kyuushutsu#1']))).not.toContain('奪還');
  });
});
