import type { PlaySelection, RunState } from './types';

/** 初回の第1話だけ、既存デッキの2枚を確定枠へ。得点やカード構成は変更しない。 */
export function prepareFirstIssue(run: RunState): RunState {
  if (run.week !== 1) return run;
  const ids = ['battle', 'shugyou'].flatMap(def => {
    const card = run.cards.find(c => c.definitionId === def && c.zone === 'activeDeck');
    return card ? [card.instanceId] : [];
  });
  return { ...run, guaranteedNextHand: [...new Set([...ids, ...run.guaranteedNextHand])] };
}

export interface FirstIssueGuide {
  step: number;
  title: string;
  text: string;
  target: 'hand' | 'cast' | 'preview';
}

/** 選択の実態から導出するので、外したり引き直したりしても案内が先走らない。 */
export function firstIssueGuide(run: RunState, selection: PlaySelection, pendingTarget: string | null): FirstIssueGuide {
  const selected = run.cards.filter(c => selection.cards.includes(c.instanceId));
  const available = run.cards.filter(c => run.hand.includes(c.instanceId));
  if (!available.some(c => c.definitionId === 'battle') || !available.some(c => c.definitionId === 'shugyou')) {
    return { step: 1, title: '手元の展開で描いてみよう', text: 'カードは4枚まで。対象を選び、予想スコアをノルマに近づけよう。元の2枚がなくても、このまま掲載できます。', target: 'hand' };
  }
  if (pendingTarget) return { step: 3, title: '誰のエピソードにする？', text: '開いた対象選択画面で、キャラを1人選びます。「修行」は主人公に使ってみよう。', target: 'cast' };
  if (!selected.some(c => c.definitionId === 'battle')) return { step: 1, title: 'まずは「バトル」を1枚', text: '手札をタップすると「今週の話」に入ります。最初は王道の組み合わせを作ってみよう。', target: 'hand' };
  const hero = run.cards.find(c => c.definitionId === 'hero');
  const training = selected.find(c => c.definitionId === 'shugyou' && selection.targets[c.instanceId] === hero?.instanceId);
  if (!training) return { step: 2, title: '主人公に「修行」を', text: '「修行」を選ぶと対象選択が開きます。主人公を選ぼう。選び直すときは、原稿の「修行」を一度手札に戻せます。', target: 'hand' };
  return { step: 4, title: '「王道」の組み合わせができた', text: '役の効果と予想スコアを確認。ノルマに足りなければ4枚まで足してから、「この原稿を入稿する」で掲載しよう。', target: 'preview' };
}
