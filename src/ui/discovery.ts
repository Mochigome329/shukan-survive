/** 役図鑑の発見状況（localStorage永続化。3.4節・v5.2前倒し） */
const KEY = 'uchikiri.discoveredCombos';

export function getDiscovered(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function addDiscovered(ids: string[]): void {
  if (ids.length === 0) return;
  try {
    const set = getDiscovered();
    for (const id of ids) set.add(id);
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // localStorageが使えない環境では毎回未発見扱いになるだけ
  }
}
