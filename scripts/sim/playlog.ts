// 代表的なプレイログ（プレイヤーが画面で見た文面＋数値の変化＋結果画面）を Markdown で書き出す。
// Geminiによるプレイログレビューの入力にも使う。
// 使い方: npm run sim:playlog -- M05:pl-1:wide F02:pl-2:focus ...
import fs from 'node:fs';
import path from 'node:path';
import { applyAction, newGame } from '../../src/engine/actions';
import { botWeek, pickPending, type Strategy } from '../../src/engine/bot';
import { getCharacter } from '../../src/engine/data/characters';
import { eventVisibleName } from '../../src/engine/data/events';
import type { GameState } from '../../src/engine/types';

const OUT = path.resolve(import.meta.dirname, '..', '..', 'production', 'playlogs');
fs.mkdirSync(OUT, { recursive: true });
const specs = process.argv.slice(2).length ? process.argv.slice(2) : ['M05:pl-1:wide', 'M01:pl-2:wide', 'F02:pl-3:focus', 'F08:pl-4:narrow'];

function writeLog(id: string, seed: string, strategy: Strategy): string {
  const s: GameState = newGame(id, seed);
  const ch = getCharacter(id);
  const lines: string[] = [`# プレイログ：${id} ${ch.name}（${ch.gender === 'M' ? '男性' : '女性'}・${ch.age}歳・${ch.job}）`, '', `シード ${seed}／方針 ${strategy}（自動プレイ）`, ''];
  let ledgerSeen = 0;
  let feedSeen = 0;
  const msgSeen: Record<string, number> = {};
  for (let w = 0; w < 120 && s.status === 'playing'; w++) {
    let guard = 0;
    while (s.pending.length > 0 && guard++ < 40) {
      const ev = s.pending[0];
      const choice = pickPending(s, ev, { strategy });
      lines.push(`**【場面】${s.day}日目：${ev.title}**`);
      for (const l of ev.lines) lines.push(`> ${l.who === 'them' ? `${s.npcs[ev.npcId ?? '']?.name ?? '相手'}：` : l.who === 'me' ? '自分：' : ''}${l.text}`);
      lines.push(`> 選択肢：${ev.choices.map((c) => c.label).join('／')} → **${ev.choices.find((c) => c.id === choice)?.label}**`, '');
      applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: choice });
    }
    if (s.status !== 'playing') break;
    const d0 = s.day;
    botWeek(s, { strategy });
    // その週に増えたトーク・できごと・ライフの変化
    for (const c of Object.values(s.contacts)) {
      const from = msgSeen[c.npcId] ?? 0;
      const newMsgs = c.messages.slice(from);
      msgSeen[c.npcId] = c.messages.length;
      if (newMsgs.length === 0) continue;
      const npc = s.npcs[c.npcId];
      lines.push(`- トーク（${npc.name}・${npc.age}）`);
      for (const m of newMsgs) lines.push(`  - ${m.day}日目 ${m.from === 'me' ? '自分' : m.from === 'them' ? npc.name : '（システム）'}：${m.text}${m.from === 'me' && m.read ? '（既読）' : ''}`);
    }
    for (const f of s.feed.slice(feedSeen)) lines.push(`- できごと ${f.day}日目：${f.text}`);
    feedSeen = s.feed.length;
    for (const e of s.ledger.slice(ledgerSeen)) lines.push(`- ライフ ${e.delta > 0 ? '+' : ''}${e.delta}（${e.eventId ? `${eventVisibleName(e.eventId)}／` : ''}${e.note}${e.detail ? `／${e.detail}` : ''}）`);
    ledgerSeen = s.ledger.length;
    lines.push(`- 週のまとめ：${d0}→${s.day}日目、ライフ${s.life}、今月の支出${s.monthSpend.toLocaleString()}円`, '');
  }
  const r = s.result;
  lines.push('## 結果画面', '', `- ${r?.headline ?? s.status}`);
  if (r?.primary) {
    lines.push(`- 失敗タイプ：${r.primary.title}`);
    for (const f of r.primary.facts) lines.push(`  - 事実：${f}`);
    for (const x of r.secondary) lines.push(`  - 副要因：${x.title}（${x.facts.join('／')}）`);
    for (const t of r.playerChoices) lines.push(`  - 自分で変更できた選択：${t}`);
    for (const t of r.externalFactors) lines.push(`  - 相手や運による要因：${t}`);
    for (const t of r.suggestions) lines.push(`  - 次の一手：${t}`);
  }
  lines.push('', '## 結果解説（プレイ中は表示されない内部事情）', '');
  for (const c of Object.values(s.contacts)) {
    if (!(c.meetings > 0 || c.relationship || c.twoWay)) continue;
    lines.push(`- ${s.npcs[c.npcId].name}：${c.revealed ?? s.npcs[c.npcId].purpose}／結末：${c.endCause ?? c.stage}`);
  }
  const file = path.join(OUT, `${id}-${seed}.md`);
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

for (const sp of specs) {
  const [id, seed, strategy] = sp.split(':');
  console.log(writeLog(id, seed ?? 'pl', (strategy ?? 'wide') as Strategy));
}
