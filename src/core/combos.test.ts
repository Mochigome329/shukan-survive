import { describe, expect, it } from 'vitest';
import { computeScore } from './scoring';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

function score(
  cards: ReturnType<typeof makeInstance>[],
  selection: { cards: string[]; targets?: Record<string, string> },
  week = 1,
  extra: Partial<Parameters<typeof computeScore>[0]> = {},
) {
  const state = makeState(cards, week);
  return computeScore({ data, cards: state.cards, week, selection: { cards: selection.cards, targets: selection.targets ?? {} }, ...extra });
}

describe('話数限定・導入役（v5.2）', () => {
  it('非日常へ: 第1話に日常回+バトルで話題+4。第2話以降は緩急になる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'battle', 1)];
    const w1 = score(cards, { cards: ['nichijou#1', 'battle#1'] }, 1);
    expect(w1.combos.find((c) => c.comboId === 'hijou_e')?.status).toBe('applied');
    expect(w1.combos.find((c) => c.comboId === 'kankyuu')).toBeUndefined();

    const w2 = score(cards, { cards: ['nichijou#1', 'battle#1'] }, 2);
    expect(w2.combos.find((c) => c.comboId === 'hijou_e')).toBeUndefined();
    expect(w2.combos.find((c) => c.comboId === 'kankyuu')?.status).toBe('applied');
  });

  it('奪われた日常: 日常回+悲劇（または敵組織の襲来）で話題+5。平和な日常を抑制', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'higeki', 1)],
      { cards: ['nichijou#1', 'higeki#1'] },
      2,
    );
    expect(b.combos.find((c) => c.comboId === 'ubawareta_nichijou')?.status).toBe('applied');
    expect(b.comboBuzzTotal).toBe(5);

    const b2 = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'nichijou', 1),
        makeInstance(data, 'nichijou', 2),
        makeInstance(data, 'teki_soshiki', 1),
      ],
      { cards: ['nichijou#1', 'nichijou#2', 'teki_soshiki#1'] },
      2,
    );
    expect(b2.combos.find((c) => c.comboId === 'ubawareta_nichijou')?.status).toBe('applied');
    expect(b2.combos.find((c) => c.comboId === 'heiwa_na_nichijou')?.status).toBe('suppressed');
  });

  it('秘めた力: 能力覚醒+バトル。対象キャラの人気度が恒久+4される', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'nouryoku_kakusei', 1), makeInstance(data, 'battle', 1)],
      { cards: ['nouryoku_kakusei#1', 'battle#1'], targets: { 'nouryoku_kakusei#1': 'hero#1' } },
      2,
    );
    expect(b.combos.find((c) => c.comboId === 'himeta_chikara')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'hero#1', amount: 4 });
  });

  it('キャラの掘り下げ: 意外な一面+日常回。人気度が恒久+3される', () => {
    const b = score(
      [makeInstance(data, 'heroine', 1), makeInstance(data, 'igai_na_ichimen', 1), makeInstance(data, 'nichijou', 1)],
      { cards: ['igai_na_ichimen#1', 'nichijou#1'], targets: { 'igai_na_ichimen#1': 'heroine#1' } },
      2,
    );
    expect(b.combos.find((c) => c.comboId === 'kyara_horisage')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'heroine#1', amount: 3 });
  });

  it('心強い救援: キャスト全員の人気度が恒久+1', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'kyuuen', 1)],
      { cards: ['kyuuen#1'] },
      2,
    );
    expect(b.stateChanges.filter((c) => c.type === 'permanentPopularityAdd')).toHaveLength(2);
  });

  it('運命的な出会い: 控えキャラをデビューさせ、人気度を恒久+3', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1, { zone: 'bench' }), makeInstance(data, 'unmei_deai', 1)],
      { cards: ['unmei_deai#1'], targets: { 'unmei_deai#1': 'aibou#1' } },
      2,
    );
    expect(b.popularityTotal).toBe(18); // デビューした週から得点する
    expect(b.stateChanges).toContainEqual({ type: 'moveZone', instanceId: 'aibou#1', to: 'field' });
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'aibou#1', amount: 3 });
  });

  it('顔見せ回・旅立ちは第5話までの限定役（v5.4）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'nichijou', 1),
      makeInstance(data, 'teki_soshiki', 1),
    ];
    const sel = { cards: ['shinchara#1', 'nichijou#1', 'teki_soshiki#1'], targets: { 'shinchara#1': 'aibou#1' } };

    const early = score(cards, sel, 4);
    expect(early.combos.find((c) => c.comboId === 'kaomise')?.status).toBe('applied');
    expect(early.combos.find((c) => c.comboId === 'tabidachi')?.status).toBe('applied');

    // 第6話以降は成立しない
    const late = score(cards, sel, 6);
    expect(late.combos.find((c) => c.comboId === 'kaomise')).toBeUndefined();
    expect(late.combos.find((c) => c.comboId === 'tabidachi')).toBeUndefined();
  });

  it('ボーイミーツガール: 「運命的な出会い」でヒロイン本人をデビューさせた週に成立（v5.8b）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1, { zone: 'bench' }),
      makeInstance(data, 'unmei_deai', 1),
    ];
    const sel = { cards: ['unmei_deai#1'], targets: { 'unmei_deai#1': 'heroine#1' } };
    expect(score(cards, sel, 3).combos.find((c) => c.comboId === 'boy_meets_girl')?.status).toBe('applied');
    // 第6話以降は成立しない
    expect(score(cards, sel, 6).combos.find((c) => c.comboId === 'boy_meets_girl')).toBeUndefined();

    // 出会う相手がヒロイン以外なら成立しない（v5.8b: ここが以前は区別できていなかった）
    const other = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'heroine', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'unmei_deai', 1),
    ];
    expect(
      score(other, { cards: ['unmei_deai#1'], targets: { 'unmei_deai#1': 'mascot#1' } }, 3).combos.find(
        (c) => c.comboId === 'boy_meets_girl',
      ),
    ).toBeUndefined();
  });

  it('宿敵との邂逅: 敵キャラをデビューさせた週にバトル（v5.4）', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'shukuteki', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'battle', 1),
    ];
    const sel = { cards: ['shinchara#1', 'battle#1'], targets: { 'shinchara#1': 'shukuteki#1' } };
    expect(score(cards, sel, 4).combos.find((c) => c.comboId === 'shukuteki_tono_kaikou')?.status).toBe('applied');

    // 仲間をデビューさせても成立しない
    const ally = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'battle', 1),
    ];
    expect(
      score(ally, { cards: ['shinchara#1', 'battle#1'], targets: { 'shinchara#1': 'aibou#1' } }, 4).combos.find(
        (c) => c.comboId === 'shukuteki_tono_kaikou',
      ),
    ).toBeUndefined();
  });

  it('異能の芽生え: 主人公を対象とした能力覚醒／才能の片鱗（v5.4）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'nouryoku_kakusei', 1)];
    const onHero = { cards: ['nouryoku_kakusei#1'], targets: { 'nouryoku_kakusei#1': 'hero#1' } };
    expect(score(cards, onHero, 2).combos.find((c) => c.comboId === 'inou_no_mebae')?.status).toBe('applied');

    // 主人公以外が対象なら成立しない
    const onHeroine = { cards: ['nouryoku_kakusei#1'], targets: { 'nouryoku_kakusei#1': 'heroine#1' } };
    expect(score(cards, onHeroine, 2).combos.find((c) => c.comboId === 'inou_no_mebae')).toBeUndefined();
  });

  it('最初の試練: 第5話までのバトル+敗北で話題+5（v5.4）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'haiboku', 1)];
    const b = score(cards, { cards: ['battle#1', 'haiboku#1'] }, 3);
    expect(b.combos.find((c) => c.comboId === 'saisho_no_shiren')?.status).toBe('applied');
    expect(score(cards, { cards: ['battle#1', 'haiboku#1'] }, 7).combos.find((c) => c.comboId === 'saisho_no_shiren')).toBeUndefined();
  });

  it('師との出会い: 第5話までに師匠が場にいる状態で修行（v5.4）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'shishou', 1), makeInstance(data, 'shugyou', 1)],
      { cards: ['shugyou#1'], targets: { 'shugyou#1': 'hero#1' } },
      2,
    );
    expect(b.combos.find((c) => c.comboId === 'shi_tono_deai')?.status).toBe('applied');
  });

  it('特訓回: 修行2枚で成立', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'shugyou', 1), makeInstance(data, 'shugyou', 2)],
      { cards: ['shugyou#1', 'shugyou#2'], targets: { 'shugyou#1': 'hero#1', 'shugyou#2': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'tokkun_kai')?.status).toBe('applied');
  });

  it('平和な日常: 日常回2枚で成立', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1), makeInstance(data, 'nichijou', 2)],
      { cards: ['nichijou#1', 'nichijou#2'] },
    );
    expect(b.combos.find((c) => c.comboId === 'heiwa_na_nichijou')?.status).toBe('applied');
  });

  it('強敵の壁: 敵陣営の合計人気が仲間を上回る状態でバトル', () => {
    // 仲間: 主人公10 / 敵: 宿敵20
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'shukuteki', 1), makeInstance(data, 'battle', 1)],
      { cards: ['battle#1'] },
    );
    expect(b.combos.find((c) => c.comboId === 'kyouteki_no_kabe')?.status).toBe('applied');

    // 仲間優勢なら成立しない
    const b2 = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'mascot', 1), makeInstance(data, 'battle', 1)],
      { cards: ['battle#1'] },
    );
    expect(b2.combos.find((c) => c.comboId === 'kyouteki_no_kabe')).toBeUndefined();
  });
});

