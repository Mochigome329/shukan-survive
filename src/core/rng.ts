/**
 * シード注入可能な乱数（設計書 14.7節）。
 * 乱数系列は用途ごとに分離し、引き直し回数がショップや次週の配札へ影響しないようにする。
 */

/** mulberry32。32bitシードから [0,1) の乱数列を生成する */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列と数値の列を32bitシードへ畳み込む（FNV-1aベース） */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? `#${part}` : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x9e3779b9; // 区切りを混ぜて "a"+"bc" と "ab"+"c" を区別する
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rng = () => number;

/** 用途別シード（14.7節の4系列） */
export function drawRng(runSeed: number, week: number, drawIndex: number): Rng {
  return mulberry32(hashSeed(runSeed, 'draw', week, drawIndex));
}

export function redrawRng(runSeed: number, week: number, redrawCount: number): Rng {
  return mulberry32(hashSeed(runSeed, 'redraw', week, redrawCount));
}

export function shopRng(runSeed: number, week: number): Rng {
  return mulberry32(hashSeed(runSeed, 'shop', week));
}

export function bossRng(runSeed: number): Rng {
  return mulberry32(hashSeed(runSeed, 'boss'));
}

/** Fisher-Yatesシャッフル（元配列は破壊しない） */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** 整数 [0, n) */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * 重み付き非復元抽出（ルーレット選択）。
 * 重み0以下の項目は選ばれない。countがitems.lengthを超える場合は全件を返す（順序は抽選順）。
 */
export function weightedSample<T>(items: readonly { item: T; weight: number }[], count: number, rng: Rng): T[] {
  const pool = items.filter((x) => x.weight > 0).map((x) => ({ ...x }));
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, x) => sum + x.weight, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j]!.weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    result.push(pool[idx]!.item);
    pool.splice(idx, 1);
  }
  return result;
}
