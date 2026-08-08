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

    /*
     * ハイライトの上下端をCSS変数として公開する（v7.15）。
     * 説明の箱は上下どちらへ寄せるかしか知らないので、
     * 中身が長い手順だと寄せた先でハイライトに重なって隠してしまう。
     * 実測値を渡して、箱が自分の高さを空きに合わせて抑えられるようにする。
     * スクロールの最中は位置が動くので、落ち着くまで数フレーム追いかける
     */
    const root = document.documentElement;
    const publish = () => {
      const r = el.getBoundingClientRect();
      root.style.setProperty('--tutorial-target-top', `${Math.round(r.top)}px`);
      root.style.setProperty('--tutorial-target-bottom', `${Math.round(r.bottom)}px`);
      return Math.round(r.top);
    };
    // まず今の位置で入れておく。スクロールが終わるのを待つと、その間だけ箱が伸びてしまう
    let last = publish();
    let stable = 0;
    /*
     * スクロールが終わるまで追いかける。requestAnimationFrame ではなく
     * setInterval を使うのは、非表示のタブや裏に回ったウィンドウでは
     * rAF が止まってしまい、位置が古いまま固定されてしまうため
     */
    const timer = setInterval(() => {
      const top = publish();
      stable = top === last ? stable + 1 : 0;
      last = top;
      if (stable >= 3) clearInterval(timer);
    }, 80);
    const stop = setTimeout(() => clearInterval(timer), 1500);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
      root.style.removeProperty('--tutorial-target-top');
      root.style.removeProperty('--tutorial-target-bottom');
    };
  }, [target]);
}
