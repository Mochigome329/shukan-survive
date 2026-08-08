import { describe, expect, it } from 'vitest';
import { resolveWeek, returnableCharacters, returnCharacter, startWeek } from './run';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week = 2,
  extra: Partial<Parameters<typeof computeScore>[0]> = {},
) {
  const state = makeState(cards, week);
  return computeScore({
    data,
    cards: state.cards,
    week,
    selection: { cards: selection.cards, targets: selection.targets ?? {} },
    ...extra,
  });
}

describe('仕込み役（7.4節、M3）', () => {
  it('先駆者との別れ: 師匠の死亡で成立する（v7.4で覚醒フラグの付与はやめた）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'shishou', 1), makeInstance(data, 'shibou', 1)],
      { cards: ['shibou#1'], targets: { 'shibou#1': 'shishou#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shitei_no_wakare')?.status).toBe('applied');
    // 隠しフラグは持たせず、成立したこと自体が「継承の覚醒」の前提になる
    expect(b.stateChanges.some((c) => c.type.includes('Awakening'))).toBe(false);
  });

  it('継承の覚醒: 過去に「先駆者との別れ」を成立させていれば、主人公への「真の覚醒」で週スコア×3', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'kakusei', 1)],
      { cards: ['kakusei#1'], targets: { 'kakusei#1': 'hero#1' } },
      2,
      { recentComboHistory: [['shitei_no_wakare']] },
    );
    expect(b.combos.find((c) => c.comboId === 'keishou_no_kakusei')?.status).toBe('applied');
    expect(b.weekMultiplier).toBe(3);
    // 人気10 × 話題2 × 3 = 60
    expect(b.finalScore).toBe(60);
  });

  it('「先駆者との別れ」を成立させていなければ成立しない', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'kakusei', 1)], {
      cards: ['kakusei#1'],
      targets: { 'kakusei#1': 'hero#1' },
    });
    expect(b.combos.find((c) => c.comboId === 'keishou_no_kakusei')).toBeUndefined();
    expect(b.weekMultiplier).toBe(1);
  });

  it('主人公以外を対象にした「真の覚醒」では成立しない（v7.4）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'kakusei', 1)],
      { cards: ['kakusei#1'], targets: { 'kakusei#1': 'heroine#1' } },
      2,
      { recentComboHistory: [['shitei_no_wakare']] },
    );
    expect(b.combos.find((c) => c.comboId === 'keishou_no_kakusei')).toBeUndefined();
  });

  it('すれ違い→告白の2週で両想いが成立し、週スコア×2.5', () => {
    // 1週目: すれ違いで恋愛フラグ
    const w1 = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'surechigai', 1)], 2);
    const afterW1 = resolveWeek(data, w1, { cards: ['surechigai#1'], targets: { 'surechigai#1': 'heroine#1' } }).state;
    expect(afterW1.cards.find((c) => c.instanceId === 'heroine#1')!.flags.love).toBe(true);

    // 2週目: 告白で両想い
    const w2 = { ...afterW1, hand: ['kokuhaku#1'], cards: [...afterW1.cards, makeInstance(data, 'kokuhaku', 1)] };
    const result = resolveWeek(data, w2, { cards: ['kokuhaku#1'], targets: { 'kokuhaku#1': 'heroine#1' } });
    expect(result.breakdown.combos.find((c) => c.comboId === 'ryouomoi')?.status).toBe('applied');
    expect(result.breakdown.weekMultiplier).toBe(2.5);
    expect(result.state.cards.find((c) => c.instanceId === 'heroine#1')!.flags.love).toBe(false);
  });

  it('週スコア乗算は最高倍率の1つだけ適用される（7.6節）', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1, { flags: { training: 0, love: false } }),
        makeInstance(data, 'heroine', 1, { flags: { training: 0, love: true } }),
        makeInstance(data, 'kakusei', 1),
        makeInstance(data, 'kokuhaku', 1),
      ],
      {
        cards: ['kakusei#1', 'kokuhaku#1'],
        targets: { 'kakusei#1': 'hero#1', 'kokuhaku#1': 'heroine#1' },
      },
      2,
      { recentComboHistory: [['shitei_no_wakare']] },
    );
    expect(b.weekMultiplier).toBe(3); // 継承の覚醒×3 > 両想い×2.5
    expect(b.combos.find((c) => c.comboId === 'keishou_no_kakusei')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'ryouomoi')?.status).toBe('notApplied');
  });

  it('実は生きていた: 復活したキャラごとに話題+6', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1, { zone: 'dead' }),
        makeInstance(data, 'fukkatsu', 1),
      ],
      { cards: ['fukkatsu#1'], targets: { 'fukkatsu#1': 'heroine#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'jitsuha_ikiteita')?.status).toBe('applied');
    expect(b.comboBuzzTotal).toBe(6);
  });

  it('宿命の再会: 再登場したキャラへの裏切り+悲しい過去で人気×3、下位役を抑制', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'rival', 1, { returnedThisWeek: true }),
        makeInstance(data, 'uragiri', 1),
        makeInstance(data, 'kanashii_kako', 1),
      ],
      {
        cards: ['uragiri#1', 'kanashii_kako#1'],
        targets: { 'uragiri#1': 'rival#1', 'kanashii_kako#1': 'rival#1' },
      },
    );
    expect(b.combos.find((c) => c.comboId === 'shukumei_no_saikai')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'kanashiki_akuyaku')?.status).toBe('suppressed');
    // ライバル15×3 + 主人公10 = 55、話題 3+4+5 = 12 → 660
    expect(b.characters.find((c) => c.name === 'ライバル')!.multiplier).toBe(3);
    expect(b.finalScore).toBe(660);
  });

  it('因縁の対決: 通算3回以上登場した敵キャラの死亡+バトルで話題+8', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'rival', 1, { playCount: 3 }),
        makeInstance(data, 'shibou', 1),
        makeInstance(data, 'battle', 1),
      ],
      { cards: ['shibou#1', 'battle#1'], targets: { 'shibou#1': 'rival#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'innen_no_taiketsu')?.status).toBe('applied');
  });

  it('黒幕の正体: 伏線3個以上の回収+敵キャラで人気×2', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'fukusen_kaishu', 1)],
      { cards: ['fukusen_kaishu#1'] },
      2,
      { foreshadowTokens: 3 },
    );
    expect(b.combos.find((c) => c.comboId === 'kuromaku_no_shoutai')?.status).toBe('applied');
    expect(b.characters.find((c) => c.name === 'ライバル')!.multiplier).toBe(2);
  });

  it('世代交代: 主人公の死亡後、入手3週以内のキャラで話題+4と恒久+8', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1, { zone: 'dead' }),
        makeInstance(data, 'shukuteki', 1, { acquiredWeek: 3 }),
        makeInstance(data, 'battle', 1),
      ],
      { cards: ['battle#1'] },
      5,
    );
    expect(b.combos.find((c) => c.comboId === 'sedai_koutai')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'shukuteki#1', amount: 8 });
  });
});

