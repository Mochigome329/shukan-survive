import shapeData from '../data/shapes.json';

/**
 * カットインの背景図形（v7.14）。
 *
 * 以前は枠を border-image の9スライスで描いていたが、9スライスは辺ごとに
 * 同じタイルを繰り返す仕組みなので、全周が均等にギザギザした形や中心から
 * 放射する形は原理的に作れない。角も直角のまま残ってしまう。
 * そこで枠ではなく「1枚の図形」として背後に敷く方式に変えた。
 *
 * 形は scripts/gen-shapes.mjs が生成して src/data/shapes.json に入れてある。
 * 色は焼き込まず styles.css の fill / stroke で決めるので、
 * 種別ごとの色替えはCSSだけで済む。
 */
const SHAPES = shapeData as {
  uniFlash: { viewBox: string; path: string; core: { cx: number; cy: number; r: number } };
  balloon: { viewBox: string; points: string };
};

/**
 * ウニフラッシュ。パネルの背後に敷いて、中央の丸の上に文字を載せる。
 * 縦横に引き伸ばして使うので preserveAspectRatio は none
 */
export function UniFlash() {
  const { viewBox, path, core } = SHAPES.uniFlash;
  return (
    <svg className="cutin-flash" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="cutin-flash-spikes" d={path} />
      <circle className="cutin-flash-core" cx={core.cx} cy={core.cy} r={core.r} />
    </svg>
  );
}

/**
 * ギザギザ吹き出し。パネルいっぱいに広げるため、親に position: relative が要る。
 * 縦横比を無視して伸ばすため、線幅が潰れないよう non-scaling-stroke を付ける
 */
export function JaggedBalloon() {
  const { viewBox, points } = SHAPES.balloon;
  return (
    <svg className="cutin-balloon" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
