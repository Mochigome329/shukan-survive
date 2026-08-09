/**
 * シミュレーターCLI。`npm run sim` で実行する。
 * 使い方: npm run sim [-- --runs 2000 --weeks 4 --mode short]
 *
 * --mode を省くと通常連載（全25話）。--weeks も省くとその連載の最終話まで回す。
 */
import cardsJson from '../src/data/cards.json';
import quotasJson from '../src/data/quotas.json';
import quotasShortJson from '../src/data/quotas-short.json';
import tutorialJson from '../src/data/tutorial.json';
import { normalizeMode } from '../src/core/campaign';
import { buildGameData } from '../src/core/validate';
import { simulate, type SimReport } from '../src/sim/simulator';

function argValue(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function argString(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const data = buildGameData(cardsJson, quotasJson, tutorialJson, quotasShortJson);

// v7.31: 短期連載（全13話）も測れるようにする。SimOptions.mode は v7.30 からあったが
// CLI が渡していなかったので、npm run sim では通常連載しか回せなかった
const mode = normalizeMode(argString('mode'));
const campaign = data.campaigns[mode];
const runs = argValue('runs', 2000);
// 既定はその連載の最終話。最終回は結末を選ぶだけの回なので、その手前まで回す
const weeks = argValue('weeks', campaign.totalWeeks - 1);

function printReport(report: SimReport): void {
  console.log(`\n=== 戦略: ${report.strategy} (${report.runs}ラン, 第1〜${report.weeksPlayed}話) ===`);
  console.log(`第${report.weeksPlayed}話までの生存率: ${(report.survivalRate * 100).toFixed(1)}%`);
  console.log('話数 | ノルマ | 到達数 | 達成率 | 平均点 | P10 | P50 | P90');
  for (const w of report.weekStats) {
    console.log(
      `${String(w.week).padStart(4)} | ${String(w.quota).padStart(6)} | ${String(w.samples).padStart(6)} | ` +
        `${(w.clearRate * 100).toFixed(1).padStart(5)}% | ${w.scoreMean.toFixed(1).padStart(6)} | ` +
        `${String(w.scoreP10).padStart(4)} | ${String(w.scoreP50).padStart(4)} | ${String(w.scoreP90).padStart(4)}`,
    );
  }
  const dist = Object.entries(report.handCharCountDist)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}枚:${v}`)
    .join(' / ');
  console.log(`手札中のキャラ枚数分布: ${dist}`);
}

console.log(`連載: ${campaign.label}（全${campaign.totalWeeks}話） / 第1〜${weeks}話を ${runs}ラン`);
printReport(simulate(data, { runs, weeks, strategy: 'best', mode }));
printReport(simulate(data, { runs, weeks, strategy: 'casual', mode }));
printReport(simulate(data, { runs, weeks, strategy: 'random', mode }));
