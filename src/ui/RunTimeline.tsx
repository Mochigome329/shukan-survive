import type { GameData } from '../core/validate';

interface Props {
  data: GameData;
  /** 現在の話数 */
  week: number;
  /** 実装済みの最終話 */
  lastWeek: number;
}

/**
 * 連載タイムライン（v5.7）。
 * ラン全体のどこにいるか、次のボス週まであと何話かを一目で分かるようにする。
 * 1話=1目盛りで、ボス週は赤い目盛り、通過済みは塗り、現在地は太い縦線で示す。
 */
export function RunTimeline({ data, week, lastWeek }: Props) {
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);

  // 次のボス週（今週がボス週なら今週）
  let nextBoss: { week: number; boss: string } | null = null;
  for (let w = week; w <= lastWeek; w++) {
    const boss = data.quotas.get(w)?.boss;
    if (boss) {
      nextBoss = { week: w, boss };
      break;
    }
  }
  const untilBoss = nextBoss ? nextBoss.week - week : null;

  return (
    <div className="timeline">
      <div className="timeline-track">
        {weeks.map((w) => {
          const boss = data.quotas.get(w)?.boss;
          const state = w < week ? 'past' : w === week ? 'now' : 'future';
          return (
            <span
              key={w}
              className={`timeline-tick timeline-${state} ${boss ? 'timeline-boss' : ''}`}
              title={boss ? `第${w}話「${boss}」` : `第${w}話`}
            />
          );
        })}
      </div>
      <div className="timeline-legend">
        <span>
          第<strong>{week}</strong>話 / 全{lastWeek}話
        </span>
        {/*
         * v7.6: untilBoss===0（今週がボス週）のときは何も出さない。
         * その情報は .quota の boss-label と、下の「今週はボス週」バナーが既に担っている。
         * ここで同じことを3度言っていたのが重複の一因だった
         */}
        {nextBoss && untilBoss !== 0 && (
          <span className="timeline-boss-note">
            ボス週「{nextBoss.boss}」まで<strong>あと{untilBoss}話</strong>
          </span>
        )}
      </div>
    </div>
  );
}
