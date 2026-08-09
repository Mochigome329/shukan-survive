import { describe, expect, it } from 'vitest';
import { castOf, createInitialDeck, createRun, redraw, resolveWeek, startWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();
const newRun = (seed = 42) => createRun(data, seed, { mangaTitle: 'テスト連載' });

describe('createInitialDeck（v5.2: 初期キャスト3+控え2）', () => {
  it('初期デッキは15枚。場に3人、控えに2人、展開10枚は抽選プール', () => {
    // seedを渡さない場合は固定枠だけ（キャラ5 + 展開7）
    const deck = createInitialDeck(data);
    expect(deck).toHaveLength(12);
    const field = deck.filter((c) => c.zone === 'field');
    expect(field.map((c) => c.definitionId).sort()).toEqual(['hero', 'heroine', 'rival']);
    const bench = deck.filter((c) => c.zone === 'bench');
    expect(bench.map((c) => c.definitionId).sort()).toEqual(['aibou', 'osananajimi']);
    const devs = deck.filter((c) => data.definitions.get(c.definitionId)!.kind === 'development');
    expect(devs).toHaveLength(7);
    expect(devs.every((c) => c.zone === 'activeDeck')).toBe(true);
  });

  it('固定枠は王道（バトル+修行）を安定して作れる構成になっている（v7.13）', () => {
    const deck = createInitialDeck(data);
    const devIds = deck
      .filter((c) => data.definitions.get(c.definitionId)!.kind === 'development')
      .map((c) => c.definitionId);
    expect(new Set(devIds)).toEqual(
      new Set(['battle', 'shugyou', 'shinchara', 'nouryoku_kakusei', 'teki_soshiki']),
    );
    // チュートリアルの目玉である「王道」を毎回狙えるよう、バトルと修行だけは2枚積み
    expect(devIds.filter((id) => id === 'battle')).toHaveLength(2);
    expect(devIds.filter((id) => id === 'shugyou')).toHaveLength(2);
  });

  /*
   * v7.13: 初期デッキの可変枠。
   * 固定枠だけだと毎回まったく同じ出だしになり、序盤が単調だったため、
   * ランごとにプールから3枚引いて混ぜる
   */
  it('seedを渡すと可変枠が加わり、展開カードが10枚になる（v7.13）', () => {
    const deck = createInitialDeck(data, undefined, undefined, 12345);
    const devs = deck.filter((c) => data.definitions.get(c.definitionId)!.kind === 'development');
    expect(devs).toHaveLength(7 + data.starterSlots);
    expect(devs.every((c) => c.zone === 'activeDeck')).toBe(true);
    expect(new Set(devs.map((c) => c.instanceId)).size).toBe(devs.length);
  });

  it('可変枠は同じseedなら同じ、違うseedなら中身が変わる（v7.13）', () => {
    const devsOf = (seed: number) =>
      createInitialDeck(data, undefined, undefined, seed)
        .filter((c) => data.definitions.get(c.definitionId)!.kind === 'development')
        .map((c) => c.definitionId)
        .sort()
        .join(',');
    expect(devsOf(1)).toBe(devsOf(1));
    const variants = new Set(Array.from({ length: 30 }, (_, i) => devsOf(i + 1)));
    expect(variants.size).toBeGreaterThan(1);
  });

  it('可変枠は重複せず、必ずプール内のカードから選ばれる（v7.13）', () => {
    const pool = new Set(data.starterPool);
    for (let seed = 1; seed <= 30; seed++) {
      const devIds = createInitialDeck(data, undefined, undefined, seed)
        .filter((c) => data.definitions.get(c.definitionId)!.kind === 'development')
        .map((c) => c.definitionId);
      const variable = devIds.filter((id) => pool.has(id));
      expect(variable).toHaveLength(data.starterSlots);
      expect(new Set(variable).size).toBe(data.starterSlots);
    }
  });
});

describe('開始時の共演者の陣営選択（v6.7）', () => {
  it('flexFactionの共演者は開始時に陣営を選べ、debutFactionにも反映される', () => {
    const deck = createInitialDeck(data, ['heroine', 'aibou'], { heroine: 'enemy' });
    const heroine = deck.find((c) => c.definitionId === 'heroine')!;
    expect(heroine.faction).toBe('enemy');
    expect(heroine.debutFaction).toBe('enemy');
  });

  it('選ばなければ既定の陣営のまま', () => {
    const deck = createInitialDeck(data, ['heroine', 'aibou']);
    const heroine = deck.find((c) => c.definitionId === 'heroine')!;
    expect(heroine.faction).toBe('ally');
  });

  it('flexFactionではない共演者（相棒）は指定しても無視される', () => {
    const deck = createInitialDeck(data, ['heroine', 'aibou'], { aibou: 'enemy' });
    const aibou = deck.find((c) => c.definitionId === 'aibou')!;
    expect(aibou.faction).toBe('ally');
  });

  it('createRun経由でも陣営選択が反映される', () => {
    const run = createRun(data, 1, {
      mangaTitle: 'テスト',
      startingCast: ['rival', 'aibou'],
      startingFactions: { rival: 'ally' },
    });
    const rival = run.cards.find((c) => c.definitionId === 'rival')!;
    expect(rival.faction).toBe('ally');
    expect(rival.debutFaction).toBe('ally');
  });
});

describe('バトルタグの鮮度低下は半分（v5.5）', () => {
  it('王道バトル連載なので、バトルタグの展開は飽きられにくい', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'nichijou', 1),
    ]);
    const after = resolveWeek(data, state, { cards: ['battle#1', 'nichijou#1'], targets: {} }).state;
    expect(after.freshnessByDef['battle']).toBe(0.875); // -12.5%
    expect(after.freshnessByDef['nichijou']).toBe(0.75); // -25%
  });
});

