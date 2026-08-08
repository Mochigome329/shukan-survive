/**
 * カットインの背景図形（ウニフラッシュ／ギザギザ吹き出し）を生成し、
 * src/data/shapes.json に書き出す。
 *
 * 手で書けない量の頂点を持つので、手続き的に作って形だけを保存する。
 * 色は焼き込まず styles.css の fill/stroke で決めるため、ここでは幾何だけを出力する。
 *
 *   node scripts/gen-shapes.mjs
 *
 * 同じシードなら毎回まったく同じ形になるので、実行しても差分は出ない。
 * 形を変えたいときはこのファイルのパラメータを編集して再実行する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 線形合同法。Math.random と違って毎回同じ列が出る */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * ウニフラッシュ（放射状の集中線）。
 *
 * 針は「内側が太く、外へ向かって尖る」向きに描く。
 * 逆向き（外周側を太く）にすると外周に黒い棒が並んで見えてしまい、
 * 中心から放射する感じが出ないうえ周囲だけが妙に目立つ。
 * 底辺を内側の半径に置き、頂点を外側に取ることでこれを避けている。
 */
function uniFlash({
  size = 400,
  spikes = 900,
  inner = 0.26,
  outer = 0.38,
  jitterIn = 0.05,
  jitterOut = 0.36,
  seed = 7,
} = {}) {
  const r = rng(seed);
  const c = size / 2;
  const parts = [];
  for (let i = 0; i < spikes; i++) {
    // 角度は等間隔＋ゆらぎ。完全に等間隔だと機械的な模様に見える
    const th = ((i + r() * 0.9) / spikes) * Math.PI * 2;
    const ri = size * inner * (1 + (r() - 0.5) * jitterIn);
    const ro = size * outer * (1 + (r() - 0.5) * jitterOut);
    const w = ((Math.PI * 2) / spikes) * (0.5 + r() * 1.1);
    const n = (v) => Math.round(v);
    parts.push(
      `M${n(c + Math.cos(th - w) * ri)} ${n(c + Math.sin(th - w) * ri)}` +
        `L${n(c + Math.cos(th) * ro)} ${n(c + Math.sin(th) * ro)}` +
        `L${n(c + Math.cos(th + w) * ri)} ${n(c + Math.sin(th + w) * ri)}Z`,
    );
  }
  return {
    viewBox: `0 0 ${size} ${size}`,
    path: parts.join(''),
    // 針の内端との間に隙間ができないよう、中心の丸は内側半径よりわずかに大きく取る
    core: { cx: c, cy: c, r: Math.round(size * inner * 1.04) },
  };
}

/**
 * ギザギザ吹き出し（爆発型フキダシ）。外周の頂点と内側の谷を交互に置いた多角形。
 *
 * border-image の9スライスではなくパネル全体を覆う1枚の図形として使う。
 * 9スライスだと辺ごとに同じタイルが繰り返されるため、
 * 全周が均等にギザギザした形は原理的に作れず、角も直角のまま残ってしまう。
 */
function jaggedBalloon({ size = 200, teeth = 22, outer = 0.5, depth = 0.22, jitter = 0.16, seed = 3 } = {}) {
  const r = rng(seed);
  const c = size / 2;
  const ro = size * outer;
  const ri = ro * (1 - depth);
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const tOut = (i / teeth) * Math.PI * 2;
    const tIn = ((i + 0.5) / teeth) * Math.PI * 2;
    const rOut = ro * (1 - r() * jitter);
    const rIn = ri * (1 - r() * jitter * 0.5);
    const n = (v) => Math.round(v * 10) / 10;
    pts.push(`${n(c + Math.cos(tOut) * rOut)},${n(c + Math.sin(tOut) * rOut)}`);
    pts.push(`${n(c + Math.cos(tIn) * rIn)},${n(c + Math.sin(tIn) * rIn)}`);
  }
  return { viewBox: `0 0 ${size} ${size}`, points: pts.join(' '), depth };
}

const shapes = { uniFlash: uniFlash(), balloon: jaggedBalloon() };
const dest = path.join(root, 'src/data/shapes.json');
fs.writeFileSync(dest, `${JSON.stringify(shapes, null, 2)}\n`);
console.log(
  `${path.relative(root, dest)} を書き出した` +
    ` — ウニフラッシュ ${shapes.uniFlash.path.length} 文字 / 吹き出し ${shapes.balloon.points.length} 文字`,
);
