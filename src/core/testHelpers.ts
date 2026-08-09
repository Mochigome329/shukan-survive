/** テストとシミュレーションで共有するヘルパー */
import cardsJson from '../data/cards.json';
import quotasJson from '../data/quotas.json';
import quotasShortJson from '../data/quotas-short.json';
import tutorialJson from '../data/tutorial.json';
import { buildGameData, type GameData } from './validate';
import type { CardInstance, RunState } from './types';

export function loadTestData(): GameData {
  return buildGameData(cardsJson, quotasJson, tutorialJson, quotasShortJson);
}

/**
 * テスト用: 任意の定義からカード実体を1枚作る。
 * v5.2の既定zone: キャラは場（field）、展開は手札（hand）
 */
export function makeInstance(data: GameData, definitionId: string, suffix: number, overrides: Partial<CardInstance> = {}): CardInstance {
  const def = data.definitions.get(definitionId);
  if (!def) throw new Error(`定義がありません: ${definitionId}`);
  return {
    instanceId: `${definitionId}#${suffix}`,
    definitionId,
    permanentPopularityBonus: 0,
    faction: def.kind === 'character' ? def.faction : null,
    flags: { training: 0, love: false },
    acquiredWeek: 0,
    playCount: 0,
    zone: def.kind === 'character' ? 'field' : 'hand',
    debutFaction: def.kind === 'character' ? def.faction : null,
    ...overrides,
  };
}

/** テスト用: カード実体列から直接RunStateを組む（zone==='hand'のものが手札になる） */
export function makeState(cards: CardInstance[], week = 1, overrides: Partial<RunState> = {}): RunState {
  return {
    runSeed: 1,
    mangaTitle: 'テスト連載',

    week,
    cards,
    hand: cards.filter((c) => c.zone === 'hand').map((c) => c.instanceId),
    redrawsUsed: 0,
    foreshadowTokens: 0,
    foreshadowWeeks: [],
    stress: 0,
    warnings: 0,
    freshnessByDef: {},
    comboFreshness: {},
    modifiers: [],
    pendingFreshnessPenalty: 0,
    returnUsedThisWeek: false,
    setupComboHistory: [],
    highlightIds: [],
    stockedIds: [],
    guaranteedNextHand: [],
    funds: 0,
    shopPurchases: 0,
    comboUsage: { oncePerRun: [], perCharacter: {} },
    permanentBuzzByDef: {},
    upgrades: [],
    demands: [],
    log: [],
    ...overrides,
  };
}