describe('バトル描写強化（v7.5で修正）', () => {
  it('依頼後はバトルタグの鮮度が100%に戻り、毎週出しても下がらない', () => {
    // 依頼前にすでに落ちている状態から始める（これがv7.4までは固定されたままだった）
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)], 1, {
      freshnessByDef: { battle: 0.5 },
      upgrades: ['battle_art'],
    });
    const after = resolveWeek(data, state, { cards: ['battle#1'], targets: {} }).state;
    // freshnessByDefから消える＝鮮度1.0扱い
    expect(after.freshnessByDef['battle']).toBeUndefined();

    // 翌週も出し続けて下がらない
    const after2 = resolveWeek(data, { ...after, hand: ['battle#1'] }, { cards: ['battle#1'], targets: {} }).state;
    expect(after2.freshnessByDef['battle']).toBeUndefined();
  });

  it('依頼していなければ従来どおり下がる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)], 1, {
      freshnessByDef: { battle: 0.5 },
    });
    const after = resolveWeek(data, state, { cards: ['battle#1'], targets: {} }).state;
    expect(after.freshnessByDef['battle']).toBe(0.375);
  });

  it('バトルタグでないカードは依頼しても普通に下がる', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)], 1, {
      upgrades: ['battle_art'],
    });
    const after = resolveWeek(data, state, { cards: ['nichijou#1'], targets: {} }).state;
    expect(after.freshnessByDef['nichijou']).toBe(0.75);
  });
});

