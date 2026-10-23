import type { Faction } from '../core/types';
import castAtlas from '../assets/cast-atlas-v2.webp';
import sceneAtlas from '../assets/scene-atlas-v2.webp';
import expansionAtlas from '../assets/expansion-atlas.webp';
import comboAtlas from '../assets/combo-atlas.webp';
import { getCardArt, getComboArt } from './artCatalog';

const ATLASES = {
  cast: { src: castAtlas, columns: 5, rows: 3 },
  scene: { src: sceneAtlas, columns: 4, rows: 2 },
  expansion: { src: expansionAtlas, columns: 4, rows: 3 },
  combo: { src: comboAtlas, columns: 4, rows: 2 },
};

/** Art stays decorative; the name and current faction remain readable text. */
export function MangaArt({ definitionId, kind = 'card', faction, className = '' }: {
  definitionId: string;
  kind?: 'card' | 'combo';
  faction?: Faction | null;
  className?: string;
}) {
  const ref = kind === 'combo' ? getComboArt(definitionId) : getCardArt(definitionId);
  const { src, columns, rows } = ATLASES[ref.atlas];
  return <span aria-hidden="true" data-art={`${ref.atlas}:${ref.index}`} className={`manga-art ${ref.atlas === 'cast' ? 'manga-portrait' : 'manga-scene'} ${faction ? `manga-art-${faction}` : ''} ${className}`} style={{
    backgroundImage: `url(${src})`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${(ref.index % columns) * 100 / (columns - 1)}% ${Math.floor(ref.index / columns) * 100 / (rows - 1)}%`,
  }} />;
}