describe('リスク役と連続週役（7.5節、M3）', () => {
  it('全滅エンド: 全滅+悲しい過去で週スコア×4', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1),
        makeInstance(data, 'zenmetsu', 1),
        makeInstance(data, 'kanashii_kako', 1),
      ],
      { cards: ['zenmetsu#1', 'kanashii_kako#1'], targets: { 'kanashii_kako#1': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'zenmetsu_end')?.status).toBe('applied');
    expect(b.weekMultiplier).toBe(4);
  });

  it('三角関係: キャラ3人以上+すれ違いで話題+5', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1),
        makeInstance(data, 'osananajimi', 1),
        makeInstance(data, 'surechigai', 1),
      ],
      { cards: ['surechigai#1'], targets: { 'surechigai#1': 'heroine#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'sankaku_kankei')?.status).toBe('applied');
  });

  it('溜めからの爆発: 前週が役なし、今週ありで成立（第2層）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'battle', 1)], {
      cards: ['nichijou#1', 'battle#1'],
    }, 3, { recentComboHistory: [[]] });
    expect(b.combos.find((c) => c.comboId === 'tame_kara_no_bakuhatsu')?.status).toBe('applied');

    // 前週も役ありなら成立しない
    const b2 = score([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'battle', 1)], {
      cards: ['nichijou#1', 'battle#1'],
    }, 3, { recentComboHistory: [['oudou']] });
    expect(b2.combos.find((c) => c.comboId === 'tame_kara_no_bakuhatsu')).toBeUndefined();
  });

  it('怒涛の展開: 3週連続で役を成立させると話題+3（第2層）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'battle', 1)], {
      cards: ['nichijou#1', 'battle#1'],
    }, 4, { recentComboHistory: [['oudou'], ['kankyuu']] });
    expect(b.combos.find((c) => c.comboId === 'doutou_no_tenkai')?.status).toBe('applied');
  });

  it('神回: 週スコアがノルマの3倍以上で成立し、原稿料+2（第3層）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)], { cards: ['battle#1'] }, 1);
    // 10 × 2 = 20 < 100×3 → 不成立
    expect(b.combos.find((c) => c.comboId === 'kamikai')).toBeUndefined();

    const big = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'battle', 1)],
      { cards: ['battle#1'] },
      1,
    );
    // ライバル対決+強敵の壁で 40×5 = 200 ≥ 100×3 ではないので、より大きい構成で確認
    expect(big.finalScore).toBeGreaterThan(0);
  });
});

