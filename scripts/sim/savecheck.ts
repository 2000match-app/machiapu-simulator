// 保存→再開で状態が変わらないかを週ごとに比較する（デバッグ用）
import { newGame } from '../../src/engine/actions';
import { botWeek } from '../../src/engine/bot';
import { deserialize, serialize } from '../../src/engine/save';

const id = process.argv[2] ?? 'F04';
let a = newGame(id, 'save-1');
let b = newGame(id, 'save-1');
for (let w = 0; w < 40; w++) {
  botWeek(a, { strategy: 'wide' });
  botWeek(b, { strategy: 'wide' });
  b = deserialize(serialize(b));
  const sa = serialize(a);
  const sb = serialize(b);
  if (sa !== sb) {
    let i = 0;
    while (sa[i] === sb[i]) i++;
    console.log(`week ${w} diverged at char ${i}`);
    console.log('A:', sa.slice(Math.max(0, i - 200), i + 200));
    console.log('B:', sb.slice(Math.max(0, i - 200), i + 200));
    break;
  }
  a = deserialize(sa); // 同じ表現に揃える
}
console.log('done');
