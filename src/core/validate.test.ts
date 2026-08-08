import { describe, expect, it } from 'vitest';
import cardsJson from '../data/cards.json';
import quotasJson from '../data/quotas.json';
import tutorialJson from '../data/tutorial.json';
import { buildGameData, DataValidationError } from './validate';

describe('buildGameData（14.4節）', () => {
  it('同梱データは検証を通過する', () => {
    const data = buildGameData(cardsJson, quotasJson, tutorialJson);
    expect(data.definitions.size).toBe(cardsJson.characters.length + cardsJson.developments.length);
    expect(data.totalWeeks).toBe(25);
    expect(data.quotas.get(1)!.quota).toBe(300);
    expect(data.quotas.get(8)!.boss).toBe('合併号');
    expect(data.tutorialHands.size).toBe(0); // v5.2: 固定配札は廃止
  });

  it('カードIDの重複を検出する', () => {
    const broken = structuredClone(cardsJson);
    broken.developments[0]!.id = broken.developments[1]!.id;
    expect(() => buildGameData(broken, quotasJson, tutorialJson)).toThrow(DataValidationError);
  });

  it('初期デッキの未定義カード参照を検出する', () => {
    const broken = structuredClone(cardsJson);
    broken.initialDeck.push({ definitionId: 'sonzai_shinai', count: 1 });
    expect(() => buildGameData(broken, quotasJson, tutorialJson)).toThrow(/初期デッキ/);
  });

  it('チュートリアル配札の不正なinstanceIdを検出する', () => {
    const broken = structuredClone(tutorialJson) as { hands: { week: number; instanceIds: string[] }[] };
    broken.hands.push({ week: 1, instanceIds: ['nichijou#99'] });
    expect(() => buildGameData(cardsJson, quotasJson, broken)).toThrow(/tutorial/);
  });

  it('スキーマ違反（負の人気度など）を検出する', () => {
    const broken = structuredClone(cardsJson);
    (broken.characters[0] as { popularity: number }).popularity = -1;
    expect(() => buildGameData(broken, quotasJson, tutorialJson)).toThrow(DataValidationError);
  });

  it('ノルマ表の欠落話数を検出する', () => {
    const broken = structuredClone(quotasJson);
    broken.weeks.splice(2, 1);
    expect(() => buildGameData(cardsJson, broken, tutorialJson)).toThrow(/ノルマ/);
  });
});
