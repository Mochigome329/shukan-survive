/**
 * セーブ・ロード（v6.8）。
 *
 * 全25話は一気に遊ぶには長いので、ブラウザを閉じても続きから遊べるようにする。
 * スロットは1つだけ（オートセーブ）。保存するのは RunState と「どの画面で中断したか」だけで、
 * 選択中のカードやリザルトの演出状態といったUI都合の状態は持たない。
 * そのため再開すると、週プレイ中なら手札はそのままで選択だけがリセットされた状態から、
 * 編集会議中なら提示カードを引き直した状態から始まる。
 *
 * localStorage が使えない環境（プライベートモード等）でも落ちないよう、
 * すべての入出力を try/catch で包み、失敗時は「セーブなし」として扱う。
 */
import type { RunState } from './types';

const STORAGE_KEY = 'uchikiri-survivor:save';

/**
 * セーブ形式のバージョン。
 * RunState に必須フィールドを足したら上げて、migrate() に補完処理を書く
 */
export const SAVE_VERSION = 1;

/** 中断できる場面。週プレイ中と編集会議中の2つだけ（リザルト演出中などは保存しない） */
export type SavePhase = 'play' | 'shop';

export interface SaveData {
  version: number;
  /** 保存時刻（ISO文字列）。「続きから」の表示に使う */
  savedAt: string;
  /** どの画面で中断したか。省略時は 'play' として扱う */
  phase?: SavePhase;
  run: RunState;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // プライベートモードなどで localStorage 自体の参照が例外になる場合がある
    return null;
  }
}

/** 現在のランを保存する。失敗しても例外は投げない（セーブできないだけ） */
export function saveRun(run: RunState, phase: SavePhase = 'play', now: Date = new Date()): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const data: SaveData = { version: SAVE_VERSION, savedAt: now.toISOString(), phase, run };
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // 容量超過など
    return false;
  }
}

/**
 * 古いバージョンのセーブを現行の形に補完する。
 * 読めない・古すぎて補完できない場合は null を返して「セーブなし」として扱う
 */
function migrate(data: SaveData): SaveData | null {
  if (data.version > SAVE_VERSION) return null; // 新しい版で保存されたものは読めない
  return data;
}

/** 最低限の形チェック。壊れたJSONを読み込んでゲームが崩壊するのを防ぐ */
function looksLikeRun(run: unknown): run is RunState {
  if (!run || typeof run !== 'object') return false;
  const r = run as Partial<RunState>;
  return (
    typeof r.runSeed === 'number' &&
    typeof r.week === 'number' &&
    typeof r.mangaTitle === 'string' &&
    Array.isArray(r.cards) &&
    Array.isArray(r.hand) &&
    Array.isArray(r.log)
  );
}

/** 保存されたランを読む。無い・壊れている・新しすぎる場合は null */
export function loadSave(): SaveData | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (typeof parsed?.version !== 'number' || !looksLikeRun(parsed.run)) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}

/** セーブを消す（連載が終わったとき・新しく始めるとき） */
export function clearSave(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても実害はない
  }
}
