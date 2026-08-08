/**
 * データの読み込みと起動時検証（14.4節）。
 * 不正な定義はDataValidationErrorとなり、main.tsxがエラー画面を表示する。
 */
import cardsJson from './cards.json';
import quotasJson from './quotas.json';
import tutorialJson from './tutorial.json';
import { buildGameData, type GameData } from '../core/validate';

export function loadGameData(): GameData {
  return buildGameData(cardsJson, quotasJson, tutorialJson);
}
