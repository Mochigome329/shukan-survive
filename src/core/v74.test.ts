import { describe, expect, it } from 'vitest';
import { endingBuzz, endingById, offeredEndings } from './finale';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week = 5,
) {
  const state = makeState(cards, week);
  return computeScore({
    data,
    cards: state.cards,
    week,
    selection: { cards: selection.cards, targets: selection.targets ?? {} },
  });
}

describe('無辜の犠牲（v7.4）', () => {
  it('場に「一般人」がいる状態で「悲劇」を出すと成立し、緊張が積まれる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'ippanjin', 1), makeInstance(data, 'higeki', 1)];
    const b = score(cards, { cards: ['higeki#1'] });
    expect(b.combos.find((c) => c.comboId === 'muko_no_gisei')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 1 });
  });

  it('一般人がいなければ成立しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'higeki', 1)];
    expect(score(cards, { cards: ['higeki#1'] }).combos.find((c) => c.comboId === 'muko_no_gisei')).toBeUndefined();
  });

  it('「逃げ惑う人たち」を抑制する（同じ週に大破壊も出したとき）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'ippanjin', 1),
      makeInstance(data, 'higeki', 1),
      makeInstance(data, 'daihakai', 1),
    ];
    const b = score(cards, { cards: ['higeki#1', 'daihakai#1'] });
    expect(b.combos.find((c) => c.comboId === 'muko_no_gisei')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'ippanjin_no_shiten')?.status).toBe('suppressed');
  });
});

describe('因縁の対決は「撃破」でも成立する（v7.4）', () => {
  const enemy = () => makeInstance(data, 'rival', 1, { playCount: 3 });

  it('撃破+バトルで成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), enemy(), makeInstance(data, 'battle', 1), makeInstance(data, 'gekiha', 1)];
    const b = score(cards, { cards: ['battle#1', 'gekiha#1'], targets: { 'gekiha#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'innen_no_taiketsu')?.status).toBe('applied');
  });

  it('死亡+バトルでも従来どおり成立する', () => {
    const cards = [makeInstance(data, 'hero', 1), enemy(), makeInstance(data, 'battle', 1), makeInstance(data, 'shibou', 1)];
    const b = score(cards, { cards: ['battle#1', 'shibou#1'], targets: { 'shibou#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'innen_no_taiketsu')?.status).toBe('applied');
  });

  it('登場回数が足りない敵では成立しない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { playCount: 1 }),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'gekiha', 1),
    ];
    const b = score(cards, { cards: ['battle#1', 'gekiha#1'], targets: { 'gekiha#1': 'rival#1' } });
    expect(b.combos.find((c) => c.comboId === 'innen_no_taiketsu')).toBeUndefined();
  });
});

describe('記憶喪失は「おかえり」で取り戻せる（v7.4）', () => {
  it('記憶喪失は失ったフラグをlostFlagsへ退避する', () => {
    const target = makeInstance(data, 'heroine', 1, { flags: { training: 2, love: true } });
    const cards = [makeInstance(data, 'hero', 1), target, makeInstance(data, 'kioku_soushitsu', 1)];
    const b = score(cards, { cards: ['kioku_soushitsu#1'], targets: { 'kioku_soushitsu#1': 'heroine#1' } });
    expect(b.stateChanges).toContainEqual({ type: 'clearCharFlags', instanceId: 'heroine#1' });
  });

  it('lostFlagsを持つキャラに「おかえり」を使うと取り戻す', () => {
    const target = makeInstance(data, 'heroine', 1, {
      flags: { training: 0, love: false },
      lostFlags: { training: 2, love: true },
    });
    const cards = [makeInstance(data, 'hero', 1), target, makeInstance(data, 'okaeri', 1)];
    const b = score(cards, { cards: ['okaeri#1'], targets: { 'okaeri#1': 'heroine#1' } });
    expect(b.stateChanges).toContainEqual({ type: 'restoreCharFlags', instanceId: 'heroine#1' });
  });

  it('失っていないキャラに「おかえり」を使っても復元は起きない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'okaeri', 1)];
    const b = score(cards, { cards: ['okaeri#1'], targets: { 'okaeri#1': 'heroine#1' } });
    expect(b.stateChanges.some((c) => c.type === 'restoreCharFlags')).toBe(false);
  });
});

describe('最終回まわりの見直し（v7.4b）', () => {
  const FINALE = 25;

  it('再集結は死亡済みを数えない。再登場待ちが2人以上のときだけ出る', () => {
    const dead2 = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1, { zone: 'dead' }),
        makeInstance(data, 'aibou', 1, { zone: 'dead' }),
      ],
      FINALE,
    );
    expect(offeredEndings(data, dead2).map((c) => c.id)).not.toContain('saishuuketsu');

    const waiting2 = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1, { zone: 'waiting' }),
        makeInstance(data, 'aibou', 1, { zone: 'waiting' }),
      ],
      FINALE,
    );
    expect(offeredEndings(data, waiting2).map((c) => c.id)).toContain('saishuuketsu');
  });

  it('再集結の話題性は再登場待ち1人につき+4される（説明どおりに動く）', () => {
    const state = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1, { zone: 'waiting' }),
        makeInstance(data, 'aibou', 1, { zone: 'waiting' }),
      ],
      FINALE,
    );
    // 基礎4 + 2人×4 = 12
    expect(endingBuzz(endingById('saishuuketsu')!, state)).toBe(12);
  });

  it('墓参りは「死亡済みがいる」かつ「かたき討ちを成立させた」ときだけ出る', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1, { zone: 'dead' })];
    const noCombo = makeState(cards, FINALE);
    expect(offeredEndings(data, noCombo).map((c) => c.id)).not.toContain('hakamairi');

    const withCombo = makeState(cards, FINALE, {
      log: [{ week: 1, playedInstanceIds: [], playedDefinitionIds: [], comboIds: ['katakiuchi'], score: 0, quota: 0, cleared: true, warningsAfter: 0 }],
    });
    expect(offeredEndings(data, withCombo).map((c) => c.id)).toContain('hakamairi');
    // 基礎6 + 死亡1人×3 = 9
    expect(endingBuzz(endingById('hakamairi')!, withCombo)).toBe(9);
  });

  it('受け皿の後日談は、条件つきの再集結より話題性が高くならない', () => {
    const state = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1, { zone: 'waiting' }),
        makeInstance(data, 'aibou', 1, { zone: 'waiting' }),
      ],
      FINALE,
    );
    expect(endingBuzz(endingById('gojitsudan')!, state)).toBeLessThan(endingBuzz(endingById('saishuuketsu')!, state));
  });

  it('最終回の「日常回」は「取り戻した日々」になり、「不穏な日常」を抑制する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const b = score(cards, { cards: ['nichijou#1'] }, FINALE);
    expect(b.combos.find((c) => c.comboId === 'torimodoshita_hibi')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'fuon_na_nichijou')?.status).toBe('suppressed');
  });

  it('最終回でなければ従来どおり「不穏な日常」のまま', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)];
    const b = score(cards, { cards: ['nichijou#1'] }, 20);
    expect(b.combos.find((c) => c.comboId === 'torimodoshita_hibi')).toBeUndefined();
    expect(b.combos.find((c) => c.comboId === 'fuon_na_nichijou')?.status).toBe('applied');
  });
});
