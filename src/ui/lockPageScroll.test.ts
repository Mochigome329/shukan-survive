import { afterEach, expect, it, vi } from 'vitest';
import { lockPageScroll } from './lockPageScroll';

afterEach(() => vi.unstubAllGlobals());

it('freezes the page at its current offset and restores styles and scroll position', () => {
  const bodyStyle = { position: '', top: '', left: '', width: '', overflow: 'auto' };
  const rootStyle = { overflow: '', scrollBehavior: 'smooth' };
  const scrollTo = vi.fn();
  vi.stubGlobal('document', { body: { style: bodyStyle }, documentElement: { style: rootStyle } });
  vi.stubGlobal('window', { scrollX: 0, scrollY: 680, scrollTo });
  const unlock = lockPageScroll();
  expect(bodyStyle.position).toBe('fixed');
  expect(bodyStyle.top).toBe('-680px');
  expect(rootStyle.overflow).toBe('hidden');
  unlock();
  expect(bodyStyle).toEqual({ position: '', top: '', left: '', width: '', overflow: 'auto' });
  expect(rootStyle).toEqual({ overflow: '', scrollBehavior: 'smooth' });
  expect(scrollTo).toHaveBeenCalledWith(0, 680);
});
