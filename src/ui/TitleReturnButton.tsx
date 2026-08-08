import { useState } from 'react';
import type { GameAction } from '../state/gameReducer';

interface Props {
  dispatch: (action: GameAction) => void;
}

/**
 * ゲーム進行中でもタイトルへ戻れるボタン（v7.9c）。
 * 話づくり・編集会議は`state.run`が自動保存されているので、戻っても「続きから」で
 * 再開できる。とはいえ誤タップで抜けると気まずいので、一度だけ確認を挟む
 */
export function TitleReturnButton({ dispatch }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button type="button" className="small-btn ghost title-return-btn" onClick={() => setConfirming(true)}>
        タイトルへ
      </button>
      {confirming && (
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h2 className="popup-title">タイトルに戻りますか？</h2>
            <p className="title-confirm-text">
              今の進行状況は自動保存されています。次に開いたとき「続きから」で再開できます。
            </p>
            <div className="title-confirm-buttons">
              <button type="button" className="small-btn" onClick={() => dispatch({ type: 'backToTitle' })}>
                タイトルへ戻る
              </button>
              <button type="button" className="small-btn ghost" onClick={() => setConfirming(false)}>
                やめる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
