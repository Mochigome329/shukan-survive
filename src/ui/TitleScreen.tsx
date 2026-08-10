import { useState } from 'react';
import type { SaveData } from '../core/save';
import type { GameAction } from '../state/gameReducer';
import titleArt from '../assets/title-art.webp';
import { AccessCounter } from './AccessCounter';
import { playPico } from './audio';
import { hasPlayedBefore } from './playHistory';

interface Props {
  dispatch: (action: GameAction) => void;
  /** 中断中の連載（v6.8）。無ければ「続きから」は出さない */
  save: SaveData | null;
  onResume: () => void;
  onDiscardSave: () => void;
}

/** 保存時刻を「8月7日 14:32」のように短く出す */
function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TitleScreen({ dispatch, save, onResume, onDiscardSave }: Props) {
  // 中断中の連載を捨てて新連載を始めるときだけ、画面内で一度確認する
  const [confirmingNew, setConfirmingNew] = useState(false);
  // 2回目以降だけ、チュートリアルの要否を聞く（v7.5）
  const [askingTutorial, setAskingTutorial] = useState(false);

  const begin = (withTutorial: boolean) => {
    if (save) onDiscardSave();
    dispatch({ type: 'openSetup', withTutorial });
  };

  /**
   * 初回は何も聞かずチュートリアルつきで始める。
   * 一度でも遊んでいれば「チュートリアルを表示しますか？」を挟む
   */
  const startNew = () => {
    playPico();
    setConfirmingNew(false);
    if (!hasPlayedBefore()) {
      begin(true);
      return;
    }
    setAskingTutorial(true);
  };

  return (
    <div className="screen title-screen">
      <h1 className="sr-only">週刊サバイブ</h1>
      <img className="title-art" src={titleArt} alt="週刊サバイブ" />
      <p className="title-sub">きみの連載は、何話まで生き残れるか。</p>
      {save && (
        <button type="button" className="primary-btn title-start title-resume" onClick={onResume}>
          続きから
          <span className="title-resume-meta">
            『{save.run.mangaTitle}』第{save.run.week}話 / {formatSavedAt(save.savedAt)}
          </span>
        </button>
      )}
      {askingTutorial ? (
        <div className="title-confirm">
          <p className="title-confirm-text">遊びかたの説明（チュートリアル）を表示しますか？</p>
          <div className="title-confirm-buttons">
            <button type="button" className="small-btn" onClick={() => begin(true)}>
              表示する
            </button>
            <button type="button" className="small-btn ghost" onClick={() => begin(false)}>
              いらない
            </button>
          </div>
        </div>
      ) : !save ? (
        <button type="button" className="primary-btn title-start" data-sfx="skip" onClick={startNew}>
          連載開始
        </button>
      ) : confirmingNew ? (
        <div className="title-confirm">
          <p className="title-confirm-text">
            中断中の『{save.run.mangaTitle}』（第{save.run.week}話）は消えます。よろしいですか？
          </p>
          <div className="title-confirm-buttons">
            <button type="button" className="small-btn" data-sfx="skip" onClick={startNew}>
              破棄して始める
            </button>
            <button type="button" className="small-btn ghost" onClick={() => setConfirmingNew(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="small-btn ghost title-start" onClick={() => setConfirmingNew(true)}>
          新しく連載を始める
        </button>
      )}
      <button type="button" className="small-btn ghost" onClick={() => dispatch({ type: 'openCodex' })}>
        役図鑑
      </button>
      {/* v7.32: 短期連載（全13話）を選べるようになったので、タイトル画面の時点では長さを断定しない */}
      <p className="title-note">短期13話／通常25話・最終回まで収録　v1.0</p>
      <a className="title-credit" href="https://x.com/oIwaaakIo" target="_blank" rel="noopener noreferrer">
        作者: もちごめ
      </a>
      <AccessCounter />
    </div>
  );
}