describe('基本役（7.3節、v5.2: キャラ条件は場のキャストを参照）', () => {
  it('衝撃の裏切り: 仲間キャラを対象とする裏切りで話題+4', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'uragiri', 1)],
      { cards: ['uragiri#1'], targets: { 'uragiri#1': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')?.status).toBe('applied');
    // 10 × (3 + 4) = 70
    expect(b.finalScore).toBe(70);
  });

  it('衝撃の裏切りは敵キャラへの裏切りでは成立しない', () => {
    const b = score(
      [makeInstance(data, 'rival', 1), makeInstance(data, 'uragiri', 1)],
      { cards: ['uragiri#1'], targets: { 'uragiri#1': 'rival#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shougeki_no_uragiri')).toBeUndefined();
  });

  it('悲しき悪役: 敵キャラ+悲しい過去で話題+3、そのキャラの人気度が恒久+5（v5.3b: 陣営は変えない）', () => {
    const b = score(
      [makeInstance(data, 'rival', 1), makeInstance(data, 'kanashii_kako', 1)],
      { cards: ['kanashii_kako#1'], targets: { 'kanashii_kako#1': 'rival#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'kanashiki_akuyaku')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'rival#1', amount: 5 });
    // 悲しい過去だけでは陣営は動かない
    expect(b.stateChanges.some((c) => c.type === 'flipFaction')).toBe(false);
  });

  it('改心: 敵キャラを仲間陣営にする。悲しい過去と組むと「改心の物語」（v5.3b）', () => {
    const b = score(
      [makeInstance(data, 'rival', 1), makeInstance(data, 'kaishin', 1), makeInstance(data, 'kanashii_kako', 1)],
      {
        cards: ['kaishin#1', 'kanashii_kako#1'],
        targets: { 'kaishin#1': 'rival#1', 'kanashii_kako#1': 'rival#1' },
      },
    );
    expect(b.combos.find((c) => c.comboId === 'kaishin_no_monogatari')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'flipFaction', instanceId: 'rival#1', to: 'ally' });
  });

  it('闇堕ち: 仲間キャラを敵陣営にし、緊張+1。主人公が対象なら「ダークヒーロー」（v5.3b）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'aibou', 1), makeInstance(data, 'yamiochi', 1)],
      { cards: ['yamiochi#1'], targets: { 'yamiochi#1': 'aibou#1' } },
    );
    expect(b.stateChanges).toContainEqual({ type: 'flipFaction', instanceId: 'aibou#1', to: 'enemy' });
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 1 });
  });

  it('闇堕ち: 主人公が対象でも「ダークヒーロー」は成立するが、陣営は仲間のまま変わらない（v6.2）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'yamiochi', 1)],
      { cards: ['yamiochi#1'], targets: { 'yamiochi#1': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'dark_hero')?.status).toBe('applied');
    expect(b.stateChanges).not.toContainEqual({ type: 'flipFaction', instanceId: 'hero#1', to: 'enemy' });
    expect(b.stateChanges).toContainEqual({ type: 'addStress', amount: 1 });
  });

  it('対象束縛まで一致が必要: 悲しい過去の対象が仲間なら成立しない（7.2節）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'kanashii_kako', 1)],
      { cards: ['kanashii_kako#1'], targets: { 'kanashii_kako#1': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'kanashiki_akuyaku')).toBeUndefined();
  });

  it('計算例6.5相当: 裏切り(主人公)+悲しい過去(ライバル) = 350点', () => {
    const b = score(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'rival', 1),
        makeInstance(data, 'uragiri', 1),
        makeInstance(data, 'kanashii_kako', 1),
      ],
      {
        cards: ['uragiri#1', 'kanashii_kako#1'],
        targets: { 'uragiri#1': 'hero#1', 'kanashii_kako#1': 'rival#1' },
      },
    );
    // 話題性 = 3+4(カード) + 4+3(役) = 14、キャスト人気 25 → 350
    expect(b.finalScore).toBe(350);
    // 裏切りは一時的な対立に近く、主人公が対象でも従来どおり敵陣営へ反転する（v6.2b）。
    // 陣営が変わらない例外は「闇堕ち」だけ
    expect(b.stateChanges).toContainEqual({ type: 'flipFaction', instanceId: 'hero#1', to: 'enemy' });
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'rival#1', amount: 5 });
  });

  it('ライバル対決が成立する（7.2節）', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'rival', 1), makeInstance(data, 'battle', 1)],
      { cards: ['battle#1'] },
    );
    expect(b.combos.find((c) => c.comboId === 'rival_taiketsu')?.status).toBe('applied');
    // 強敵の壁も成立（敵15 > 仲間10）: (25+15) × (2 + 3) = 200
    expect(b.combos.find((c) => c.comboId === 'kyouteki_no_kabe')?.status).toBe('applied');
    expect(b.finalScore).toBe(200);
  });

  it('必殺技初披露はラン1回。使用済みなら成立しない（5.5節）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1), makeInstance(data, 'shugyou', 1)];
    const selection = { cards: ['battle#1', 'shugyou#1'], targets: { 'shugyou#1': 'hero#1' } };
    const fresh = score(cards, selection);
    expect(fresh.combos.find((c) => c.comboId === 'hissatsu_hatsuhirou')?.status).toBe('applied');
    expect(fresh.combos.find((c) => c.comboId === 'oudou')?.status).toBe('applied');
    expect(fresh.stateChanges).toContainEqual({ type: 'permanentBuzzByDef', definitionId: 'battle', amount: 1 });

    const used = score(cards, selection, 1, { comboUsage: { oncePerRun: ['hissatsu_hatsuhirou'], perCharacter: {} } });
    expect(used.combos.find((c) => c.comboId === 'hissatsu_hatsuhirou')).toBeUndefined();
  });

  it('かませ犬: 新キャラ登場で出したキャラが同じ週に途中離脱+バトルで、場の敵の人気が恒久+5。同キャラ2回目は不成立', () => {
    const cards = [
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'ridatsu', 1),
      makeInstance(data, 'battle', 1),
    ];
    const selection = {
      cards: ['shinchara#1', 'ridatsu#1', 'battle#1'],
      targets: { 'shinchara#1': 'mascot#1', 'ridatsu#1': 'mascot#1' },
    };
    const b = score(cards, selection);
    expect(b.combos.find((c) => c.comboId === 'kamase_inu')?.status).toBe('applied');
    expect(b.stateChanges).toContainEqual({ type: 'permanentPopularityAdd', instanceId: 'rival#1', amount: 5 });

    const used = score(cards, selection, 1, { comboUsage: { oncePerRun: [], perCharacter: { kamase_inu: ['mascot#1'] } } });
    expect(used.combos.find((c) => c.comboId === 'kamase_inu')).toBeUndefined();
  });

  it('かませ犬: 新キャラ登場だけで途中離脱していないキャラは対象にならない（不成立）', () => {
    const cards = [
      makeInstance(data, 'rival', 1),
      makeInstance(data, 'mascot', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
      makeInstance(data, 'battle', 1),
    ];
    const selection = { cards: ['shinchara#1', 'battle#1'], targets: { 'shinchara#1': 'mascot#1' } };
    const b = score(cards, selection);
    expect(b.combos.find((c) => c.comboId === 'kamase_inu')).toBeUndefined();
  });

  it('主人公死亡: 主人公を対象とする死亡で話題+7', () => {
    const b = score(
      [makeInstance(data, 'hero', 1), makeInstance(data, 'shibou', 1)],
      { cards: ['shibou#1'], targets: { 'shibou#1': 'hero#1' } },
    );
    expect(b.combos.find((c) => c.comboId === 'shujinkou_shibou')?.status).toBe('applied');
    expect(b.comboBuzzTotal).toBe(7);
  });

  it('宴会は鮮度全回復を発生させる（v5.8b: 役の全無効は廃止し、単独プレイ限定に変更）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1)], { cards: ['enkai#1'] });
    expect(b.combosDisabled).toBe(false);
    expect(b.stateChanges).toContainEqual({ type: 'restoreAllFreshness' });
  });

  it('恒久話題性補正は鮮度乗算後に加算される（6.4節）', () => {
    const b = score([makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)], { cards: ['battle#1'] }, 1, {
      permanentBuzzByDef: { battle: 1 },
      freshnessByDef: { battle: 0.5 },
    });
    expect(b.developments[0]!.effective).toBe(2);
  });
});
