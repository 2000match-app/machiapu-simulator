// 1周分のライフ台帳を表示する（調整用）。使い方: npx tsx scripts/sim/ledger.ts M01 seed [strategy]
import { playBot, type Strategy } from '../../src/engine/bot';

const [id = 'M01', seed = 'smoke-1-M01', strategy = 'wide'] = process.argv.slice(2);
const s = playBot(id, seed, { strategy: strategy as Strategy });
console.log(`${id} ${s.status} day=${s.day} life=${s.life}`);
for (const e of s.ledger) {
  console.log(`${String(e.day).padStart(4)} ${String(e.delta).padStart(4)} ${e.category.padEnd(8)} ${e.eventId ?? ''} ${e.note}${e.detail ? ` [${e.detail}]` : ''}`);
}
const by: Record<string, number> = {};
for (const e of s.ledger) if (e.delta < 0) by[e.eventId ?? e.category] = (by[e.eventId ?? e.category] ?? 0) - e.delta;
console.log(by);
console.log('money', s.money.reduce((a, m) => a + m.yen, 0), s.stats.monthlySpend);
