import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import shapes from '../data/shapes.json';

const root = path.resolve(__dirname, '../..');
const jsonPath = path.join(root, 'src/data/shapes.json');

/**
 * カットインの背景図形（ウニフラッシュ／ギザギザ吹き出し）。
 * 形は手続き的に生成してJSONに焼いてあるので、
 * 「生成器を直したのに焼き直し忘れる」ずれを防ぐ。
 */
describe('カットインの背景図形', () => {
  it('生成器を走らせても同じ形になる（決定的で、焼き直し漏れがない）', () => {
    const before = fs.readFileSync(jsonPath, 'utf8');
    execFileSync(process.execPath, [path.join(root, 'scripts/gen-shapes.mjs')], { cwd: root });
    expect(fs.readFileSync(jsonPath, 'utf8')).toBe(before);
  });

  it('ウニフラッシュの針は内側が太く外へ尖る（逆だと外周に黒い棒が並んで見える）', () => {
    const { path: d, core } = shapes.uniFlash;
    // 三角形は「内側の点 → 外側の頂点 → 内側の点」の順。
    // 中心からの距離が 短い → 長い → 短い になっていれば向きは正しい
    const tris = d.match(/M[^Z]+Z/g) ?? [];
    expect(tris.length).toBeGreaterThan(500);
    const dist = (x: number, y: number) => Math.hypot(x - core.cx, y - core.cy);
    let wrong = 0;
    for (const t of tris) {
      const n = (t.match(/-?\d+/g) ?? []).map(Number);
      const [r1, r2, r3] = [dist(n[0]!, n[1]!), dist(n[2]!, n[3]!), dist(n[4]!, n[5]!)];
      if (!(r2 > r1 && r2 > r3)) wrong += 1;
    }
    expect(wrong).toBe(0);
  });

  it('ウニフラッシュの中心の丸は針の根元を覆う（文字を載せる余白になる）', () => {
    const { core, path: d } = shapes.uniFlash;
    const n = (d.match(/-?\d+/g) ?? []).map(Number);
    let minR = Infinity;
    for (let i = 0; i < n.length; i += 2) {
      minR = Math.min(minR, Math.hypot(n[i]! - core.cx, n[i + 1]! - core.cy));
    }
    expect(core.r).toBeGreaterThanOrEqual(minR);
  });

  it('ギザギザ吹き出しは山と谷が交互に並ぶ閉じた多角形', () => {
    const { points, depth } = shapes.balloon;
    const pts = points.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    // 山と谷が交互なので頂点数は偶数
    expect(pts.length % 2).toBe(0);
    expect(pts.length).toBeGreaterThanOrEqual(20);
    const cx = 100;
    const cy = 100;
    const r = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
    // 偶数番（山）は必ず両隣の奇数番（谷）より外にある
    for (let i = 0; i < r.length; i += 2) {
      const prev = r[(i - 1 + r.length) % r.length]!;
      const next = r[(i + 1) % r.length]!;
      expect(r[i]!).toBeGreaterThan(prev);
      expect(r[i]!).toBeGreaterThan(next);
    }
    // 谷はパネルの文字が収まる余白になるので、深すぎないこと
    expect(depth).toBeLessThanOrEqual(0.25);
  });
});
