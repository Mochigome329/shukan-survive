/**
 * データファイルのZod検証（設計書 14.4節）。
 * cards.json / quotas.json / tutorial.json を起動時に検証し、
 * 不正な定義は開発画面で明示的に停止させる。
 */
import { z } from 'zod';
import type { CardDefinition } from './types';

const genreTagSchema = z.enum(['battle']);
const timingSchema = z.enum(['selection', 'preScore', 'postScore', 'endWeek', 'nextWeekStart']);

const cardEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('grantTrainingFlag'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('grantLoveFlag') }),
  z.object({ type: z.literal('flipFactionAtEndWeek') }),
  z.object({ type: z.literal('setFactionAtEndWeek'), faction: z.enum(['ally', 'enemy']) }),
  z.object({ type: z.literal('moveZoneAtEndWeek'), zone: z.enum(['dead', 'waiting']), faction: z.enum(['ally', 'enemy']).optional() }),
  z.object({ type: z.literal('gainToken'), token: z.literal('foreshadow'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('startTimedModifier'), modifierId: z.string().min(1), duration: z.number().int().positive() }),
  z.object({ type: z.literal('restoreAllFreshness') }),
  z.object({ type: z.literal('reduceAllFreshnessNextWeek'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('bypassQuota') }),
  // 恒久補正は負の値も許す（夢オチの信頼低下など）
  z.object({ type: z.literal('permanentPopularityAll'), amount: z.number().int() }),
  z.object({ type: z.literal('permanentPopularityTarget'), amount: z.number().int() }),
  z.object({ type: z.literal('permanentPopularityLowest'), amount: z.number().int(), faction: z.enum(['ally', 'enemy']).optional() }),
  z.object({ type: z.literal('reviveSelect') }),
  z.object({ type: z.literal('debutSelect'), faction: z.enum(['ally', 'enemy']).optional() }),
  z.object({ type: z.literal('addStress'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('releaseStress') }),
  z.object({ type: z.literal('reviveAllDead') }),
  z.object({ type: z.literal('returnSelect') }),
  z.object({ type: z.literal('restoreFreshness'), amount: z.number() }),
  z.object({ type: z.literal('clearCharFlags') }),
  z.object({ type: z.literal('temporaryPopularityAll'), amount: z.number().int() }),
  z.object({ type: z.literal('buzzPerDead'), amount: z.number().int() }),
  z.object({ type: z.literal('restoreDebutFaction') }),
  z.object({ type: z.literal('defeatStrongestEnemyAtEndWeek') }),
]);

const timedEffectSchema = z.object({ timing: timingSchema, effect: cardEffectSchema });

const descriptionsSchema = z.object({
  internal: z.string().min(1),
  hidden: z.string().min(1),
  revealed: z.string().min(1),
});

const actSchema = z.enum(['jo', 'ha', 'kyu']);

const characterDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.literal('character'),
  popularity: z.number().int().positive(),
  faction: z.enum(['ally', 'enemy']),
  tags: z.array(genreTagSchema),
  maxCopies: z.literal(1), // 1人物1枚の原則（14.1節）
  unlockWeek: z.number().int().min(1),
  act: z.union([actSchema, z.array(actSchema).min(1)]).optional(),
  rare: z.boolean().optional(),
  flexFaction: z.boolean().optional(),
  descriptions: descriptionsSchema,
});

const developmentDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.literal('development'),
  buzz: z.number().int().min(0),
  target: z.enum(['none', 'onePlayed', 'allPlayed', 'oneDead', 'oneBench', 'oneWaiting', 'oneEnemy', 'oneBenchEnemy']),
  tags: z.array(genreTagSchema),
  maxCopies: z.number().int().min(1),
  unlockWeek: z.number().int().min(1),
  act: z.union([actSchema, z.array(actSchema).min(1)]).optional(),
  rare: z.boolean().optional(),
  soloOnly: z.boolean(),
  effects: z.array(timedEffectSchema),
  descriptions: descriptionsSchema,
});

const cardsFileSchema = z.object({
  characters: z.array(characterDefSchema),
  developments: z.array(developmentDefSchema),
  initialDeck: z.array(
    z.object({
      definitionId: z.string().min(1),
      count: z.number().int().min(1),
      /** キャラの開始位置。省略時は場。benchは控えスタート（v5.2） */
      start: z.enum(['field', 'bench']).optional(),
    }),
  ),
  /**
   * 初期デッキの可変枠（v7.13）。
   * ランごとにこのプールから starterSlots 枚を重複なしで引き、初期デッキに加える。
   * 固定枠だけだと毎回まったく同じ出だしになり、序盤が単調になるため
   */
  starterPool: z.array(z.string().min(1)).optional(),
  starterSlots: z.number().int().min(0).optional(),
});

const quotasFileSchema = z.object({
  weeks: z.array(
    z.object({
      week: z.number().int().min(1),
      quota: z.number().int().positive(),
      boss: z.string().optional(),
      final: z.boolean().optional(),
    }),
  ),
});

const tutorialFileSchema = z.object({
  hands: z.array(z.object({ week: z.number().int().min(1), instanceIds: z.array(z.string().min(1)) })),
});

export type CardsFile = z.infer<typeof cardsFileSchema>;
export type QuotasFile = z.infer<typeof quotasFileSchema>;
export type TutorialFile = z.infer<typeof tutorialFileSchema>;

export interface QuotaEntry {
  week: number;
  quota: number;
  boss?: string;
  final?: boolean;
}