describe('鮮度は展開の種類単位（v5.2d）', () => {
  it('同じ種類を2枚出すと2回分（-50%）下がり、別個体でも共有される', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'nichijou', 1),
      makeInstance(data, 'nichijou', 2),
    ]);
    const after = resolveWeek(data, state, { cards: ['nichijou#1', 'nichijou#2'], targets: {} }).state;
    expect(after.freshnessByDef['nichijou']).toBe(0.5);

    // 別個体をプレイしても同じ鮮度が下がり続ける（複数枚持ちで回避できない）
    const after2 = resolveWeek(data, { ...after, hand: ['nichijou#1'] }, { cards: ['nichijou#1'], targets: {} }).state;
    expect(after2.freshnessByDef['nichijou']).toBe(0.25);
  });

  it('下限25%、出さなかった種類は25%回復する', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)], 1, {
      freshnessByDef: { nichijou: 0.25, battle: 0.5 },
    });
    const after = resolveWeek(data, state, { cards: ['nichijou#1'], targets: {} }).state;
    expect(after.freshnessByDef['nichijou']).toBe(0.25); // 下限
    expect(after.freshnessByDef['battle']).toBe(0.75); // 回復
  });

  it('温泉回は全種類の鮮度を全回復させる（5.2節）', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1)], 2, {
      freshnessByDef: { nichijou: 0.25, battle: 0.5 },
    });
    const after = resolveWeek(data, state, { cards: ['enkai#1'], targets: {} }).state;
    expect(after.freshnessByDef).toEqual({});
  });
});

describe('伏線と伏線回収（v5.2d）', () => {
  it('伏線を張っていなければ伏線回収はプレイできない', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen_kaishu', 1)]);
    const v = validateSelection(data, state, { cards: ['fukusen_kaishu#1'], targets: {} });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain('伏線');
  });

  it('伏線トークンがあれば役が成立し、話題+2×トークン数でトークンを全消費する', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen_kaishu', 1)], 2, {
      foreshadowTokens: 3,
    });
    const result = resolveWeek(data, state, { cards: ['fukusen_kaishu#1'], targets: {} });
    const combo = result.breakdown.combos.find((c) => c.comboId === 'fukusen_kaishu');
    expect(combo?.status).toBe('applied');
    expect(combo?.buzzAdd).toBe(6);
    expect(result.state.foreshadowTokens).toBe(0);
  });

  it('伏線を張るとトークンが累積する', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'fukusen', 1)], 2, {
      foreshadowTokens: 1,
    });
    const result = resolveWeek(data, state, { cards: ['fukusen#1'], targets: {} });
    expect(result.state.foreshadowTokens).toBe(2);
  });
});

describe('編集部の要求（v5.2d）', () => {
  it('達成すると原稿料ボーナスが入る', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    expect(run.demands.length).toBeGreaterThanOrEqual(3);
    const state = { ...startWeek(data, run), cards: run.cards, hand: ['battle#1', 'battle#2'] };
    const result = resolveWeek(data, state, { cards: ['battle#1', 'battle#2'], targets: {} });
    // 「第3話までにバトルを2回描く」を第1話で達成
    expect(result.achievedDemands.map((d) => d.id)).toContain('battle_1');
    expect(result.state.funds).toBeGreaterThanOrEqual(2);
  });

  it('期限切れになると警告が増える', () => {
    const run = createRun(data, 1, { mangaTitle: 'テスト' });
    // 第3話まで何も描かずに来た状態（バトル0回）
    const state: typeof run = { ...run, week: 3, hand: [] };
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.failedDemands.map((d) => d.id)).toContain('battle_1');
    // ノルマ未達の警告1 + 要求失敗の警告1
    expect(result.state.warnings).toBe(2);
  });
});

