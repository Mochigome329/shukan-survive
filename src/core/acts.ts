/**
 * 幕（序破急）の定義。話数帯・ショップの提示重み・シーンチェンジ演出で共有する。
 * 話数の区切りは design_story_types.md 2節に合わせる。
 */
import type { Act } from './types';

export interface ActInfo {
  act: Act;
  /** この幕が始まる話数 */
  startWeek: number;
  /** 「第一幕」等の表記 */
  label: string;
  /** 幕の副題 */
  title: string;
  /** 幕の性格を一行で */
  lead: string;
}

export const ACTS: ActInfo[] = [
  { act: 'jo', startWeek: 1, label: '第一幕', title: '物語の始まり', lead: '出会いと世界の提示。まずは読者に「誰の話か」を伝える' },
  { act: 'ha', startWeek: 6, label: '第二幕', title: '展開・転回・天外', lead: '試練と裏切り、そして仕込み。物語が転がりはじめる' },
  { act: 'kyu', startWeek: 17, label: '第三幕', title: 'クライマックス', lead: '決着と回収。積み上げてきたものを、すべて使い切る' },
];

/** 話数から現在の幕を返す */
export function actOfWeek(week: number): Act {
  if (week <= 5) return 'jo';
  if (week <= 16) return 'ha';
  return 'kyu';
}

/** その話数が幕の初回なら幕情報を返す（シーンチェンジを出す判定に使う） */
export function actStartingAt(week: number): ActInfo | null {
  return ACTS.find((a) => a.startWeek === week) ?? null;
}

export function actInfo(act: Act): ActInfo {
  return ACTS.find((a) => a.act === act)!;
}
