/** 外部レビュー（gpt-5.6-sol）で指摘された不具合の修正を固定するテスト（v5.8c） */
import { describe, expect, it } from 'vitest';
import { previewScore, resolveWeek, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

describe('連載続行不能の判定漏れ（v5.8c）', () => {
  it('全滅した週でも、夢オチを持っていれば打ち切りにならない', () => {
    const cards = [
      makeInstance(data, 'hero', 1),
      makeInstance(data, 'aibou', 1),
      makeInstance(data, 'zenmetsu', 1),
      makeInstance(data, 'yumeochi', 1, { zone: 'activeDeck' }),
    ];
    const result = resolveWeek(data, makeState(cards, 20), {
      cards: ['zenmetsu#1'],
      targets: {},
    });
    // 仲間は全滅するが、夢オチという復帰手段が残っているので続行できる
    expect(result.state.cards.filter((c) => c.zone === 'field').length).toBe(0);
    expect(result.cancelReason).not.toBe('noCast');
  });

  it('「全員生還」も復帰手段として数える', () => {
    const cards = [
      makeInstance(data, 'hero', 1, { zone: 'dead' }),
      makeInstance(data, 'zenin_seikan', 1, { zone: 'activeDeck' }),
      makeInstance(data, 'nichijou', 1),
    ];
    expect(resolveWeek(data, makeState(cards, 20), { cards: ['nichijou#1'], targets: {} }).cancelReason).not.toBe('noCast');
  });

  it('再登場待ちのキャラがいれば、カードがなくても続行できる', () => {
    const cards = [
      makeInstance(data, 'hero', 1, { zone: 'waiting', leftWeek: 18 }),
      makeInstance(data, 'nichijou', 1),
    ];
    expect(resolveWeek(data, makeState(cards, 20), { cards: ['nichijou#1'], targets: {} }).cancelReason).not.toBe('noCast');
  });

  it('復帰手段が本当に無ければ、これまでどおり続行不能になる', () => {
    const cards = [makeInstance(data, 'hero', 1, { zone: 'dead' }), makeInstance(data, 'nichijou', 1)];
    expect(resolveWeek(data, makeState(cards, 20), { cards: ['nichijou#1'], targets: {} }).cancelReason).toBe('noCast');
  });
});

describe('期間効果は開始した週から効く（v5.8c）', () => {
  it('「回想」は出したその週から話題性+1される', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'kaisou', 1), makeInstance(data, 'nichijou', 1)];
    const b = previewScore(data, makeState(cards, 10), { cards: ['kaisou#1', 'nichijou#1'], targets: {} });
    // 回想1+1、日常回1+1
    expect(b.developments.find((d) => d.name === '日常回')!.effective).toBe(2);
  });

  it('「トーナメント開幕」は開幕した週から話題+2が乗る', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'tournament', 1)];
    const b = previewScore(data, makeState(cards, 10), { cards: ['tournament#1'], targets: {} });
    // トーナメント自体の2 + 期間効果2
    expect(b.modifierBuzzTotal).toBe(2);
  });

  it('合計の有効週数は定義どおり（回想2週・トーナメント3週）', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'kaisou', 1)];
    const after = resolveWeek(data, makeState(cards, 10), { cards: ['kaisou#1'], targets: {} }).state;
    // 当週で1週分を消化しているので、残りは1週
    expect(after.modifiers).toContainEqual({ modifierId: 'flashback', remaining: 1 });
  });
});

describe('soloOnly とボス週禁止の分離（v5.8c）', () => {
  it('宴会はボス週でも使える（禁止されるのは総集編だけ）', () => {
    const enkai = [makeInstance(data, 'hero', 1), makeInstance(data, 'enkai', 1)];
    // 第8話は合併号（ボス週）
    expect(validateSelection(data, makeState(enkai, 8), { cards: ['enkai#1'], targets: {} }).ok).toBe(true);

    const soushuhen = [makeInstance(data, 'hero', 1), makeInstance(data, 'soushuhen', 1)];
    const v = validateSelection(data, makeState(soushuhen, 8), { cards: ['soushuhen#1'], targets: {} });
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toContain('ボス週');
  });
});

describe('明細の分離と鮮度の防御（v5.8c）', () => {
  it('「共闘」の一時補正は恒久補正と別枠で表示される', () => {
    const cards = [makeInstance(data, 'hero', 1, { permanentPopularityBonus: 4 }), makeInstance(data, 'kyoutou', 1)];
    const b = previewScore(data, makeState(cards, 10), { cards: ['kyoutou#1'], targets: {} });
    const hero = b.characters[0]!;
    expect(hero.permanentBonus).toBe(4);
    expect(hero.temporaryBonus).toBe(5);
    expect(hero.total).toBe(10 + 4 + 5);
  });

  it('範囲外の鮮度が入っても採点側で 0.25〜1 に丸められる', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'battle', 1)];
    const over = previewScore(data, makeState(cards, 5, { freshnessByDef: { battle: 1.5 } }), {
      cards: ['battle#1'],
      targets: {},
    });
    expect(over.developments[0]!.effective).toBe(2); // 1.5倍にはならない

    const under = previewScore(data, makeState(cards, 5, { freshnessByDef: { battle: -1 } }), {
      cards: ['battle#1'],
      targets: {},
    });
    expect(under.developments[0]!.effective).toBe(0.5); // 負にはならない（下限0.25）
  });
});
