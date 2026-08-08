import { useState } from 'react';
import sfxData from '../data/sfx.json';

/**
 * カットインに重ねる漫画の描き文字（v7.6d）。
 *
 * 字形はフォントではなく、手描き風に生成した描き文字をSVGパスに起こしたもの
 * （scripts/trace-sfx.mjs が output/images/*.png から src/data/sfx.json を作る）。
 * フォントだと「効果音を書いた」感が出ないため、あえて画像由来の輪郭を持たせている。
 * データURIのPNGではなくパスなので、単一HTML配布でも1語あたり7〜11KBで済む。
 */
const SFX = sfxData as Record<string, { viewBox: string; path: string }>;

/**
 * 丸ペンで書いたような、角を立てない筆致の語。
 * 衝撃音（ドン！・バーン！等）とは輪郭と影の付け方を変える
 */
const ROUND_IDS = new Set(['waiwai', 'zawazawa', 'jiin', 'poroporo', 'horori']);

type Props = {
  /** sfx.json のキー */
  id: string;
};

export function SfxMark({ id }: Props) {
  // 毎回パネルの上に出ると単調なので、出現ごとに上下どちらに置くかを振る。
  // 遅延初期化なので採点中の再レンダー（カウントアップ等）では固定されたまま動かない
  const [pos] = useState(() => (Math.random() < 0.5 ? 'top' : 'bottom'));
  const mark = SFX[id];
  if (!mark) return null;
  return (
    <svg
      className={`cutin-sfx cutin-sfx-${pos}${ROUND_IDS.has(id) ? ' sfx-round' : ''}`}
      viewBox={mark.viewBox}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 縁取りの太さは表示サイズに関わらず一定にしたいので non-scaling-stroke */}
      <path d={mark.path} fillRule="evenodd" paintOrder="stroke" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** その描き文字が使えるか（未生成の語はカットインに何も重ねない） */
export function hasSfx(id: string | undefined): boolean {
  return !!id && !!SFX[id];
}