describe('ネームストックと仕入れ保証（v5.2c）', () => {
  /** 対象指定の要らない展開カード（単独でプレイできる）を手札から探す */
  const findSimplePlay = (state: ReturnType<typeof startWeek>, exclude: string[] = []) =>
    state.hand.find((id) => {
      if (exclude.includes(id)) return false;
      const def = data.definitions.get(state.cards.find((c) => c.instanceId === id)!.definitionId)!;
      return def.kind === 'development' && def.target === 'none' && !def.soloOnly;
    })!;

  it('ストック指定したカードは翌週の手札に必ず入る', () => {
    const state = startWeek(data, newRun(3));
    const keep = state.hand[0]!;
    const played = findSimplePlay(state, [keep]);
    const after = resolveWeek(data, state, { cards: [played], targets: {} }, [keep]).state;
    expect(after.stockedIds).toEqual([keep]);
    expect(startWeek(data, after).hand).toContain(keep);
  });

  it('プレイしたカードはストックされない', () => {
    const state = startWeek(data, newRun(3));
    const played = findSimplePlay(state);
    const after = resolveWeek(data, state, { cards: [played], targets: {} }, [played]).state;
    expect(after.stockedIds).toEqual([]);
  });

  it('ストックは最大2枚まで', () => {
    const state = startWeek(data, newRun(3));
    const after = resolveWeek(data, state, { cards: [], targets: {} }, state.hand.slice(0, 4)).state;
    expect(after.stockedIds).toHaveLength(2);
  });

  it('手札は使い切ってもストック分は残る（ストックは週をまたいで消える）', () => {
    const state = startWeek(data, newRun(3));
    const keep = state.hand[0]!;
    const w2 = startWeek(data, resolveWeek(data, state, { cards: [], targets: {} }, [keep]).state);
    expect(w2.stockedIds).toEqual([]);
    expect(w2.hand).toContain(keep);
  });
});

describe('startWeek（ドロー、v5.2: 展開カードのみ）', () => {
  it('展開プール10枚から7枚を配り、キャラは手札に入らない', () => {
    const state = startWeek(data, newRun());
    expect(state.hand).toHaveLength(7);
    for (const id of state.hand) {
      const def = data.definitions.get(state.cards.find((c) => c.instanceId === id)!.definitionId)!;
      expect(def.kind).toBe('development');
    }
    expect(castOf(data, state)).toHaveLength(3);
  });

  it('抽選は決定的', () => {
    const run = newRun(7);
    expect(startWeek(data, run).hand).toEqual(startWeek(data, run).hand);
  });

  it('ボス週「合併号」（第8話）は手札が2枚少ない（10節）', () => {
    const state = startWeek(data, { ...newRun(), week: 8 });
    expect(state.hand).toHaveLength(5);
  });
});

describe('redraw（ネーム描き直し、4.2節）', () => {
  it('戻した枚数と同数を引き直し、手札は7枚のまま。キャストと控えは変化しない', () => {
    const state = startWeek(data, newRun());
    const after = redraw(data, state, state.hand.slice(0, 2));
    expect(after.hand).toHaveLength(7);
    expect(new Set(after.hand).size).toBe(7);
    expect(after.redrawsUsed).toBe(1);
    expect(castOf(data, after)).toHaveLength(3);
    expect(after.cards.filter((c) => c.zone === 'bench')).toHaveLength(2);
  });

  it('週2回を超える描き直しはできない', () => {
    let state = startWeek(data, newRun());
    state = redraw(data, state, [state.hand[0]!]);
    state = redraw(data, state, [state.hand[0]!]);
    expect(() => redraw(data, state, [state.hand[0]!])).toThrow('週2回');
  });

  it('手札にないカードは戻せない', () => {
    const state = startWeek(data, newRun());
    const notInHand = state.cards.find(
      (c) => c.zone === 'activeDeck' && data.definitions.get(c.definitionId)!.kind === 'development',
    )!;
    expect(() => redraw(data, state, [notInHand.instanceId])).toThrow();
  });
});

