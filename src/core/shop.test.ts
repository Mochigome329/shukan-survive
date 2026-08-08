import { describe, expect, it } from 'vitest';
import { createRun, previewScore, redrawLimit, resolveWeek, startWeek } from './run';
import { calcFee } from './scoring';
import {
  availableServices,
  buyCard,
  buyService,
  obtainablePool,
  rollPack,
  upgradeArt,
  ART_UPGRADE_AMOUNT,
  PACK_PRICE,
  PACK_SIZE,
} from './shop';
import { loadTestData, makeInstance, makeState } from './testHelpers';
import type { RunState, WeekLogEntry } from './types';

const data = loadTestData();
const MAX_WEEK = 8;
/** 実装範囲の上限（gameReducer.MAX_PLAYABLE_WEEK と同じ） */
const MAX_PLAYABLE = 24;
const newRun = (seed = 1) => createRun(data, seed, { mangaTitle: 'テスト連載' });

function makeLogEntry(overrides: Partial<WeekLogEntry> = {}): WeekLogEntry {
  return {
    week: 1,
    playedInstanceIds: [],
    playedDefinitionIds: [],
    comboIds: [],
    score: 0,
    quota: 0,
    cleared: true,
    warningsAfter: 0,
    ...overrides,
  };
}

/** rollPackを購入回数を変えながら繰り返し呼び、提示された定義IDの出現回数を数える */
function samplePackFrequency(run: RunState, maxWeek: number, samples: number): Map<string, number> {
  const freq = new Map<string, number>();
  for (let i = 0; i < samples; i++) {
    const pack = rollPack(data, { ...run, shopPurchases: i }, maxWeek);
    for (const id of pack) freq.set(id, (freq.get(id) ?? 0) + 1);
  }
  return freq;
}

