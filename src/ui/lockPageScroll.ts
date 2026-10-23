/** overflow alone does not reliably stop the document moving under an iOS modal. */
export function lockPageScroll(): () => void {
  const body = document.body.style;
  const root = document.documentElement.style;
  const x = window.scrollX;
  const y = window.scrollY;
  const saved = { position: body.position, top: body.top, left: body.left, width: body.width, overflow: body.overflow };
  const rootOverflow = root.overflow;
  const scrollBehavior = root.scrollBehavior;
  Object.assign(body, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' });
  root.overflow = 'hidden';
  return () => {
    Object.assign(body, saved);
    root.overflow = rootOverflow;
    root.scrollBehavior = 'auto';
    window.scrollTo(x, y);
    root.scrollBehavior = scrollBehavior;
  };
}