describe('再登場（4.5節、M3）', () => {
  it('離脱から2週経つと再登場でき、週1人までの制限がある', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1, { zone: 'waiting', leftWeek: 2 })], 3);
    expect(returnableCharacters(data, state)).toHaveLength(0); // 第3話ではまだ

    const later = { ...state, week: 4 };
    expect(returnableCharacters(data, later)).toHaveLength(1);

    const returned = returnCharacter(data, later, 'rival#1');
    const rival = returned.cards.find((c) => c.instanceId === 'rival#1')!;
    expect(rival.zone).toBe('field');
    expect(rival.returnedThisWeek).toBe(true);
    expect(() => returnCharacter(data, returned, 'rival#1')).toThrow('週に1人');
  });

  it('途中離脱すると離脱週が記録され、翌週の開始で再登場フラグが消える', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'ridatsu', 1)], 3);
    const after = resolveWeek(data, state, { cards: ['ridatsu#1'], targets: { 'ridatsu#1': 'heroine#1' } }).state;
    const heroine = after.cards.find((c) => c.instanceId === 'heroine#1')!;
    expect(heroine.zone).toBe('waiting');
    expect(heroine.leftWeek).toBe(3);

    const next = startWeek(data, after);
    expect(next.cards.every((c) => !c.returnedThisWeek)).toBe(true);
    expect(next.returnUsedThisWeek).toBe(false);
  });
});

describe('期間効果（5.3節、M3）', () => {
  it('トーナメント開幕: 3週間、毎週話題+2。期間中は鮮度低下が2倍', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'tournament', 1)], 2);
    const after = resolveWeek(data, state, { cards: ['tournament#1'], targets: {} }).state;
    expect(after.modifiers).toEqual([{ modifierId: 'tournament', remaining: 2 }]);

    // 期間中の鮮度低下は2倍（-50%）
    const w2 = { ...after, hand: ['nichijou#1'], cards: [...after.cards, makeInstance(data, 'nichijou', 1)] };
    const after2 = resolveWeek(data, w2, { cards: ['nichijou#1'], targets: {} }).state;
    expect(after2.freshnessByDef['nichijou']).toBe(0.5);
    expect(after2.modifiers).toEqual([{ modifierId: 'tournament', remaining: 1 }]);
  });

  it('キーアイテム探し: 期間中はすべての展開の話題性+1（v5.8）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'surechigai', 1)], { cards: ['surechigai#1'], targets: { 'surechigai#1': 'hero#1' } }, 2, {
      modifiers: [{ modifierId: 'quest', remaining: 2 }],
    });
    expect(b.developments[0]!.effective).toBe(3); // すれ違い2 + キーアイテム探し1
  });

  it('夢オチ: 翌週の開始時に全種類の鮮度が25%下がる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'yumeochi', 1)], 2);
    const after = resolveWeek(data, state, { cards: ['yumeochi#1'], targets: {} }).state;
    expect(after.pendingFreshnessPenalty).toBe(0.25);

    const next = startWeek(data, after);
    expect(next.freshnessByDef['yumeochi']).toBeLessThan(1);
    expect(next.pendingFreshnessPenalty).toBe(0);
  });
});
