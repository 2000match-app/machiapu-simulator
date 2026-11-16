// 動作確認用：全20人を自動プレイして結果を1行ずつ表示する
import { CHARACTERS } from '../../src/engine/data/characters';
import { playBot } from '../../src/engine/bot';

const seed = process.argv[2] ?? 'smoke-1';
const t0 = Date.now();
for (const ch of CHARACTERS) {
  const s = playBot(ch.id, `${seed}-${ch.id}`, { strategy: 'wide', publishPhoto: false });
  const r = s.result;
  console.log(
    `${ch.id} ${ch.name.padEnd(3)} ${s.status.padEnd(8)} day=${String(s.day).padStart(4)} life=${String(s.life).padStart(3)} ` +
    `likes=${s.stats.likesSent} match=${s.stats.matches} conv=${s.stats.conversations} dates=${s.stats.dates} rel=${s.stats.relationships} ` +
    `recv=${s.stats.receivedTotal} | ${r?.headline ?? ''}`,
  );
}
console.log(`elapsed ${Date.now() - t0}ms`);
