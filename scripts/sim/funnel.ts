// 段階ごとの通過率（調整用）：交際の開始→90日到達、目的別の内訳、損失の大きい出来事
import { CHARACTERS } from '../../src/engine/data/characters';
import { playBot, type Strategy } from '../../src/engine/bot';

const RUNS = Number(process.argv[2] ?? 40);
const strategy = (process.argv[3] ?? 'focus') as Strategy;
const ids = (process.argv[4] ?? CHARACTERS.map((c) => c.id).join(',')).split(',');
for (const id of ids) {
  let relStarted = 0, genuine = 0, genuineCleared = 0, fake = 0, firstDates = 0, rejections = 0, convs = 0, matches = 0, endedRel: Record<string, number> = {};
  let lossTotals: Record<string, number> = {};
  let days = 0;
  for (let r = 0; r < RUNS; r++) {
    const s = playBot(id, `fun-${id}-${r}`, { strategy });
    days += s.day;
    matches += s.stats.matches; convs += s.stats.conversations; firstDates += s.stats.firstDates; rejections += s.stats.firstDateRejections;
    for (const c of Object.values(s.contacts)) {
      if (!c.relationship) continue;
      relStarted++;
      if (c.relationship.genuine) {
        genuine++;
        if (s.status === 'cleared' && s.partnerId === c.npcId) genuineCleared++;
        else if (c.endCause) endedRel[c.endCause] = (endedRel[c.endCause] ?? 0) + 1;
      } else fake++;
    }
    for (const e of s.ledger) if (e.delta < 0) lossTotals[e.eventId ?? e.category] = (lossTotals[e.eventId ?? e.category] ?? 0) - e.delta;
  }
  const top = Object.entries(lossTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / RUNS).toFixed(0)}`).join(' ');
  console.log(`${id} 日数平均=${(days / RUNS).toFixed(0)} マッチ=${(matches / RUNS).toFixed(1)} 会話=${(convs / RUNS).toFixed(1)} 初回対面=${(firstDates / RUNS).toFixed(1)} 対面後お断り=${firstDates ? ((rejections / firstDates) * 100).toFixed(0) : '-'}% 交際=${(relStarted / RUNS).toFixed(2)}（真${genuine} 偽${fake}） 真の交際→90日=${genuine ? ((genuineCleared / genuine) * 100).toFixed(0) : '-'}% 終わり方=${JSON.stringify(endedRel)}`);
  console.log(`    1周あたりの損失：${top}`);
}