/** 検証済みデータ一式。コア関数はすべてこれを引数で受け取る（環境非依存） */
export interface GameData {
  definitions: ReadonlyMap<string, CardDefinition>;
  quotas: ReadonlyMap<number, QuotaEntry>;
  initialDeck: readonly { definitionId: string; count: number; start?: 'field' | 'bench' }[];
  /** 初期デッキの可変枠の候補（v7.13） */
  starterPool: readonly string[];
  /** 可変枠から引く枚数（v7.13） */
  starterSlots: number;
  tutorialHands: ReadonlyMap<number, readonly string[]>;
  totalWeeks: number;
}

export class DataValidationError extends Error {
  constructor(public issues: string[]) {
    super(`データ検証に失敗しました:\n${issues.map((s) => `  - ${s}`).join('\n')}`);
    this.name = 'DataValidationError';
  }
}

/** JSONデータを検証してGameDataを組み立てる。不正ならDataValidationErrorを投げる */
export function buildGameData(cardsJson: unknown, quotasJson: unknown, tutorialJson: unknown): GameData {
  const issues: string[] = [];

  const cards = cardsFileSchema.safeParse(cardsJson);
  const quotas = quotasFileSchema.safeParse(quotasJson);
  const tutorial = tutorialFileSchema.safeParse(tutorialJson);
  if (!cards.success || !quotas.success || !tutorial.success) {
    if (!cards.success) issues.push(...cards.error.issues.map((i) => `cards.json: ${i.path.join('.')} ${i.message}`));
    if (!quotas.success) issues.push(...quotas.error.issues.map((i) => `quotas.json: ${i.path.join('.')} ${i.message}`));
    if (!tutorial.success) issues.push(...tutorial.error.issues.map((i) => `tutorial.json: ${i.path.join('.')} ${i.message}`));
    throw new DataValidationError(issues);
  }

  const definitions = new Map<string, CardDefinition>();
  for (const def of [...cards.data.characters, ...cards.data.developments]) {
    if (definitions.has(def.id)) issues.push(`cards.json: カードIDが重複しています: ${def.id}`);
    definitions.set(def.id, def as CardDefinition);
  }

  for (const entry of cards.data.initialDeck) {
    const def = definitions.get(entry.definitionId);
    if (!def) {
      issues.push(`cards.json: 初期デッキが未定義カードを参照しています: ${entry.definitionId}`);
      continue;
    }
    if (entry.count > def.maxCopies) {
      issues.push(`cards.json: 初期デッキの ${entry.definitionId} が最大所持数(${def.maxCopies})を超えています`);
    }
    if (entry.start && def.kind !== 'character') {
      issues.push(`cards.json: 展開カードにstartは指定できません: ${entry.definitionId}`);
    }
  }

  // 初期デッキの可変枠（v7.13）。序盤に引いて何もできない札が混ざらないよう、条件を厳しめに検査する
  const starterPool = cards.data.starterPool ?? [];
  const starterSlots = cards.data.starterSlots ?? 0;
  if (starterSlots > starterPool.length) {
    issues.push(`cards.json: starterSlots(${starterSlots}) が starterPool の枚数(${starterPool.length})を超えています`);
  }
  if (new Set(starterPool).size !== starterPool.length) {
    issues.push('cards.json: starterPool に重複があります');
  }
  for (const id of starterPool) {
    const def = definitions.get(id);
    if (!def) {
      issues.push(`cards.json: starterPool が未定義カードを参照しています: ${id}`);
      continue;
    }
    if (def.kind !== 'development') issues.push(`cards.json: starterPool にはキャラを入れられません: ${id}`);
    else if (def.unlockWeek > 1) issues.push(`cards.json: starterPool のカードは第1話から使える必要があります: ${id}`);
    if (cards.data.initialDeck.some((e) => e.definitionId === id)) {
      issues.push(`cards.json: starterPool のカードが固定枠にもあります: ${id}`);
    }
  }

  const quotaMap = new Map<number, QuotaEntry>();
  for (const entry of quotas.data.weeks) {
    if (quotaMap.has(entry.week)) issues.push(`quotas.json: 話数が重複しています: ${entry.week}`);
    quotaMap.set(entry.week, entry);
  }
  const totalWeeks = quotas.data.weeks.length;
  for (let w = 1; w <= totalWeeks; w++) {
    if (!quotaMap.has(w)) issues.push(`quotas.json: 第${w}話のノルマがありません`);
  }

  // チュートリアル固定配札のinstanceIdが初期デッキから生成される実体と一致するか
  const validInstanceIds = new Set<string>();
  for (const entry of cards.data.initialDeck) {
    for (let i = 1; i <= entry.count; i++) validInstanceIds.add(`${entry.definitionId}#${i}`);
  }
  const tutorialHands = new Map<number, readonly string[]>();
  for (const hand of tutorial.data.hands) {
    if (tutorialHands.has(hand.week)) issues.push(`tutorial.json: 話数が重複しています: ${hand.week}`);
    for (const id of hand.instanceIds) {
      if (!validInstanceIds.has(id)) issues.push(`tutorial.json: 第${hand.week}話の配札が初期デッキに存在しません: ${id}`);
    }
    if (new Set(hand.instanceIds).size !== hand.instanceIds.length) {
      issues.push(`tutorial.json: 第${hand.week}話の配札に重複があります`);
    }
    tutorialHands.set(hand.week, hand.instanceIds);
  }

  if (issues.length > 0) throw new DataValidationError(issues);

  return {
    definitions,
    quotas: quotaMap,
    initialDeck: cards.data.initialDeck,
    starterPool,
    starterSlots,
    tutorialHands,
    totalWeeks,
  };
}
