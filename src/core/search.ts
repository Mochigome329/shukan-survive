/**
 * 手札内の最高スコア探索（設計書 14.8節、v5.2改訂）。
 * 展開カードの部分集合（0〜4枚）×対象割当を全列挙し、validateSelectionを通過したものを採点する。
 * 未達の原因がノルマ設定の不合理かプレイヤーの選択かを切り分けるための計測基盤。
 */
import { castOf, previewScore, validateSelection } from './run';
import type { PlaySelection, RunState, ScoreBreakdown } from './types';
import { MAX_PLAY_CARDS } from './types';
import type { GameData } from './validate';

function subsets<T>(items: readonly T[], maxSize: number): T[][] {
  const result: T[][] = [[]];
  for (const item of items) {
    const len = result.length;
    for (let i = 0; i < len; i++) {
      const base = result[i]!;
      if (base.length < maxSize) result.push([...base, item]);
    }
  }
  return result;
}

/** 手札から合法なプレイ候補をすべて列挙する（対象割当のバリエーションを含む） */
export function enumerateLegalPlays(data: GameData, state: RunState): PlaySelection[] {
  const byId = new Map(state.cards.map((c) => [c.instanceId, c]));
  const cast = castOf(data, state);
  const castIds = cast.map((c) => c.instanceId);
  const enemyCastIds = cast.filter((c) => c.faction === 'enemy').map((c) => c.instanceId);
  const isChar = (id: string) => data.definitions.get(byId.get(id)!.definitionId)?.kind === 'character';
  const deadChars = state.cards.filter((c) => c.zone === 'dead').map((c) => c.instanceId).filter(isChar);
  const benchChars = state.cards.filter((c) => c.zone === 'bench').map((c) => c.instanceId).filter(isChar);
  const waitingChars = state.cards.filter((c) => c.zone === 'waiting').map((c) => c.instanceId).filter(isChar);
  // 控えのうち敵になれるキャラ（flexFactionまたは既定陣営が敵）。悪役会議の対象候補（v6.3）
  const benchEnemyChars = benchChars.filter((id) => {
    const def = data.definitions.get(byId.get(id)!.definitionId);
    return def?.kind === 'character' && (def.flexFaction || def.faction === 'enemy');
  });

  const candidates: PlaySelection[] = [];

  for (const devs of subsets(state.hand, MAX_PLAY_CARDS)) {
    // 復活・デビューを含む選択では、その対象も onePlayed の候補に含める（v5.7）。
    // 候補を広げるのは実際に該当カードがある場合だけにして、直積が無駄に膨らまないようにする。
    let hasRevive = false;
    let hasDebut = false;
    let hasReturn = false;
    for (const devId of devs) {
      const def = data.definitions.get(byId.get(devId)!.definitionId)!;
      if (def.kind !== 'development') continue;
      for (const { effect } of def.effects) {
        if (effect.type === 'reviveSelect') hasRevive = true;
        if (effect.type === 'debutSelect') hasDebut = true;
        if (effect.type === 'returnSelect') hasReturn = true;
      }
    }
    const joiners = [
      ...(hasRevive ? deadChars : []),
      ...(hasDebut ? benchChars : []),
      ...(hasReturn ? waitingChars : []),
    ];
    const playedOptions = joiners.length > 0 ? [...castIds, ...joiners] : castIds;
    const enemyJoiners = joiners.filter((id) => byId.get(id)!.faction === 'enemy');
    const enemyOptions = enemyJoiners.length > 0 ? [...enemyCastIds, ...enemyJoiners] : enemyCastIds;

    // 対象が必要な展開ごとに候補（onePlayed→場のキャスト、oneDead→死亡済みキャラ）を列挙
    const targetOptions: { devId: string; options: string[] }[] = [];
    let feasible = true;
    for (const devId of devs) {
      const def = data.definitions.get(byId.get(devId)!.definitionId)!;
      if (def.kind !== 'development') continue;
      const options =
        def.target === 'onePlayed'
          ? playedOptions
          : def.target === 'oneEnemy'
            ? enemyOptions
            : def.target === 'oneDead'
              ? deadChars
              : def.target === 'oneBench'
                ? benchChars
                : def.target === 'oneBenchEnemy'
                  ? benchEnemyChars
                  : def.target === 'oneWaiting'
                    ? waitingChars
                    : null;
      if (options) {
        if (options.length === 0) {
          feasible = false;
          break;
        }
        targetOptions.push({ devId, options });
      }
    }
    if (!feasible) continue;

    // 対象割当の直積を展開
    let assignments: Record<string, string>[] = [{}];
    for (const { devId, options } of targetOptions) {
      const next: Record<string, string>[] = [];
      for (const assignment of assignments) {
        for (const option of options) next.push({ ...assignment, [devId]: option });
      }
      assignments = next;
    }

    for (const targets of assignments) {
      candidates.push({ cards: devs, targets });
    }
  }

  return candidates.filter((sel) => validateSelection(data, state, sel).ok);
}

export interface BestPlay {
  selection: PlaySelection;
  breakdown: ScoreBreakdown;
}

/** 合法手のうち最高スコアのプレイを返す（空プレイも合法なのでnullは返らない想定） */
export function findBestPlay(data: GameData, state: RunState): BestPlay | null {
  let best: BestPlay | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    const breakdown = previewScore(data, state, selection);
    if (!best || breakdown.finalScore > best.breakdown.finalScore) {
      best = { selection, breakdown };
    }
  }
  return best;
}
