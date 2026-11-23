// トークパック第2版の書き直し（2026-11-23）：点検（review-talk-v2.ts）で指摘されたのに、言い回しが1つしかなくて落とせなかった文を、
// ChatGPT に指摘の理由を見せて書き直させる。差し込みが増えたり、機械検証のエラーが増えたりする書き直しは使わない。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/fix-flagged-v2.ts --kind npc|player
// 直す文は、点検記録.json のうち、その kind の最後の ChatGPT の点検の keptFlagged。結果も点検記録.json に足す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_MEANING, OPENAI_MODEL, openaiJson, render } from './reviewShared';
import { validateNpcPack, validatePlayerPack } from './validate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'トークパック', 'v2');
const REC = path.join(DIR, '点検記録.json');
const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const kind = arg('kind', 'npc') as 'npc' | 'player';

interface Flag { path: string; text: string; reason: string }
interface Result { id: string; ok: boolean; keptFlagged?: Flag[] }
interface Entry { at: string; kind: string; model: string; action?: string; results: Result[] }

const slots = (s: string) => [...s.matchAll(/\{([a-z_0-9]+)\}/g)].map((m) => m[1]);
const FIX_SCHEMA = { type: 'object', properties: { fixes: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, text: { type: 'string' } }, required: ['n', 'text'], additionalProperties: false } } }, required: ['fixes'], additionalProperties: false };

function getAt(pack: Record<string, unknown>, p: string[]): unknown {
  let cur: unknown = pack;
  for (const k of p) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return cur;
}
/** 元の文を新しい文に置き換える（点検のあと配列を詰めたので、親の中から同じ文を探す）。置き換えられたら元に戻す関数を返す */
function replace(pack: Record<string, unknown>, p: string[], from: string, to: string): (() => void) | undefined {
  const parent = getAt(pack, p.slice(0, -1));
  if (Array.isArray(parent)) {
    const i = parent.indexOf(from);
    if (i < 0) return undefined;
    parent[i] = to;
    return () => { parent[i] = from; };
  }
  const o = parent as Record<string, unknown> | undefined;
  const k = p[p.length - 1];
  if (!o || o[k] !== from) return undefined;
  o[k] = to;
  return () => { o[k] = from; };
}
/** 書き直しの参考に、同じ質問の質問文・答えを1つずつ見せる */
function context(pack: Record<string, unknown>, p: string[]): string {
  const [key, t, i] = p;
  if (!/^\d$/.test(i ?? '')) return '';
  const first = (k: string) => { const v = getAt(pack, [k, t, i]); return Array.isArray(v) ? String(v[0] ?? '') : ''; };
  if (key === 'ask') return first('answer') ? `（この質問への答えの例：${first('answer')}）` : '';
  if (['answer', 'detail', 'answer_alt', 'detail_alt'].includes(key)) return first('ask') ? `（この答えへの質問の例：${first('ask')}）` : '';
  return '';
}

function prompt(who: string, items: { n: number; f: Flag; p: string[]; ctx: string }[]): string {
  return `あなたは日本のマッチングアプリ（Pairs・タップル・with など）のトークに詳しい編集者です。恋愛シミュレーションゲームのセリフのうち、点検で指摘された文を書き直してください。
${who}

# 書き直し方
- 指摘の理由を解消し、パスの役割に合った、マッチして間もない相手に送る自然なトークにする（1〜2文。長くしない）。
- 差し込み（{…}）は元の文にあるものだけを使う。例の値A・Bのどちらが入っても自然な文にする。差し込みは名詞なので「が・の・は・も・とか・や」で受け、「{hobby}をする」のように動詞を直接付けない。
- 口調（です・ます／くだけた言い方）・絵文字の量は元の文に合わせる。かぎかっこ「」・改行は使わない。
- 質問の型（例：何をしているか）と答えがかみ合うようにする。

${KEY_MEANING}

# 書き直す文（番号｜パス｜元の文｜例A｜例B｜指摘）
${items.map((x) => `${x.n}｜${x.f.path}｜${x.f.text}｜${render(x.f.text, 0, x.p)}｜${render(x.f.text, 1, x.p)}｜${x.f.reason}${x.ctx}`).join('\n')}

全部の番号について、書き直した文を fixes に {n, text} で入れてください（差し込みは {…} のまま書く）。`;
}

