import { SETUP_COMBO_IDS } from '../core/combos';
import type { ComboScoreDetail, RunState, ScoreBreakdown } from '../core/types';

/** 初発見と仕込み・回収だけを個別に見せ、既知の通常役は一覧にまとめる。 */
export function selectFeaturedCombos(
  combos: readonly ComboScoreDetail[],
  newDiscoveries: ReadonlySet<string>,
): ComboScoreDetail[] {
  return combos.filter((combo) => combo.status === 'applied' && (
    newDiscoveries.has(combo.comboId)
    || SETUP_COMBO_IDS.has(combo.comboId)
    || combo.cutInTemplate === 'setupPayoff'
  ));
}

/** 解決前の仕込みと実際に発生した効果だけを結び付ける、リザルト用の一言。 */
export function getPayoffNote(before: RunState, breakdown: ScoreBreakdown): string | null {
  if (before.foreshadowTokens > 0
    && breakdown.stateChanges.some(change => change.type === 'consumeForeshadowTokens')) {
    const origin = before.foreshadowWeeks.length > 0
      ? `第${Math.min(...before.foreshadowWeeks)}話から`
      : '';
    return `${origin}仕込んだ伏線${before.foreshadowTokens}本が、ここでつながった。`;
  }
  if (breakdown.stressReleased >= 2) return `溜めた緊張${breakdown.stressReleased}を、一気に解放。`;
  return null;
}
