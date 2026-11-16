// 通常プレイのバランス集計（調整用）。キャラ×方針×シードで自動プレイし、クリア率・失敗要因・日数・支出を比べる。
// これはゲームの調整用の数字であり、現実の男女・職業ごとの成功率ではない。
// 使い方: npm run sim:balance -- --runs 60 [--chars M01,M05] [--out docs/検証結果_バランス.md]
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS } from '../../src/engine/data/characters';
import { playBot, type Strategy } from '../../src/engine/bot';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const RUNS = Number(arg('runs', '40'));
const chars = arg('chars', CHARACTERS.map((c) => c.id).join(',')).split(',');
const strategies: Strategy[] = arg('strategies', 'narrow,wide,focus,rest').split(',') as Strategy[];
const out = arg('out', '');
const extra = arg('publish', '0') === '1';
/** --naive 1：誘いに乗ってしまう素直な人として遊ぶ（業者・バー・メシ目の誘いを断らない） */
const naive = arg('naive', '0') === '1';

interface Row { id: string; strategy: string; runs: number; clear: number; medianDay: number; meanSpend: number; meanLifeEnd: number; failTypes: Record<string, number>; events: Record<string, number>; meanDates: number; meanMatches: number }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

const rows: Row[] = [];
const t0 = Date.now();
for (const id of chars) {
  for (const strategy of strategies) {
    const days: number[] = [];
    let clear = 0;
    let spend = 0;
    let lifeEnd = 0;
    let dates = 0;
    let matches = 0;
    const failTypes: Record<string, number> = {};
    const events: Record<string, number> = {};
    for (let r = 0; r < RUNS; r++) {
      const s = playBot(id, `bal-${id}-${strategy}-${r}`, { strategy, publishPhoto: extra, naive });
      if (s.status === 'cleared') clear++;
      else if (s.result?.primary) failTypes[s.result.primary.type] = (failTypes[s.result.primary.type] ?? 0) + 1;
      else failTypes.unfinished = (failTypes.unfinished ?? 0) + 1;
      days.push(s.day);
      spend += s.money.reduce((a, m) => a + m.yen, 0);
      lifeEnd += s.life;
      dates += s.stats.dates;
      matches += s.stats.matches;
      for (const e of new Set(s.eventLog.map((x) => x.eventId))) events[e] = (events[e] ?? 0) + 1;
    }
    rows.push({ id, strategy, runs: RUNS, clear, medianDay: median(days), meanSpend: spend / RUNS, meanLifeEnd: lifeEnd / RUNS, failTypes, events, meanDates: dates / RUNS, meanMatches: matches / RUNS });
    const row = rows[rows.length - 1];
    console.log(`${id} ${strategy.padEnd(6)} clear ${String(clear).padStart(3)}/${RUNS} (${((clear / RUNS) * 100).toFixed(0)}%) day中央値=${row.medianDay} 支出平均=${Math.round(row.meanSpend / 1000)}千円 対面=${row.meanDates.toFixed(1)} マッチ=${row.meanMatches.toFixed(1)} 失敗=${JSON.stringify(failTypes)}`);
  }
}
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (out) {
  const ids = [...new Set(rows.map((r) => r.id))];
  const lines: string[] = [];
  lines.push('# 検証結果：通常プレイのバランス（自動プレイ集計）', '');
  lines.push(`生成日時：${new Date().toISOString()}／各条件 ${RUNS} 周（シード bal-ID-方針-番号）${extra ? '／写真なしの人物は14日経過後に公開' : ''}`, '');
  lines.push('**ゲーム調整用の数字です。現実の男女・職業ごとの成功率として扱わないでください。** 自動プレイは画面の人間とは違う判断をします（危険な誘いは断る、返事は必ず返す等）。', '');
  lines.push('方針：narrow＝初期の希望条件のまま／wide＝条件を広げる（年齢±6・外見と年収の条件なし・90分）／focus＝やり取りを2人までに絞る／rest＝送信を控えめにしライフ60未満で休む。', '');
  lines.push('| 人物 | ' + strategies.map((s) => `${s} クリア率`).join(' | ') + ' | wide 日数中央値 | wide 平均支出 | wide 主な失敗 |');
  lines.push('|---|' + strategies.map(() => '---:').join('|') + '|---:|---:|---|');
  for (const id of ids) {
    const rs = strategies.map((s) => rows.find((r) => r.id === id && r.strategy === s)!);
    const w = rows.find((r) => r.id === id && r.strategy === 'wide') ?? rs[0];
    const topFail = Object.entries(w.failTypes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${v}`).join('、');
    lines.push(`| ${id} ${CHARACTERS.find((c) => c.id === id)!.name} | ${rs.map((r) => `${Math.round((r.clear / r.runs) * 100)}%`).join(' | ')} | ${w.medianDay}日 | ${Math.round(w.meanSpend / 1000).toLocaleString()}千円 | ${topFail || '—'} |`);
  }
  lines.push('', '## イベントの発生（wide方針、周回のうち1回以上起きた割合）', '');
  const evIds = Array.from({ length: 24 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`);
  lines.push('| 人物 | ' + evIds.join(' | ') + ' |');
  lines.push('|---|' + evIds.map(() => '---:').join('|') + '|');
  for (const id of ids) {
    const w = rows.find((r) => r.id === id && r.strategy === 'wide') ?? rows.find((r) => r.id === id)!;
    lines.push(`| ${id} | ${evIds.map((e) => `${Math.round(((w.events[e] ?? 0) / w.runs) * 100)}`).join(' | ')} |`);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.resolve(out).replace(/\.md$/, '.json'), JSON.stringify(rows, null, 2), 'utf8');
  console.log(`保存: ${out}`);
}
