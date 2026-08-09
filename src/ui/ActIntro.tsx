import { actInfoIn, type ActInfo } from '../core/acts';
import type { Act } from '../core/types';

interface Props {
  /** 今いるキャンペーンの幕表（連載の長さで区切りが変わる、v7.30） */
  acts: readonly ActInfo[];
  act: Act;
  week: number;
  onDismiss: () => void;
}

/**
 * 幕の変わり目のシーンチェンジ（v5.9）。
 * 第1話・第6話・第17話の開始時に全画面で挟み、連載が段階を移ったことを体感させる。
 * タップで閉じる。
 */
export function ActIntro({ acts, act, week, onDismiss }: Props) {
  const info = actInfoIn(acts, act);
  return (
    <div className={`act-intro act-intro-${act}`} onClick={onDismiss}>
      <div className="act-intro-inner">
        <span className="act-intro-week">第{week}話</span>
        <span className="act-intro-label">{info.label}</span>
        <h2 className="act-intro-title">{info.title}</h2>
        <p className="act-intro-lead">{info.lead}</p>
        <span className="act-intro-tap">タップして続ける</span>
      </div>
    </div>
  );
}
