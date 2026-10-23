import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadTestData, makeInstance } from '../core/testHelpers';
import { CardView } from './CardView';
import { MangaArt } from './MangaArt';

const data = loadTestData();
describe('current faction and illustration identity', () => {
  it('uses the current faction after a defection, without changing the character portrait', () => {
    const def = data.definitions.get('heroine')!;
    for (const faction of ['ally', 'enemy'] as const) {
      const instance = makeInstance(data, 'heroine', 1, { faction });
      const html = renderToStaticMarkup(createElement(CardView, { instance, def, onTap: () => {} }));
      expect(html).toContain(`data-faction="${faction}"`);
      expect(html).toContain(`manga-art-${faction}`);
      expect(html).toContain('data-art="cast:1"');
      expect(html).toContain(faction === 'ally' ? '仲間' : '敵');
    }
  });
  it('renders different art for a development and a combo with the same ID', () => {
    const render = (kind: 'card' | 'combo') => renderToStaticMarkup(createElement(MangaArt, { definitionId: 'fukusen_kaishu', kind }));
    expect(render('card')).toContain('data-art="scene:2"');
    expect(render('combo')).toContain('data-art="combo:2"');
  });
});