describe('編集会議（12節・最小版）', () => {
  it('原稿料は基本3+超過50%ごとに+1(上限+2)', () => {
    expect(calcFee(30, 30)).toBe(3);
    expect(calcFee(44, 30)).toBe(3); // 1.46倍
    expect(calcFee(45, 30)).toBe(4); // 1.5倍
    expect(calcFee(60, 30)).toBe(5); // 2.0倍
    expect(calcFee(300, 30)).toBe(5); // 上限+2
  });

  it('入手可能プールは最大所持数と解禁話数を守る', () => {
    const run = newRun(1);
    const pool = obtainablePool(data, run, MAX_WEEK);
    expect(pool).not.toContain('hero'); // 1人物1枚、所持済み
    expect(pool).toContain('shukuteki'); // 未所持キャラ
    expect(pool).toContain('battle'); // 2/4枚所持
    expect(pool).not.toContain('timeskip'); // 第1話時点では未解禁（解禁は第9話）
  });

  it('まだ解禁されていないカードは提示しない（v5.7）', () => {
    const run = newRun(1);
    // 第8話の編集会議（＝次に描くのは第9話）でタイムスキップが解禁される
    expect(obtainablePool(data, { ...run, week: 8 }, MAX_PLAYABLE)).not.toContain('timeskip');
    expect(obtainablePool(data, { ...run, week: 9 }, MAX_PLAYABLE)).toContain('timeskip');
    // 第10話解禁のタイトル回収も同様
    expect(obtainablePool(data, { ...run, week: 9 }, MAX_PLAYABLE)).not.toContain('title_kaishu');
    expect(obtainablePool(data, { ...run, week: 10 }, MAX_PLAYABLE)).toContain('title_kaishu');

    // パックにも未解禁カードは一切現れない
    for (let week = 1; week <= 8; week++) {
      for (let i = 0; i < 30; i++) {
        const pack = rollPack(data, { ...run, week, shopPurchases: i }, MAX_PLAYABLE);
        for (const id of pack) {
          expect(data.definitions.get(id)!.unlockWeek).toBeLessThanOrEqual(week);
        }
      }
    }
  });

  it('レアカードは通常カードより提示されにくい（v5.7）', () => {
    /*
     * 第18話＝急で見る。以前は第10話（破）で数えていたが、
     * どちらも急のカードなので幕の重みが0.3倍に落ち、300回引いても
     * 各数回しか出ずに大小が誤差で入れ替わっていた。
     * 同じ幕の中で比べれば、レア倍率0.4がそのまま差として出る
     */
    const run = { ...newRun(1), week: 18 };
    const freq = samplePackFrequency(run, MAX_PLAYABLE, 300);
    // タイトル回収（レア・急）より、同じ急のレアでない大勝利のほうが出る
    expect(freq.get('dai_shouri') ?? 0).toBeGreaterThan(freq.get('title_kaishu') ?? 0);
  });

  it('パックは3枚提示で、シードから決定的に選ばれる', () => {
    const run = newRun(7);
    const pack1 = rollPack(data, run, MAX_WEEK);
    const pack2 = rollPack(data, run, MAX_WEEK);
    expect(pack1).toHaveLength(PACK_SIZE);
    expect(pack1).toEqual(pack2);
    // 購入回数が変わると提示も変わる
    const packAfterBuy = rollPack(data, { ...run, shopPurchases: 1 }, MAX_WEEK);
    expect(packAfterBuy).not.toEqual(pack1);
  });

  it('購入で資金が減り、展開はプールへ・キャラは控えへ入る', () => {
    const run = { ...newRun(1), funds: 5 };
    const after = buyCard(data, run, 'battle');
    expect(after.funds).toBe(5 - PACK_PRICE);
    expect(after.cards.find((c) => c.instanceId === 'battle#3')?.zone).toBe('activeDeck');
    expect(after.cards).toHaveLength(16);
    // v5.2c: 仕入れた展開カードは次の話の手札に必ず入る
    expect(after.guaranteedNextHand).toEqual(['battle#3']);

    // v5.2: キャラは控えスタート（「新キャラ登場」でデビュー）
    const after2 = buyCard(data, after, 'shukuteki');
    const bought = after2.cards.find((c) => c.instanceId === 'shukuteki#1')!;
    expect(bought.faction).toBe('enemy');
    expect(bought.zone).toBe('bench');
    // v5.9: キャラ自身は手札に入らないが、代わりにデビュー手段が次の話の手札へ確定で入る
    expect(after2.guaranteedNextHand).toEqual(['battle#3', 'shinchara#1']);
  });

  it('キャラを仕入れると、デビュー手段が次の話の手札に確定で入る（v5.9）', () => {
    const run = { ...newRun(1), funds: 10 };
    const after = buyCard(data, run, 'shukuteki');
    expect(after.guaranteedNextHand).toEqual(['shinchara#1']);
    expect(startWeek(data, after).hand).toContain('shinchara#1');

    // デビュー手段を持っていなければ何も確定しない（デッキから抜けている場合）
    const noDebut = { ...run, cards: run.cards.filter((c) => c.definitionId !== 'shinchara') };
    expect(buyCard(data, noDebut, 'shukuteki').guaranteedNextHand).toEqual([]);
  });

  it('仕入れた展開カードは翌週の手札に確実に現れる（v5.2c）', () => {
    const run = { ...newRun(5), funds: 5 };
    const after = buyCard(data, run, 'zenmetsu');
    expect(startWeek(data, after).hand).toContain('zenmetsu#1');
  });

  it('作画強化はキャラの人気度を恒久+5し、原稿料3を消費する', () => {
    const run = { ...newRun(1), funds: 4 };
    const after = upgradeArt(data, run, 'hero#1');
    expect(after.funds).toBe(1);
    expect(after.cards.find((c) => c.instanceId === 'hero#1')!.permanentPopularityBonus).toBe(ART_UPGRADE_AMOUNT);

    // 控えキャラも強化できる。展開カードと資金不足は拒否
    expect(upgradeArt(data, { ...run, funds: 3 }, 'aibou#1').cards.find((c) => c.instanceId === 'aibou#1')!.permanentPopularityBonus).toBe(5);
    expect(() => upgradeArt(data, run, 'battle#1')).toThrow('キャラのみ');
    expect(() => upgradeArt(data, { ...run, funds: 2 }, 'hero#1')).toThrow('原稿料');
  });

  it('速筆: 描き直し回数が+1される（1回限り）', () => {
    const run = { ...newRun(1), funds: 10 };
    expect(redrawLimit(run)).toBe(2);
    const after = buyService(run, 'fast_draft');
    expect(redrawLimit(after)).toBe(3);
    expect(after.funds).toBe(6);
    expect(() => buyService(after, 'fast_draft')).toThrow('すでに依頼済み');
    expect(availableServices(after).map((s) => s.id)).not.toContain('fast_draft');
  });

  it('バトル描写強化: バトルタグの鮮度が下がらなくなる', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'battle', 1),
      makeInstance(data, 'nichijou', 1),
    ];
    const base = makeState(cards, 2, { funds: 10 });
    const upgraded = buyService(base, 'battle_art');
    const after = resolveWeek(data, upgraded, { cards: ['battle#1', 'nichijou#1'], targets: {} }).state;
    expect(after.freshnessByDef['battle']).toBeUndefined(); // 100%のまま
    expect(after.freshnessByDef['nichijou']).toBe(0.75);
  });

  it('熟考: 3週間すべての展開の話題性+1（再依頼で期間が更新される）', () => {
    const base = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'nichijou', 1)], 2, { funds: 10 });
    const after = buyService(base, 'deep_thought');
    expect(after.modifiers).toContainEqual({ modifierId: 'deep_thought', remaining: 3 });

    const b = previewScore(data, after, { cards: ['nichijou#1'], targets: {} });
    expect(b.developments[0]!.effective).toBe(2); // 日常回1 + 熟考1

    // 何度でも依頼でき、残り期間は上書きされる
    const again = buyService({ ...after, modifiers: [{ modifierId: 'deep_thought', remaining: 1 }] }, 'deep_thought');
    expect(again.modifiers.filter((m) => m.modifierId === 'deep_thought')).toEqual([
      { modifierId: 'deep_thought', remaining: 3 },
    ]);
  });

  it('資金不足のサービスは依頼できない', () => {
    const poor = { ...newRun(1), funds: 2 };
    expect(() => buyService(poor, 'battle_art')).toThrow('原稿料');
  });

  it('資金不足と最大所持数超過は購入できない', () => {
    const run = newRun(1);
    expect(() => buyCard(data, run, 'battle')).toThrow('原稿料');
    const rich = { ...run, funds: 10 };
    expect(() => buyCard(data, rich, 'hero')).toThrow('これ以上');
  });

  it('幕タグ: 序盤は同じ幕（序）のカードが遠い幕（急）より出やすい（v5.6）', () => {
    const run = newRun(1); // week=1 → 序
    const freq = samplePackFrequency(run, MAX_WEEK, 200);
    expect(freq.get('nichijou') ?? 0).toBeGreaterThan(freq.get('shukuteki') ?? 0);
  });

  it('追随ルール: 「敗北」直後は「大勝利」「救出」「能力覚醒」が出やすくなる（v5.6）', () => {
    const base = { ...newRun(1), week: 10 };
    const withHaiboku = { ...base, log: [makeLogEntry({ week: 9, playedDefinitionIds: ['haiboku'] })] };

    // カードプールが大きいので、1枚ごとの頻度ではなく「応えるカード群」の合計で見る
    const boosted = ['dai_shouri', 'kyuushutsu', 'nouryoku_kakusei'];
    const total = (freq: Map<string, number>) => boosted.reduce((sum, id) => sum + (freq.get(id) ?? 0), 0);

    const baseTotal = total(samplePackFrequency(base, MAX_WEEK, 400));
    const boostedTotal = total(samplePackFrequency(withHaiboku, MAX_WEEK, 400));
    expect(boostedTotal).toBeGreaterThan(baseTotal * 1.5);
  });

  it('幕タグ: 「撃破」は破でも急でも出やすい（v7.13で複数幕指定に対応）', () => {
    // 敵専用の退場手段。「急」だけだと中盤（第6〜16話）でほぼ出ず、
    // 「破」だけにすると今度は決着をつけたい第3幕で出なくなる。
    // act に ["ha","kyu"] を指定して、どちらの幕でも同幕扱いになることを確かめる
    const inHa = samplePackFrequency({ ...newRun(1), week: 10 }, MAX_PLAYABLE, 400).get('gekiha') ?? 0;
    const inKyu = samplePackFrequency({ ...newRun(1), week: 20 }, MAX_PLAYABLE, 400).get('gekiha') ?? 0;
    expect(inHa).toBeGreaterThan(0);
    expect(inKyu).toBeGreaterThan(0);

    // 「途中離脱」は破のみなので、急では明確に減る。撃破はそうならない
    const ridatsuInKyu = samplePackFrequency({ ...newRun(1), week: 20 }, MAX_PLAYABLE, 400).get('ridatsu') ?? 0;
    expect(inKyu).toBeGreaterThan(ridatsuInKyu);
  });

  it('追随ルール: 敵キャラを入手した直後は「撃破」（敵退場の決め手）が出やすくなる（v7.12）', () => {
    const enemyChar = makeInstance(data, 'shukuteki', 1, { faction: 'enemy', zone: 'field', acquiredWeek: 9 });
    const base = { ...newRun(1), week: 10 };
    const withEnemy = { ...base, cards: [...base.cards, enemyChar] };

    const baseFreq = (freq: Map<string, number>) => freq.get('gekiha') ?? 0;
    const baseTotal = baseFreq(samplePackFrequency(base, MAX_WEEK, 400));
    const boostedTotal = baseFreq(samplePackFrequency(withEnemy, MAX_WEEK, 400));
    expect(boostedTotal).toBeGreaterThan(baseTotal * 1.5);
  });

  it('緊張2以上のときは解放カードが必ず1枠確保される（幕重み付けと共存、v5.5維持）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)];
    const run = { ...makeState(cards, 3, { funds: 10, stress: 2 }), runSeed: 1 };
    for (let i = 0; i < 20; i++) {
      const pack = rollPack(data, { ...run, shopPurchases: i }, MAX_WEEK);
      expect(pack.some((id) => ['dai_shouri', 'kyuushutsu', 'fukkatsu', 'kakusei'].includes(id))).toBe(true);
    }
  });
});
