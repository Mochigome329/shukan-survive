/**
 * 「一度でも連載を始めたことがあるか」の記録（v7.5）。
 *
 * 初回だけはチュートリアルを強制し、2回目以降は
 * 「チュートリアルを表示しますか？」と聞いてから始めるために使う。
 * localStorageが使えない環境では毎回「初回」扱いになるだけで、遊べなくはならない。
 */
const KEY = 'uchikiri.hasPlayed';

export function hasPlayedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markPlayed(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // 記録できなくても、次回もチュートリアルが出るだけ
  }
}
