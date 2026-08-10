import { useEffect, useState } from 'react';

/**
 * ごく簡易なアクセスカウンター（v7.32）。
 *
 * このゲームはサーバーを持たない単一HTML配布なので、無料の外部カウンターAPI（Abacus）に
 * 加算を依頼するだけの最小構成にした。ページ読み込みごとに1回だけ加算する
 * （「タイトルへ」で戻ってきても数え直さないよう、加算済みフラグはモジュール変数に持つ）。
 *
 * オフラインで開いた場合やサービス側の障害時はfetchが失敗するだけで、
 * 数字を表示しない以外の影響はない（ゲーム進行を止めたり通信を再試行したりしない）。
 */
const NAMESPACE = 'shukan-survive-mochigome329';
const KEY = 'title-view';

let countedThisPageLoad = false;

export function AccessCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (countedThisPageLoad) return;
    countedThisPageLoad = true;
    fetch(`https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${KEY}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'value' in data && typeof data.value === 'number') {
          setCount(data.value);
        }
      })
      .catch(() => {
        // オフライン・サービス障害時は静かに諦める
      });
  }, []);

  if (count === null) return null;
  return <p className="title-access-count">総アクセス数: {count.toLocaleString()}</p>;
}
