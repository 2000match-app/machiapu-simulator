// トークパック第2版の点検（2026-11-23）：Gemini が作った文を、ChatGPT に「実際のマチアプのトークとして自然か」で点検させ、
// 不自然な言い回しを落とす（同じ項目に言い回しが複数あるので、落としても1つ以上は残す）。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/review-talk-v2.ts --kind npc [--ids P-F01] [--force]
// キーは GEMINI_API_KEY_FILE の中の sk- で始まる行（または OPENAI_API_KEY）。表示・保存しない。
// 結果：パックを上書きし（reviewed に記録）、落とした文と理由を ../トークパック/v2/点検記録.json に残す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, loadOpenAiKey, RequestBudget, type Attempt } from '../gemini/client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'トークパック', 'v2');
// 点検する側：--reviewer openai（ChatGPT。既定）か gemini（ChatGPTのキーが使えないとき。生成とは別の呼び出しで、点検役として見る）
const REVIEWER = (process.argv.includes('--reviewer') ? process.argv[process.argv.indexOf('--reviewer') + 1] : 'openai') as 'openai' | 'gemini';
const MODEL = REVIEWER === 'gemini' ? (process.env.GEMINI_REVIEW_TALK_MODEL || 'gemini-4-argon') : (process.env.OPENAI_TALK_MODEL || process.env.OPENAI_SPEC_MODEL || 'gpt-6.1-sol');
const geminiBudget = new RequestBudget(200);
const REVIEW_SCHEMA = { type: 'object', properties: { bad: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'], additionalProperties: false } } }, required: ['bad'], additionalProperties: false };

async function gemini(input: string): Promise<string> {
  const attempts: Attempt[] = [];
  const res = await callInteractions({ model: MODEL, input: [{ type: 'text', text: input }], response_format: { type: 'text', mime_type: 'application/json', schema: REVIEW_SCHEMA } }, { budget: geminiBudget, attempts, timeoutMs: 600_000 });
  if (!res) throw new Error(`Gemini 失敗 ${attempts.map((a) => a.outcome + (a.httpStatus ?? '')).join(',')}`);
  return extractText(res.json);
}

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const kind = arg('kind', 'npc') as 'npc' | 'player';
const force = process.argv.includes('--force');
const only = arg('ids').split(',').filter(Boolean);

/** 差し込みに入れて見せる値（2通り。どちらでも自然かを見る） */
const SAMPLE: Record<string, [string, string]> = {
  hobby: ['カフェ巡り', '筋トレ'], hobby2: ['映画', '料理'], food: ['焼肉', 'パスタ'], area: ['世田谷区', '川口市'], place: ['京都', '台湾'], job: ['看護師', 'エンジニア'], months: ['3', '6'],
  hometown: ['北海道', '埼玉県'], sibling: ['兄が1人いる長男', '姉が1人いる次女'], pet: ['猫', '犬'], drink: ['ハイボール', 'ワイン'], music: ['K-POP', '邦ロック'], show: ['韓国ドラマ', '洋画'], sport: ['ヨガ', 'ゴルフ'],
  dish: ['カレー', '肉じゃが'], club: ['吹奏楽部', 'サッカー部'], dateplace: ['水族館', '鎌倉'], name: ['ゆうき', 'さき'],
};
function render(s: string, k: 0 | 1): string {
  return s.replace(/\{(their_)?([a-z0-9]+)\}/g, (m, _t: string | undefined, key: string) => SAMPLE[key]?.[k] ?? m);
}

/** パックの中の文を、場所（パス）つきで並べる */
function collect(v: unknown, at: string[], out: { id: string; path: string[]; text: string }[]): void {
  if (typeof v === 'string') { out.push({ id: `L${out.length}`, path: at, text: v }); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => collect(x, [...at, String(i)], out)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, [...at, k], out);
}
const SKIP = new Set(['id', 'kind', 'model', 'createdAt', 'schema_version', 'reviewed', 'hobbies', 'food', 'place', 'hometown', 'sibling', 'pet', 'drink', 'music', 'show', 'sport', 'dish', 'club', 'dateplace']);

const KEY_MEANING = `パスの見方（話題 t、質問の番号 0・1）：
- ask.t.i.* … 相手に聞く質問 ／ answer.t.i.* … その質問に答える文 ／ detail.t.i.* … 深掘りの質問への答え ／ answer_alt・detail_alt … 一人っ子（family）・ペットを飼っていない・お酒を飲まない・運動していない人の答え（family の answer・detail は兄弟がいる人）
- media.0 は音楽の質問、media.1 は映画・ドラマの質問。{music} は音楽のジャンル、{show} は映画・ドラマのジャンル
- react.t.* … 相手の答えへの受け止め（中身に触れない）／ react_fact.t.* … 相手の答えの中身に触れる受け止め ／ curt_short … そっけない短い答え
- bridge … 話題を変える前置き（後ろに質問が続く）／ late_sorry … 返信が遅れたお詫び ／ invite_accept … 会う誘いへの承諾 ／ invite_busy … 予定が合わないお断り
- self_talk … つい長く語った答え ／ dodge … はぐらかす答え ／ dig … 深掘りの質問 ／ intro … 最初のメッセージの自己紹介 ／ ask_back … 聞き返し`;

async function openai(input: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 600_000);
  try {
    const schema = { type: 'object', properties: { bad: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'], additionalProperties: false } } }, required: ['bad'], additionalProperties: false };
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loadOpenAiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input, text: { format: { type: 'json_schema', name: 'talk_review', schema, strict: true } } }),
      signal: ctrl.signal,
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify((j as { error?: unknown }).error ?? j).slice(0, 300)}`);
    const out = (j.output as { type: string; content?: { type: string; text?: string }[] }[] | undefined) ?? [];
    return out.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('\n');
  } finally {
    clearTimeout(timer);
  }
}

function prompt(who: string, items: { id: string; path: string[]; text: string }[]): string {
  return `あなたは日本のマッチングアプリ（Pairs・タップル・with など）のトークに詳しい編集者です。恋愛シミュレーションゲームのセリフを点検してください。
${who}
文中の差し込み（{…}）は、例の値を入れて2通りで見せています（A・B）。どちらかで不自然になる文も指摘してください。

# 指摘する文（id と短い理由）
- 実際のアプリのトークで、マッチして間もない相手にこう打たない（硬すぎる・小説調・説明的・馴れ馴れしすぎる・営業っぽい）
- 日本語として不自然（助詞のずれ、差し込みの値で文が崩れる、意味が通らない）
- パスの役割に合っていない（質問の型と答えがずれている、受け止めなのに質問している、react なのに相手の答えの中身を決めつけている など）
- 同じ人のセリフとして口調がぶれている、重い・不快な内容
指摘しないもの：好みの問題、少しくだけた言い回し、絵文字の有無。

${KEY_MEANING}

# 文（id｜パス｜A｜B）
${items.map((x) => `${x.id}｜${x.path.join('.')}｜${render(x.text, 0)}｜${render(x.text, 1)}`).join('\n')}

指摘する文だけを bad に入れてください（なければ空の配列）。`;
}

/** パスの最後の配列から、その要素を消す（残りが1つ以下なら消さない） */
function dropAt(pack: Record<string, unknown>, p: string[]): boolean {
  let cur: unknown = pack;
  for (const k of p.slice(0, -1)) cur = (cur as Record<string, unknown>)[k];
  if (!Array.isArray(cur)) return false;
  const i = Number(p[p.length - 1]);
  if (cur.filter((x) => x !== null).length <= 1 || !(i >= 0 && i < cur.length) || cur[i] === null) return false;
  (cur as unknown[])[i] = null;
  return true;
}
function compact(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== null).map(compact);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)]));
  return v;
}

async function reviewOne(file: string, log: Record<string, unknown>[]): Promise<void> {
  const pack = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const id = String(pack.id ?? path.basename(file, '.json'));
  if (pack.reviewed && !force) { console.log(`skip ${id}（点検済み）`); return; }
  const items: { id: string; path: string[]; text: string }[] = [];
  for (const [k, v] of Object.entries(pack)) if (!SKIP.has(k)) collect(v, [k], items);
  const who = kind === 'npc' ? `この文は、人格テンプレ ${id} の相手（NPC）がプレイヤーに送るセリフです。` : `この文は、プレイヤーの人物 ${id} が相手に送るメッセージです。`;
  // 1回の量を抑える（約200文ずつ）
  const bad = new Map<string, string>();
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    try {
      const text = await (REVIEWER === 'gemini' ? gemini : openai)(prompt(who, chunk));
      const got = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { bad: { id: string; reason: string }[] };
      for (const b of got.bad ?? []) bad.set(b.id, b.reason);
    } catch (e) {
      console.log(`NG ${id}: ${(e as Error).message}`);
      log.push({ id, ok: false, message: (e as Error).message });
      return;
    }
  }
  const dropped: { path: string; text: string; reason: string }[] = [];
  const kept: { path: string; text: string; reason: string }[] = [];
  for (const it of items) {
    const reason = bad.get(it.id);
    if (!reason) continue;
    (dropAt(pack, it.path) ? dropped : kept).push({ path: it.path.join('.'), text: it.text, reason });
  }
  const next = compact(pack) as Record<string, unknown>;
  next.reviewed = { by: MODEL, at: new Date().toISOString(), lines: items.length, dropped: dropped.length, keptFlagged: kept.length };
  fs.writeFileSync(file, JSON.stringify(next, null, 1), 'utf8');
  log.push({ id, ok: true, lines: items.length, dropped, keptFlagged: kept });
  console.log(`OK ${id}: ${items.length}文のうち ${dropped.length}文を落とした${kept.length ? `（ほかに${kept.length}文は1つしかないので残した）` : ''}`);
}

async function main(): Promise<void> {
  const dir = path.join(DIR, kind);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).filter((f) => !only.length || only.includes(f.replace('.json', '')));
  const log: Record<string, unknown>[] = [];
  const conc = Number(arg('concurrency', '3'));
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < files.length) await reviewOne(path.join(dir, files[next++]), log);
  }));
  const rec = path.join(DIR, '点検記録.json');
  const prev = fs.existsSync(rec) ? JSON.parse(fs.readFileSync(rec, 'utf8')) : [];
  fs.writeFileSync(rec, JSON.stringify([...prev, { at: new Date().toISOString(), kind, model: MODEL, results: log }], null, 1), 'utf8');
}

void main();
