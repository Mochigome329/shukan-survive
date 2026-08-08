import { useState } from 'react';
import { isMuted, playFlip, toggleMuted } from './audio';

interface Props {
  /**
   * v7.9c: 話づくり画面のヘッダーは「タイトルへ」「役図鑑」ボタンと右上を取り合っていたため、
   * ピクセル指定で場所を空けるのはやめ、その画面ではヘッダーの他ボタンと同じ並びの
   * 通常ボタンとして描画できるようにした（右上に浮かせるのは他の画面だけ）
   */
  variant?: 'floating' | 'inline';
}

/**
 * 効果音のオン/オフ（v7.7）。
 * 効果音はプレイ画面だけでなくリザルト画面（カットインの音階・歓声）でも鳴るため、
 * 特定の画面のヘッダーではなく、既定では常時アプリ全体に重ねて表示する（App.tsxから描画）
 */
export function SoundToggle({ variant = 'floating' }: Props) {
  const [muted, setMutedState] = useState(isMuted);

  return (
    <button
      type="button"
      className={
        variant === 'inline'
          ? `small-btn ghost sound-toggle-btn ${muted ? 'sound-toggle-btn-off' : ''}`
          : `sound-toggle ${muted ? 'sound-toggle-off' : ''}`
      }
      data-sfx="skip"
      aria-label={muted ? '効果音オフ（タップでオン）' : '効果音オン（タップでオフ）'}
      onClick={() => {
        const nowMuted = toggleMuted();
        setMutedState(nowMuted);
        // オンにした直後は、切り替え自体をシュッという音で確認できるようにする
        if (!nowMuted) playFlip();
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
