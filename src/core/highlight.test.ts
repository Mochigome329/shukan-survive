import { describe, expect, it } from 'vitest';
import { castOf, HIGHLIGHT_LIMIT, previewScore, rosterOf, startWeek, toggleHighlight, validateSelection } from './run';
import { loadTestData, makeInstance, makeState } from './testHelpers';

const data = loadTestData();

/** 在籍8人の連載を作る（上限6人を超える状態） */
function bigRoster() {
  return [
    makeInstance(data, 'hero', 1),
    makeInstance(data, 'heroine', 1),
    makeInstance(data, 'rival', 1),
    makeInstance(data, 'aibou', 1),
    makeInstance(data, 'osananajimi', 1),
    makeInstance(data, 'shishou', 1),
    makeInstance(data, 'mascot', 1),
    makeInstance(data, 'ippanjin', 1),
  ];
}

describe('今週の出演（ハイライト、v6.0）', () => {
  it('在籍が上限を超えていても、得点するのは6人まで', () => {
    const state = makeState([...bigRoster(), makeInstance(data, 'nichijou', 1)], 10);
    expect(rosterOf(data, state)).toHaveLength(8);
    expect(castOf(data, state)).toHaveLength(HIGHLIGHT_LIMIT);

    const b = previewScore(data, state, { cards: ['nichijou#1'], targets: {} });
    expect(b.characters).toHaveLength(HIGHLIGHT_LIMIT);
    // 人気度の高い順に自動で埋まる（宿敵20 > ライバル15 > ヒロイン12 …）
    expect(b.characters.map((c) => c.name)).toContain('ライバル');
    expect(b.characters.map((c) => c.name)).not.toContain('一般人'); // 人気度4は溢れる
  });

  it('在籍が6人以下なら全員が出演する', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1)];
    const state = makeState(cards, 5);
    expect(castOf(data, state)).toHaveLength(2);
  });

  it('タップで出演者を入れ替えられ、上限を超える追加は無視される', () => {
    const state = makeState(bigRoster(), 10);
    const initial = castOf(data, state).map((c) => c.instanceId);
    expect(initial).toHaveLength(6);

    // 出ている1人を下ろす
    const dropped = toggleHighlight(data, state, initial[0]!);
    expect(castOf(data, dropped).map((c) => c.instanceId)).not.toContain(initial[0]);
    expect(castOf(data, dropped)).toHaveLength(5);

    // 空いた枠に別の在籍キャラを入れる
    const offStage = rosterOf(data, dropped).find((c) => !castOf(data, dropped).some((h) => h.instanceId === c.instanceId))!;
    const added = toggleHighlight(data, dropped, offStage.instanceId);
    expect(castOf(data, added).map((c) => c.instanceId)).toContain(offStage.instanceId);
    expect(castOf(data, added)).toHaveLength(6);

    // 満員の状態でさらに足しても変わらない
    const another = rosterOf(data, added).find((c) => !castOf(data, added).some((h) => h.instanceId === c.instanceId))!;
    const overflow = toggleHighlight(data, added, another.instanceId);
    expect(castOf(data, overflow).map((c) => c.instanceId)).not.toContain(another.instanceId);
  });

  it('出演していないキャラは役の対象にできない', () => {
    const state = makeState([...bigRoster(), makeInstance(data, 'nouryoku_kakusei', 1)], 10);
    const onStage = castOf(data, state)[0]!;
    const offStage = rosterOf(data, state).find((c) => !castOf(data, state).some((h) => h.instanceId === c.instanceId))!;

    const ok = { cards: ['nouryoku_kakusei#1'], targets: { 'nouryoku_kakusei#1': onStage.instanceId } };
    expect(validateSelection(data, state, ok).ok).toBe(true);

    const ng = { cards: ['nouryoku_kakusei#1'], targets: { 'nouryoku_kakusei#1': offStage.instanceId } };
    expect(validateSelection(data, state, ng).ok).toBe(false);
  });

  it('出演の顔ぶれは翌週へ持ち越され、退場した人だけ落ちる', () => {
    const cards = [...bigRoster(), makeInstance(data, 'battle', 1)];
    const state = makeState(cards, 10);
    const picked = castOf(data, state).map((c) => c.instanceId);

    const next = startWeek(data, { ...state, week: 11 });
    expect(next.highlightIds).toEqual(picked);

    // 場から外れた人は持ち越さない
    const withDead = {
      ...state,
      cards: state.cards.map((c) => (c.instanceId === picked[0] ? { ...c, zone: 'dead' as const } : c)),
    };
    const afterDeath = startWeek(data, { ...withDead, week: 11 });
    expect(afterDeath.highlightIds).not.toContain(picked[0]);
  });

  it('出演を絞ると人気度合計も下がる（人数がそのまま強さではなくなる）', () => {
    const cards = [...bigRoster(), makeInstance(data, 'nichijou', 1)];
    const full = makeState(cards, 10);
    const six = previewScore(data, full, { cards: ['nichijou#1'], targets: {} }).popularityTotal;

    const trimmed = toggleHighlight(data, full, castOf(data, full)[0]!.instanceId);
    const five = previewScore(data, trimmed, { cards: ['nichijou#1'], targets: {} }).popularityTotal;
    expect(five).toBeLessThan(six);
  });
});

