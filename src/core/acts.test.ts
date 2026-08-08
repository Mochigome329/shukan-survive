import { describe, expect, it } from 'vitest';
import { ACTS, actOfWeek, actStartingAt, actInfo } from './acts';

describe('幕の区切り（v5.9）', () => {
  it('話数から幕を判定する（序1-5 / 破6-16 / 急17-24）', () => {
    expect(actOfWeek(1)).toBe('jo');
    expect(actOfWeek(5)).toBe('jo');
    expect(actOfWeek(6)).toBe('ha');
    expect(actOfWeek(16)).toBe('ha');
    expect(actOfWeek(17)).toBe('kyu');
    expect(actOfWeek(24)).toBe('kyu');
  });

  it('シーンチェンジを出すのは第1話・第6話・第17話だけ', () => {
    const starts = Array.from({ length: 24 }, (_, i) => i + 1).filter((w) => actStartingAt(w) !== null);
    expect(starts).toEqual([1, 6, 17]);
  });

  it('幕の見出しは3つとも定義されている', () => {
    expect(ACTS).toHaveLength(3);
    expect(actInfo('jo').label).toBe('第一幕');
    expect(actInfo('jo').title).toBe('物語の始まり');
    expect(actInfo('ha').label).toBe('第二幕');
    expect(actInfo('ha').title).toBe('展開・転回・天外');
    expect(actInfo('kyu').label).toBe('第三幕');
    expect(actInfo('kyu').title).toBe('クライマックス');
  });

  it('幕の開始話数は actOfWeek と矛盾しない', () => {
    for (const a of ACTS) {
      expect(actOfWeek(a.startWeek)).toBe(a.act);
      if (a.startWeek > 1) expect(actOfWeek(a.startWeek - 1)).not.toBe(a.act);
    }
  });
});