async function fixOne(file: string, flags: Flag[]): Promise<Record<string, unknown>> {
  const pack = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const id = String(pack.id ?? path.basename(file, '.json'));
  const validate = kind === 'npc' ? validateNpcPack : validatePlayerPack;
  const base = validate(structuredClone(pack)).errors.length;
  const items = flags.map((f, n) => ({ n, f, p: f.path.split('.'), ctx: context(pack, f.path.split('.')) }));
  const who = kind === 'npc' ? `この文は、人格テンプレ ${id} の相手（NPC）がプレイヤーに送るセリフです。` : `この文は、プレイヤーの人物 ${id} が相手に送るメッセージです。`;
  let fixes: { n: number; text: string }[];
  try {
    const text = await openaiJson(prompt(who, items), 'talk_fix', FIX_SCHEMA);
    fixes = (JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { fixes: { n: number; text: string }[] }).fixes ?? [];
  } catch (e) {
    console.log(`NG ${id}: ${(e as Error).message}`);
    return { id, ok: false, message: (e as Error).message };
  }
  const fixed: { path: string; from: string; to: string }[] = [];
  const rejected: { path: string; from: string; to: string; why: string }[] = [];
  for (const x of items) {
    const to = fixes.find((y) => y.n === x.n)?.text?.trim();
    const from = x.f.text;
    const no = (why: string) => rejected.push({ path: x.f.path, from, to: to ?? '', why });
    if (!to || to === from) { no('書き直しがない'); continue; }
    const before = slots(from);
    const after = slots(to);
    if (after.some((s) => !before.includes(s))) { no('元にない差し込みを使った'); continue; }
    if (x.p[0] === 'react_fact' && before.some((s) => !after.includes(s))) { no('受け止めの差し込みを落とした'); continue; }
    if (/[「」『』\n]/.test(to) || to.length > 110) { no('かぎかっこ・改行・長すぎ'); continue; }
    const undo = replace(pack, x.p, from, to);
    if (!undo) { no('元の文が見つからない'); continue; }
    if (validate(structuredClone(pack)).errors.length > base) { undo(); no('機械検証のエラーが増えた'); continue; }
    fixed.push({ path: x.f.path, from, to });
  }
  pack.reviewed = { ...(pack.reviewed as Record<string, unknown> | undefined), fixedBy: OPENAI_MODEL, fixed: fixed.length };
  fs.writeFileSync(file, JSON.stringify(pack, null, 1), 'utf8');
  console.log(`OK ${id}: ${items.length}文のうち ${fixed.length}文を書き直した${rejected.length ? `（${rejected.length}文は使わなかった）` : ''}`);
  return { id, ok: true, fixed, rejected };
}

async function main(): Promise<void> {
  const rec = JSON.parse(fs.readFileSync(REC, 'utf8')) as Entry[];
  const last = [...rec].reverse().find((e) => e.kind === kind && e.model === OPENAI_MODEL && !e.action);
  if (!last) { console.log('ChatGPT の点検記録がない'); return; }
  const dir = path.join(DIR, kind);
  const byId = new Map<string, string>();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { id?: string };
    byId.set(String(p.id ?? f.replace('.json', '')), path.join(dir, f));
  }
  const jobs = last.results.filter((r) => r.ok && r.keptFlagged?.length && byId.has(r.id));
  const log: Record<string, unknown>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Number(arg('concurrency', '4')) }, async () => {
    while (next < jobs.length) { const r = jobs[next++]; log.push(await fixOne(byId.get(r.id)!, r.keptFlagged!)); }
  }));
  const now = JSON.parse(fs.readFileSync(REC, 'utf8')) as Entry[];
  fs.writeFileSync(REC, JSON.stringify([...now, { at: new Date().toISOString(), kind, model: OPENAI_MODEL, action: 'fix', results: log }], null, 1), 'utf8');
}

void main();
