// 生成済みのトークパック（../トークパック）を検証して、ゲームのデータ src/engine/data/talkPacks.ts に書き出す。2026-11-11
// 使い方：npx tsx scripts/talk/build-talk-data.ts
// 検証でエラーのあるパックは取り込まない（その相手・人物は従来の汎用文で話す）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePack, upgradeNpcPack, upgradePlayerPack, validateNpcPack, validatePlayerPack } from './validate';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../トークパック');
const OUT = path.resolve(HERE, '../../src/engine/data/talkPacks.ts');
const NPC_KEYS = ['ask', 'answer', 'detail', 'answer_alt', 'detail_alt', 'react', 'react_fact', 'react_shared', 'curt_one', 'curt_short', 'disclose', 'match', 'aizuchi_back', 'profile_change', 'warm', 'invite_accept', 'invite_busy', 'bridge', 'late_sorry'];
const PLAYER_KEYS = ['hobbies', 'food', 'place', 'hometown', 'sibling', 'pet', 'drink', 'music', 'show', 'sport', 'dish', 'club', 'dateplace', 'intro', 'answer', 'self_talk', 'dodge', 'ask', 'dig', 'aizuchi', 'ask_back', 'bridge'];
// 2026-11-23：第1版（言い回し1つ・8話題）と第2版（複数・16話題）のどちらも、第2版の形にそろえて書き出す

/** 第2版（../トークパック/v2）があればそれを、なければ第1版を使う（2026-11-23） */
function load(kind: 'npc' | 'player'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const dir of [path.join(SRC, 'v2', kind), path.join(SRC, kind)]) {
    if (!fs.existsSync(dir)) continue;
    loadDir(kind, dir, out);
  }
  return out;
}

function loadDir(kind: 'npc' | 'player', dir: string, out: Record<string, unknown>): void {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    if (out[f.replace('.json', '')]) continue; // 第2版を取り込み済み
    const data = normalizePack(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const v = kind === 'npc' ? validateNpcPack(data) : validatePlayerPack(data);
    const id = f.replace('.json', '');
    if (v.errors.length) { console.log(`取り込まない ${path.basename(path.dirname(dir))}/${kind}/${id}: ${v.errors.slice(0, 3).join(' / ')}`); continue; }
    const up = kind === 'npc' ? upgradeNpcPack(data) : upgradePlayerPack(data);
    out[id] = Object.fromEntries((kind === 'npc' ? NPC_KEYS : PLAYER_KEYS).filter((k) => up[k] !== undefined).map((k) => [k, up[k]]));
  }
}

const npc = load('npc');
const player = load('player');
fs.writeFileSync(OUT, `// 自動生成（scripts/talk/build-talk-data.ts）。手で直さず、../トークパック のJSONを直して作り直す。
import type { NpcTalk, PlayerTalk } from './talkSlots';

export const NPC_TALK: Record<string, NpcTalk> = ${JSON.stringify(npc)} as Record<string, NpcTalk>;

export const PLAYER_TALK: Record<string, PlayerTalk> = ${JSON.stringify(player)} as Record<string, PlayerTalk>;
`, 'utf8');
console.log(`相手 ${Object.keys(npc).length}種・プレイヤー ${Object.keys(player).length}人を書き出した`);

// プロフィールの自己紹介文（2026-11-23。../トークパック/v2/profile/bios.json）
const BIO_SRC = path.join(SRC, 'v2', 'profile', 'bios.json');
const BIO_OUT = path.resolve(HERE, '../../src/engine/data/profileBios.ts');
const bios = fs.existsSync(BIO_SRC) ? (JSON.parse(fs.readFileSync(BIO_SRC, 'utf8')) as { bios: Record<string, unknown> }).bios : {};
fs.writeFileSync(BIO_OUT, `// 自動生成（scripts/talk/build-talk-data.ts）。../トークパック/v2/profile/bios.json から作る。手で直さない。
// 性別 → 充実度（rich・normal）→ 雰囲気（serious・light・common）→ 自己紹介文の配列（差し込み {job} {hobby} {hobby2} {food}）
export const PROFILE_BIOS: Record<string, Record<string, Record<string, string[]>>> = ${JSON.stringify(bios)};
`, 'utf8');
console.log(`自己紹介文 ${Object.values(bios as Record<string, Record<string, Record<string, string[]>>>).flatMap((x) => Object.values(x)).flatMap((x) => Object.values(x)).flat().length}通りを書き出した`);
