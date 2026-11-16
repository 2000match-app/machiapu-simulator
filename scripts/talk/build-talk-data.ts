// 生成済みのトークパック（../トークパック）を検証して、ゲームのデータ src/engine/data/talkPacks.ts に書き出す。2026-11-11
// 使い方：npx tsx scripts/talk/build-talk-data.ts
// 検証でエラーのあるパックは取り込まない（その相手・人物は従来の汎用文で話す）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePack, validateNpcPack, validatePlayerPack } from './validate';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../トークパック');
const OUT = path.resolve(HERE, '../../src/engine/data/talkPacks.ts');
const NPC_KEYS = ['ask', 'answer', 'detail', 'react', 'react_shared', 'curt_one', 'curt_short', 'disclose', 'match', 'aizuchi_back', 'profile_change', 'warm', 'invite_accept', 'invite_busy'];
const PLAYER_KEYS = ['hobbies', 'food', 'place', 'hometown', 'intro', 'answer', 'self_talk', 'dodge', 'ask', 'dig', 'aizuchi', 'ask_back'];

function load(kind: 'npc' | 'player'): Record<string, unknown> {
  const dir = path.join(SRC, kind);
  const out: Record<string, unknown> = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const data = normalizePack(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const v = kind === 'npc' ? validateNpcPack(data) : validatePlayerPack(data);
    const id = f.replace('.json', '');
    if (v.errors.length) { console.log(`取り込まない ${kind}/${id}: ${v.errors.slice(0, 3).join(' / ')}`); continue; }
    out[id] = Object.fromEntries((kind === 'npc' ? NPC_KEYS : PLAYER_KEYS).map((k) => [k, data[k]]));
  }
  return out;
}

const npc = load('npc');
const player = load('player');
fs.writeFileSync(OUT, `// 自動生成（scripts/talk/build-talk-data.ts）。手で直さず、../トークパック のJSONを直して作り直す。
import type { NpcTalk, PlayerTalk } from './talkSlots';

export const NPC_TALK: Record<string, NpcTalk> = ${JSON.stringify(npc)} as Record<string, NpcTalk>;

export const PLAYER_TALK: Record<string, PlayerTalk> = ${JSON.stringify(player)} as Record<string, PlayerTalk>;
`, 'utf8');
console.log(`相手 ${Object.keys(npc).length}種・プレイヤー ${Object.keys(player).length}人を書き出した`);