describe('出演していない在籍キャラの寄与（v6.1）', () => {
  it('ハイライト外のキャラは人気度が半分だけ乗る', () => {
    const cards = [...bigRoster(), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, 10);
    const b = previewScore(data, state, { cards: ['nichijou#1'], targets: {} });

    // 在籍8人・出演6人。溢れた2人の人気度の半分が加算される
    const onStage = new Set(b.characters.map((c) => c.instanceId));
    const offStage = rosterOf(data, state).filter((c) => !onStage.has(c.instanceId));
    const expected = offStage.reduce((sum, c) => {
      const def = data.definitions.get(c.definitionId)!;
      return sum + Math.floor((def.kind === 'character' ? def.popularity : 0) / 2);
    }, 0);
    expect(offStage).toHaveLength(2);
    expect(b.offStagePopularity).toBe(expected);
    expect(b.offStagePopularity).toBeGreaterThan(0);
  });

  it('全員出演していれば半減分は発生しない', () => {
    const cards = [makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'nichijou', 1)];
    const b = previewScore(data, makeState(cards, 5), { cards: ['nichijou#1'], targets: {} });
    expect(b.offStagePopularity).toBe(0);
  });

  it('半減分は役の対象にも成立条件にもならない（出演6人だけを見る）', () => {
    const cards = [...bigRoster(), makeInstance(data, 'nichijou', 1)];
    const state = makeState(cards, 10);
    const b = previewScore(data, state, { cards: ['nichijou#1'], targets: {} });
    // 役判定に渡るキャラは出演分だけ
    expect(b.characters).toHaveLength(HIGHLIGHT_LIMIT);
  });
});

describe('出演者は0人にできない（v7.6c）', () => {
  it('最後の1人は下ろせない', () => {
    // 在籍2人 → 1人まで減らしてから、最後の1人を外そうとする
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1)], 5);
    expect(castOf(data, state)).toHaveLength(2);

    const one = toggleHighlight(data, state, 'heroine#1');
    expect(castOf(data, one).map((c) => c.instanceId)).toEqual(['hero#1']);

    // ここで拒否される（拒否のしるしとして state がそのまま返る）
    const none = toggleHighlight(data, one, 'hero#1');
    expect(none).toBe(one);
    expect(castOf(data, none)).toHaveLength(1);
  });

  it('最後の1人を外しても「全員が復活する」ことはない', () => {
    // castOfは空のとき人気順で自動補充するため、v7.6bまでは
    // 最後の1人を外すと highlightIds=[] になり、画面上は全員が戻っていた
    const state = makeState([makeInstance(data, 'hero', 1), makeInstance(data, 'heroine', 1), makeInstance(data, 'rival', 1)], 5);
    let s = state;
    for (const id of ['heroine#1', 'rival#1', 'hero#1']) {
      s = toggleHighlight(data, s, id);
    }
    expect(castOf(data, s)).toHaveLength(1);
    expect(s.highlightIds).toEqual(['hero#1']);
  });
});
