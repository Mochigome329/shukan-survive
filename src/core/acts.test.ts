import { describe, expect, it } from 'vitest';
import { ACTS_LONG, ACTS_SHORT, actOfWeekIn, actStartingAtIn, actInfoIn, type ActInfo } from './acts';

describe('幕の区切り（v5.9、v7.30でキャンペーン別）', () => {
  it('通常連載は 序1-5 / 破6-16 / 急17-24', () => {
    expect(actOfWeekIn(ACTS_LONG, 1)).toBe('jo');
    expect(actOfWeekIn(ACTS_LONG, 5)).toBe('jo');
    expect(actOfWeekIn(ACTS_LONG, 6)).toBe('ha');
    expect(actOfWeekIn(ACTS_LONG, 16)).toBe('ha');
    expect(actOfWeekIn(ACTS_LONG, 17)).toBe('kyu');
    expect(actOfWeekIn(ACTS_LONG, 24)).toBe('kyu');
  });

  it('短期連載は 序1-3 / 破4-9 / 急10-12（v7.30）', () => {
    expect(actOfWeekIn(ACTS_SHORT, 1)).toBe('jo');
    expect(actOfWeekIn(ACTS_SHORT, 3)).toBe('jo');
    expect(actOfWeekIn(ACTS_SHORT, 4)).toBe('ha');
    expect(actOfWeekIn(ACTS_SHORT, 9)).toBe('ha');
    expect(actOfWeekIn(ACTS_SHORT, 10)).toBe('kyu');
    expect(actOfWeekIn(ACTS_SHORT, 12)).toBe('kyu');
  });

  it('シーンチェンジを出すのは各幕の初回だけ', () => {
    const startsIn = (acts: readonly ActInfo[], last: number) =>
      Array.from({ length: last }, (_, i) => i + 1).filter((w) => actStartingAtIn(acts, w) !== null);
    expect(startsIn(ACTS_LONG, 24)).toEqual([1, 6, 17]);
    expect(startsIn(ACTS_SHORT, 12)).toEqual([1, 4, 10]);
  });

  it('幕の見出しはキャンペーンによらず共通', () => {
    for (const acts of [ACTS_LONG, ACTS_SHORT]) {
      expect(acts).toHaveLength(3);
      expect(actInfoIn(acts, 'jo').label).toBe('第一幕');
      expect(actInfoIn(acts, 'jo').title).toBe('物語の始まり');
      expect(actInfoIn(acts, 'ha').label).toBe('第二幕');
      expect(actInfoIn(acts, 'ha').title).toBe('展開・転回・天外');
      expect(actInfoIn(acts, 'kyu').label).toBe('第三幕');
      expect(actInfoIn(acts, 'kyu').title).toBe('クライマックス');
    }
  });

  it('幕の開始話数は幕判定と矛盾しない', () => {
    for (const acts of [ACTS_LONG, ACTS_SHORT]) {
      for (const a of acts) {
        expect(actOfWeekIn(acts, a.startWeek)).toBe(a.act);
        if (a.startWeek > 1) expect(actOfWeekIn(acts, a.startWeek - 1)).not.toBe(a.act);
      }
    }
  });
});
