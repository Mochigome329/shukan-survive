import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week: number,
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

describe('第3部専用役（第17話以降限定、design_finale.md 5節）', () => {
  it('最終決戦: 第17話以降、バトル+総力戦で話題+10（v7.4で条件変更）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'souryokusen', 1),
    ];
    const sel = { cards: ['battle#1', 'souryokusen#1'] };
    expect(score(cards, sel, 17).combos.find((c) => c.comboId === 'saishuu_kessen')?.status).toBe('applied');
    // 第16話以前は成立しない
    expect(score(cards, sel, 16).combos.find((c) => c.comboId === 'saishuu_kessen')).toBeUndefined();
    // 総力戦がなければ成立しない
    const noAllOut = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'battle', 1)];
    expect(score(noAllOut, { cards: ['battle#1'] }, 17).combos.find((c) => c.comboId === 'saishuu_kessen')).toBeUndefined();
  });

  it('暗雲立ち込める: 旧「最終決戦」の条件（バトル+大ピンチ/敗北+場に敵）を引き取った（v7.4）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'dai_pinch', 1),
    ];
    const sel = { cards: ['battle#1', 'dai_pinch#1'] };
    const b = score(cards, sel, 17);
    expect(b.combos.find((c) => c.comboId === 'anun_tachikomeru')?.status).toBe('applied');
    // 最終決戦のほうはもう成立しない
    expect(b.combos.find((c) => c.comboId === 'saishuu_kessen')).toBeUndefined();
    // 第16話以前は成立しない
    expect(score(cards, sel, 16).combos.find((c) => c.comboId === 'anun_tachikomeru')).toBeUndefined();
    // 敵がいなければ成立しない
    const noEnemy = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'dai_pinch', 1)];
    expect(score(noEnemy, sel, 17).combos.find((c) => c.comboId === 'anun_tachikomeru')).toBeUndefined();
  });

  it('世界の危機: 第17話以降、敵組織の襲来+大ピンチで話題+9', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'teki_soshiki', 1), makeInstance(data, 'dai_pinch', 1)];
    const sel = { cards: ['teki_soshiki#1', 'dai_pinch#1'] };
    expect(score(cards, sel, 18).combos.find((c) => c.comboId === 'sekai_no_kiki')?.status).toBe('applied');
    expect(score(cards, sel, 10).combos.find((c) => c.comboId === 'sekai_no_kiki')).toBeUndefined();
  });

  it('因縁の清算: 通算5回登場した敵の死亡で週スコア×2。因縁の対決を抑制する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1, { playCount: 5 }), makeInstance(data, 'shibou', 1)];
    const sel = { cards: ['shibou#1'], targets: { 'shibou#1': 'rival#1' } };
    const b = score(cards, sel, 19);
    expect(b.combos.find((c) => c.comboId === 'innen_no_seisan')?.status).toBe('applied');
    expect(b.weekMultiplier).toBe(2);

    // 3回登場（因縁の対決の条件は満たすが、清算の5回には届かない）第17話以降でも清算は不成立
    const three = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1, { playCount: 3 }),
      makeInstance(data, 'shibou', 1),
      makeInstance(data, 'battle', 1),
    ];
    const sel3 = { cards: ['shibou#1', 'battle#1'], targets: { 'shibou#1': 'rival#1' } };
    const b2 = score(three, sel3, 19);
    expect(b2.combos.find((c) => c.comboId === 'innen_no_seisan')).toBeUndefined();
    expect(b2.combos.find((c) => c.comboId === 'innen_no_taiketsu')?.status).toBe('applied');
  });

  it('総力の結集: 第17話以降、キャスト5人+総力戦。通常の総力戦を抑制する', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'osananajimi', 1),
      makeInstance(data, 'souryokusen', 1),
    ];
    const sel = { cards: ['souryokusen#1'] };
    const b = score(cards, sel, 20);
    expect(b.combos.find((c) => c.comboId === 'souryoku_no_kesshuu')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'souryokusen_combo')?.status).toBe('suppressed');

    // 第16話以前は通常の総力戦のみ成立する（4人以上の条件）
    const b2 = score(cards, sel, 10);
    expect(b2.combos.find((c) => c.comboId === 'souryoku_no_kesshuu')).toBeUndefined();
    expect(b2.combos.find((c) => c.comboId === 'souryokusen_combo')?.status).toBe('applied');
  });

  it('決意の別れ: 第17話以降、同じキャラに途中離脱+悲しい過去で話題+7', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'ridatsu', 1), makeInstance(data, 'kanashii_kako', 1)];
    const sel = { cards: ['ridatsu#1', 'kanashii_kako#1'], targets: { 'ridatsu#1': 'heroine#1', 'kanashii_kako#1': 'heroine#1' } };
    expect(score(cards, sel, 21).combos.find((c) => c.comboId === 'ketsui_no_wakare')?.status).toBe('applied');

    // 対象が別キャラなら成立しない
    const cards2 = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'ridatsu', 1), makeInstance(data, 'kanashii_kako', 1)];
    const sel2 = { cards: ['ridatsu#1', 'kanashii_kako#1'], targets: { 'ridatsu#1': 'heroine#1', 'kanashii_kako#1': 'rival#1' } };
    expect(score(cards2, sel2, 21).combos.find((c) => c.comboId === 'ketsui_no_wakare')).toBeUndefined();
  });

  it('最後の修行: 第17話以降、修行+能力覚醒で人気度+20', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'shugyou', 1), makeInstance(data, 'nouryoku_kakusei', 1)];
    const sel = { cards: ['shugyou#1', 'nouryoku_kakusei#1'], targets: { 'shugyou#1': 'hero#1', 'nouryoku_kakusei#1': 'hero#1' } };
    const b = score(cards, sel, 22);
    expect(b.combos.find((c) => c.comboId === 'saigo_no_shugyou')?.status).toBe('applied');
    expect(b.popularityTotal).toBeGreaterThanOrEqual(10 + 20);
  });
});

describe('ボス週「人気投票」（10節: 話題性固定1）', () => {
  it('話題性は展開・役に関わらず1に固定され、人気度加算役と乗算役はそのまま有効', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'shugyou', 1),
    ];
    const sel = { cards: ['battle#1', 'shugyou#1'], targets: { 'shugyou#1': 'hero#1' } };
    // v7.3で人気投票は第24話から第16話へ移した（最終回直前に話題性が死ぬのを避けるため）
    const b = score(cards, sel, 16);
    // 王道+ライバル対決（人気度加算）は有効。話題性はカード分・役分含めて1固定
    expect(b.buzzApplied).toBe(1);
    expect(b.combos.find((c) => c.comboId === 'oudou')?.status).toBe('applied');
    expect(b.combos.find((c) => c.comboId === 'rival_taiketsu')?.status).toBe('applied');
    // 人気50 × 話題1 = 50
    expect(b.finalScore).toBe(50);
  });

  it('通常週（人気投票以外）は話題性が固定されない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'shugyou', 1)];
    const sel = { cards: ['battle#1', 'shugyou#1'], targets: { 'shugyou#1': 'hero#1' } };
    const b = score(cards, sel, 6);
    expect(b.buzzApplied).toBeGreaterThan(1);
  });
});