describe('validateSelection（4.3〜4.4節、v5.2）', () => {
  const state = makeState([
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'heroine', 1),
    makeInstance(data, 'battle', 1),
    makeInstance(data, 'shugyou', 1),
    makeInstance(data, 'shibou', 1),
    makeInstance(data, 'ridatsu', 1),
    makeInstance(data, 'nichijou', 1),
  ]);

  it('展開0枚（タメ回）は合法', () => {
    expect(validateSelection(data, state, { cards: [], targets: {} }).ok).toBe(true);
  });

  it('5枚は不可', () => {
    const v = validateSelection(data, state, {
      cards: ['battle#1', 'shugyou#1', 'shibou#1', 'ridatsu#1', 'nichijou#1'],
      targets: { 'shugyou#1': 'hero#1', 'shibou#1': 'hero#1', 'ridatsu#1': 'heroine#1' },
    });
    expect(v.ok).toBe(false);
  });

  it('キャラカードはプレイできない（場に常駐）', () => {
    expect(validateSelection(data, state, { cards: ['hero#1'], targets: {} }).ok).toBe(false);
  });

  it('対象が必要な展開は割当がないと不可、場のキャラ以外への割当も不可', () => {
    expect(validateSelection(data, state, { cards: ['shugyou#1'], targets: {} }).ok).toBe(false);
    expect(validateSelection(data, state, { cards: ['shugyou#1'], targets: { 'shugyou#1': 'battle#1' } }).ok).toBe(false);
    expect(validateSelection(data, state, { cards: ['shugyou#1'], targets: { 'shugyou#1': 'hero#1' } }).ok).toBe(true);
  });

  it('新キャラ登場の対象は控えキャラのみ（v5.2デビュー制）', () => {
    const dState = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ]);
    expect(validateSelection(data, dState, { cards: ['shinchara#1'], targets: {} }).ok).toBe(false);
    expect(validateSelection(data, dState, { cards: ['shinchara#1'], targets: { 'shinchara#1': 'hero#1' } }).ok).toBe(false);
    expect(validateSelection(data, dState, { cards: ['shinchara#1'], targets: { 'shinchara#1': 'aibou#1' } }).ok).toBe(true);
  });

  it('zone競合: 同一キャラへの死亡と途中離脱は選択時点でブロックされる（4.4節）', () => {
    const conflict = validateSelection(data, state, {
      cards: ['shibou#1', 'ridatsu#1'],
      targets: { 'shibou#1': 'hero#1', 'ridatsu#1': 'hero#1' },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toContain('主人公');

    const okCase = validateSelection(data, state, {
      cards: ['shibou#1', 'ridatsu#1'],
      targets: { 'shibou#1': 'hero#1', 'ridatsu#1': 'heroine#1' },
    });
    expect(okCase.ok).toBe(true);
  });

  it('総集編は単独のみ・ボス週は不可（5.4節）', () => {
    const recapState = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'soushuhen', 1), makeInstance(data, 'nichijou', 1)]);
    expect(validateSelection(data, recapState, { cards: ['soushuhen#1'], targets: {} }).ok).toBe(true);
    expect(validateSelection(data, recapState, { cards: ['soushuhen#1', 'nichijou#1'], targets: {} }).ok).toBe(false);

    const bossState = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'soushuhen', 1)], 8);
    expect(validateSelection(data, bossState, { cards: ['soushuhen#1'], targets: {} }).ok).toBe(false);
  });
});

