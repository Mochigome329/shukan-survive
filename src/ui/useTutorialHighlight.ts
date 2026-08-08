import { useEffect } from 'react';

/** ハイライト対象の部位名 → その要素を探すセレクタ */
const SELECTORS: Record<string, string> = {
  header: '.play-header',
  cast: '.cast',
  hand: '.hand',
  preview: '.preview',
  codex: '.codex-btn',
  status: '.status-row',
  funds: '.play-header',
  pack: '.shop-group-pack',
  service: '.shop-group-service',
};

/**
 * チュートリアルで光らせている部位を画面内へスクロールする（v7.5b）。
 *
 * 編集会議は全体が1画面に収まらないので、説明だけ出しても
 * 「どこの話をしているのか」が画面外にあることがある。手順が変わるたびに寄せる。
 */
export function useTutorialHighlight(target: string | undefined): void {
  useEffect(() => {
    if (!target) return;
    const selector = SELECTORS[target];
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    // 端末の設定で動きを抑えている場合は瞬時に移動する
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [target]);
}
