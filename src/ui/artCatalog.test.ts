import { describe, expect, it } from 'vitest';
import cards from '../data/cards.json';
import { COMBO_REGISTRY } from '../core/combos';
import { CARD_ART, COMBO_ART, getCardArt, getComboArt } from './artCatalog';

describe('manga art catalog', () => {
  it('explicitly maps every known card and combo, without stale IDs', () => {
    expect(Object.keys(CARD_ART).sort()).toEqual([...cards.characters, ...cards.developments].map(c => c.id).sort());
    expect(Object.keys(COMBO_ART).sort()).toEqual(COMBO_REGISTRY.map(c => c.id).sort());
  });
  it('preserves the fifteen portrait positions', () => {
    const ids = ['hero', 'heroine', 'aibou', 'osananajimi', 'rival', 'shishou', 'mascot', 'shukuteki', 'haha', 'chichi', 'teki_kanbu_power', 'teki_kanbu_brain', 'sanmaime', 'yowamushi', 'ippanjin'];
    ids.forEach((id, index) => expect(getCardArt(id)).toEqual({ atlas: 'cast', index }));
  });
  it('uses each expansion frame for its intended subject', () => {
    ['tournament', 'buki_get', 'waza_get', 'teki_soshiki', 'kokuhaku', 'okaeri', 'kaisou', 'shinchara', 'kyuushutsu', 'jiko_gisei', 'timeskip', 'tozasareta_butai']
      .forEach((id, index) => expect(getCardArt(id)).toEqual({ atlas: 'expansion', index }));
  });
  it('uses each dedicated combo scene for the intended payoff', () => {
    ['rival_taiketsu', 'keishou_no_kakusei', 'fukusen_kaishu', 'ryouomoi', 'saishuu_kessen', 'dark_hero', 'ketsui_no_wakare', 'densetsu_no_kanketsu']
      .forEach((id, index) => expect(getComboArt(id)).toEqual({ atlas: 'combo', index }));
  });
  it('keeps card and combo IDs in separate namespaces', () => {
    expect(getCardArt('fukusen_kaishu')).toEqual({ atlas: 'scene', index: 2 });
    expect(getComboArt('fukusen_kaishu')).toEqual({ atlas: 'combo', index: 2 });
  });
  it('stays within each atlas and uses scene, expansion and combo art for combos', () => {
    const limits = { cast: 15, scene: 8, expansion: 12, combo: 8 };
    for (const ref of [...Object.values(CARD_ART), ...Object.values(COMBO_ART)]) {
      expect(Number.isInteger(ref.index)).toBe(true);
      expect(ref.index).toBeGreaterThanOrEqual(0);
      expect(ref.index).toBeLessThan(limits[ref.atlas]);
    }
    expect(new Set(Object.values(COMBO_ART).map(ref => ref.atlas))).toEqual(new Set(['scene', 'expansion', 'combo']));
  });
  it('falls back safely for unknown and object-prototype IDs', () => {
    for (const id of ['unknown', 'constructor', '__proto__']) {
      expect(getCardArt(id)).toEqual({ atlas: 'scene', index: 0 });
      expect(getComboArt(id)).toEqual({ atlas: 'scene', index: 0 });
    }
  });
});