describe('resolveWeek（6.2節、v5.2の警告制とデビュー制）', () => {
  it('ノルマ達成: 役・原稿料が入り、警告が1回復する', () => {
    const state = makeState(
      [
        makeInstance(data, 'hero', 1),
        makeInstance(data, 'heroine', 1),
        makeInstance(data, 'rival', 1),
        makeInstance(data, 'battle', 1),
        makeInstance(data, 'shugyou', 1),
        makeInstance(data, 'nichijou', 1),
        makeInstance(data, 'nichijou', 2, { zone: 'activeDeck' }),
      ],
      1,
      { warnings: 1 },
    );
    const result = resolveWeek(data, state, {
      cards: ['battle#1', 'shugyou#1', 'nichijou#1'],
      targets: { 'shugyou#1': 'hero#1' },
    });
    // キャスト37 + 王道10 + ライバル対決15 = 62
    // 話題: カード(2+1+1) + 必殺技初披露2 + 非日常へ4 = 10 → 620
    expect(result.breakdown.finalScore).toBe(620);
    expect(result.outcome).toBe('continue');
    expect(result.state.warnings).toBe(0);
    // v7.26: ノルマ引き上げ（役18種追加による難易度低下の是正）で第1話は300→360に変更
    // 620/360 = 1.72倍 → 基本3+超過分1。神回はノルマ3倍(1080)に届かず不成立（v6.1）
    expect(result.breakdown.fee).toBe(4);
    expect(result.state.comboUsage.oncePerRun).toContain('hissatsu_hatsuhirou');
    // 修行フラグ付与・鮮度低下（種類単位）・未使用は登録されない
    expect(result.state.cards.find((c) => c.instanceId === 'hero#1')!.flags.training).toBe(1);
    // バトルタグは低下が半分（王道バトル連載、v5.5）
    expect(result.state.freshnessByDef['battle']).toBe(0.875);
    expect(result.state.freshnessByDef['nichijou']).toBe(0.75);
    expect(result.state.freshnessByDef['zenmetsu']).toBeUndefined();
  });

  it('通常週の未達は警告+1で連載は続き、修行フラグは翌週消費される', () => {
    const week1 = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'shugyou', 1)]);
    const trained = resolveWeek(data, week1, { cards: ['shugyou#1'], targets: { 'shugyou#1': 'hero#1' } }).state;
    // 第2話: タメ回（0枚プレイ）。(10+3) × 1 = 13 < 140 → 警告+1だが継続
    const result = resolveWeek(data, trained, { cards: [], targets: {} });
    expect(result.breakdown.characters[0]!.trainingBonus).toBe(3);
    expect(result.breakdown.finalScore).toBe(13);
    expect(result.outcome).toBe('continue');
    expect(result.state.warnings).toBe(2);
    expect(result.state.cards.find((c) => c.instanceId === 'hero#1')!.flags.training).toBe(0);
  });

  it('デビュー: 新キャラ登場で控えキャラが場に加わり、その週から得点する', () => {
    const state = makeState([
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1),
    ]);
    const result = resolveWeek(data, state, { cards: ['shinchara#1'], targets: { 'shinchara#1': 'aibou#1' } });
    // 10+8 = 18 × 話題2 = 36
    expect(result.breakdown.popularityTotal).toBe(18);
    expect(result.state.cards.find((c) => c.instanceId === 'aibou#1')!.zone).toBe('field');
  });

  it('警告が3つたまると打ち切り', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], 2, { warnings: 2 });
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.outcome).toBe('cancelled');
    expect(result.cancelReason).toBe('warnings');
  });

  it('ボス週の未達は警告に関係なく即打ち切り', () => {
    const state = makeState([makeInstance(data, 'hero', 1)], 8);
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.outcome).toBe('cancelled');
    expect(result.cancelReason).toBe('boss');
  });

  it('連載続行不能: キャスト0で復帰手段がなければ即打ち切り（4.7節）', () => {
    const state = makeState([makeInstance(data, 'nichijou', 1)]);
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.outcome).toBe('cancelled');
    expect(result.cancelReason).toBe('noCast');
  });

  it('キャスト0でも新キャラ登場+控えが残っていれば継続できる', () => {
    const state = makeState([
      makeInstance(data, 'aibou', 1, { zone: 'bench' }),
      makeInstance(data, 'shinchara', 1, { zone: 'activeDeck' }),
      makeInstance(data, 'nichijou', 1),
    ]);
    const result = resolveWeek(data, state, { cards: [], targets: {} });
    expect(result.outcome).toBe('continue');
    expect(result.state.warnings).toBe(1);
  });

  it('総集編（判定免除）は警告が変動しない', () => {
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'soushuhen', 1)], 2, { warnings: 1 });
    const result = resolveWeek(data, state, { cards: ['soushuhen#1'], targets: {} });
    expect(result.outcome).toBe('continue');
    expect(result.state.warnings).toBe(1);
    expect(result.breakdown.fee).toBe(0);
  });

  it('不正なプレイはエラーになる', () => {
    const state = startWeek(data, newRun());
    expect(() => resolveWeek(data, state, { cards: ['hero#1'], targets: {} })).toThrow();
  });
});
