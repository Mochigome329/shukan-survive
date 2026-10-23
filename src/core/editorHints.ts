import { quotaAt } from './campaign';
import { returnableCharacters, validateSelection } from './run';
import type { CardInstance, RunState } from './types';
import type { GameData } from './validate';

export interface EditorHint { id: string; text: string }

// Check just one card against existing targets. This never searches combinations or scores.
function usable(data: GameData, run: RunState, instance: CardInstance): boolean {
  const selection = { cards: [instance.instanceId], targets: {} };
  if (validateSelection(data, run, selection).ok) return true;
  return run.cards.some(target => data.definitions.get(target.definitionId)?.kind === 'character'
    && validateSelection(data, run, { ...selection, targets: { [instance.instanceId]: target.instanceId } }).ok);
}

function foreshadowStatus(run: RunState): string {
  const first = run.foreshadowWeeks.length > 0 ? Math.min(...run.foreshadowWeeks) : null;
  return `伏線${run.foreshadowTokens}本${first === null ? '' : `（最初は第${first}話）`}`;
}

function releasesStress(data: GameData, definitionId: string): boolean {
  const def = data.definitions.get(definitionId);
  return def?.kind === 'development' && def.effects.some(({ effect }) => effect.type === 'releaseStress');
}

export function getEditorHints(data: GameData, run: RunState): EditorHint[] {
  if (quotaAt(data, run, run.week)?.final) return [];
  const hints: EditorHint[] = [];
  const returnable = returnableCharacters(data, run);
  if (!run.returnUsedThisWeek && returnable.length > 0) {
    hints.push({ id: 'free-return', text: `再登場できるキャラが${returnable.length}人。連載メモから1人を無料で戻せます。` });
  }
  const hand = run.cards.filter(c => run.hand.includes(c.instanceId));
  const recovery = hand.find(c => c.definitionId === 'fukusen_kaishu' && usable(data, run, c));
  if (run.foreshadowTokens > 0 && recovery) {
    hints.push({ id: 'foreshadow', text: `${foreshadowStatus(run)}。手札の「伏線回収」で回収できます。` });
  }
  if (run.stress > 0) {
    const release = hand.find(c => releasesStress(data, c.definitionId) && usable(data, run, c));
    if (release) {
      hints.push({ id: 'stress', text: `緊張${run.stress}が蓄積中。手札の「${data.definitions.get(release.definitionId)!.name}」で解放できます。` });
    }
  }
  if (run.foreshadowTokens > 0 && !recovery) {
    hints.push({ id: 'foreshadow', text: `${foreshadowStatus(run)}が未回収です。` });
  }
  return hints.slice(0, 2);
}

export function getShopCardHint(data: GameData, run: RunState, definitionId: string): string | null {
  if (quotaAt(data, run, run.week)?.final) return null;
  const def = data.definitions.get(definitionId);
  if (def?.kind !== 'development') return null;
  if (!(definitionId === 'fukusen_kaishu' && run.foreshadowTokens > 0)
    && !(run.stress > 0 && releasesStress(data, definitionId))) return null;
  // A prospective purchase is evaluated on a copy, without changing the real hand.
  let instanceId = 'editor-hint-shop';
  while (run.cards.some(c => c.instanceId === instanceId)) instanceId += '-';
  const instance: CardInstance = {
    instanceId, definitionId, permanentPopularityBonus: 0, faction: null,
    flags: { training: 0, love: false }, acquiredWeek: run.week, playCount: 0,
    zone: 'hand', debutFaction: null,
  };
  const prospective = { ...run, cards: [...run.cards, instance], hand: [...run.hand, instanceId] };
  if (!usable(data, prospective, instance)) return null;
  if (definitionId === 'fukusen_kaishu') return `${foreshadowStatus(run)}の回収に使えます。`;
  if (releasesStress(data, definitionId)) return `いま溜まっている緊張${run.stress}の解放に使えます。`;
  return null;
}
