// トークパックの機械検証（生成直後と取り込み時に使う）。2026-11-11
import { TOPICS } from '../../src/engine/data/talkSlots';
import { HOBBIES } from '../../src/engine/data/npcPool';
import { isQuestion, splitSentences } from '../../src/engine/textSplit';

export interface Check { errors: string[]; warnings: string[] }

/**
 * 機械的な言い換え（生成AIが書きがちな「{hobby}をして」を、どの趣味でも崩れない形に直す）。
 * 例：「{hobby}や{hobby2}をして過ごす」→「{hobby}や{hobby2}で過ごす」、「{hobby}をしてる」→「{hobby}を楽しんでる」
 */
export function normalizeLine(s: string): string {
  const slot = String.raw`(\{(?:hobby2?|their_hobby)\}(?:や\{(?:hobby2?|their_hobby)\})?)`;
  return s
    .replace(new RegExp(`${slot}をして(過ご|リフレッシュ|のんびり|ゆっくり)`, 'g'), '$1で$2')
    .replace(new RegExp(`${slot}をしながら`, 'g'), '$1を楽しみながら')
    .replace(new RegExp(`${slot}をして`, 'g'), '$1を楽しんで')
    .replace(new RegExp(`${slot}をする`, 'g'), '$1を楽しむ')
    .replace(new RegExp(`${slot}をし(?=ま|た)`, 'g'), '$1を楽しみ');
}
export function normalizePack<T>(v: T): T {
  if (typeof v === 'string') return normalizeLine(v) as T;
  if (Array.isArray(v)) return v.map(normalizePack) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizePack(x)])) as T;
  return v;
}

const NPC_SLOTS = ['hobby', 'hobby2', 'food', 'area', 'place', 'job', 'months', 'name'];
const DEMONSTRATIVE = /(^|[、。！？\s])(それ|そこ|あれ|あそこ|その[^後]|あの)/;
const SLOT_VERB = /\{(hobby2?|food|their_hobby|their_food)\}(に行|をし|をや|をする|しに|に通|して)/;

function lines(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(lines);
  if (v && typeof v === 'object') return Object.values(v).flatMap(lines);
  return [];
}

function checkLine(where: string, s: string, allowed: string[], out: Check): void {
  if (!s || !s.trim()) { out.errors.push(`${where}：空`); return; }
  for (const m of s.matchAll(/\{([a-z_0-9]+)\}/g)) if (!allowed.includes(m[1])) out.errors.push(`${where}：使えない差し込み {${m[1]}}「${s}」`);
  if (/[{}]/.test(s.replace(/\{[a-z_0-9]+\}/g, ''))) out.errors.push(`${where}：差し込みの書き方が崩れている「${s}」`);
  if (SLOT_VERB.test(s)) out.errors.push(`${where}：差し込みに動詞が付いている「${s}」`);
  const n = splitSentences(s, 99).length;
  if (n > 3) out.errors.push(`${where}：${n}文（3文まで）「${s}」`);
  if (s.length > 110) out.warnings.push(`${where}：長い（${s.length}字）`);
  if (/[「」『』]/.test(s)) out.warnings.push(`${where}：かぎかっこ「${s}」`);
}

function eachTopic(o: Record<string, unknown>, key: string, n: number, out: Check, allowed: string[], depth = 1): void {
  const v = o[key] as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object') { out.errors.push(`${key} がない`); return; }
  for (const t of TOPICS) {
    const x = v[t];
    const arr = depth === 0 ? [x] : (x as unknown[]);
    if (depth > 0 && (!Array.isArray(arr) || arr.length !== n)) { out.errors.push(`${key}.${t} が${n}個でない`); continue; }
    lines(arr).forEach((s, i) => checkLine(`${key}.${t}[${i}]`, s, allowed, out));
  }
}

export function validateNpcPack(p: Record<string, unknown>): Check {
  const out: Check = { errors: [], warnings: [] };
  eachTopic(p, 'ask', 2, out, ['their_hobby', 'name']);
  eachTopic(p, 'answer', 2, out, NPC_SLOTS);
  eachTopic(p, 'detail', 2, out, NPC_SLOTS);
  eachTopic(p, 'react', 2, out, ['name']);
  eachTopic(p, 'curt_short', 1, out, NPC_SLOTS, 0);
  const flat: [string, number, string[]][] = [
    ['react_shared', 3, ['hobby', 'name']], ['curt_one', 5, []], ['disclose', 3, NPC_SLOTS], ['match', 3, NPC_SLOTS], ['aizuchi_back', 2, ['name']],
    ['profile_change', 2, ['hobby', 'name']], ['warm', 3, ['name']], ['invite_accept', 3, ['name']], ['invite_busy', 3, ['name']],
  ];
  for (const [k, n, allowed] of flat) {
    const v = p[k];
    if (!Array.isArray(v) || v.length !== n) { out.errors.push(`${k} が${n}個でない`); continue; }
    v.forEach((s, i) => checkLine(`${k}[${i}]`, String(s), allowed, out));
  }
  // 質問の文は質問で終わる
  for (const t of TOPICS) for (const [i, s] of ((p.ask as Record<string, string[]>)?.[t] ?? []).entries()) if (!isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.warnings.push(`ask.${t}[${i}]：質問で終わっていない「${s}」`);
  // 指示語（受け止めの文）
  for (const k of ['react', 'react_shared', 'aizuchi_back', 'curt_one']) for (const s of lines(p[k])) if (DEMONSTRATIVE.test(s)) out.errors.push(`${k}：指示語「${s}」`);
  // 「そこに気づいてもらえて」はプロフィールの趣味を指すので、注意だけ
  for (const k of ['profile_change', 'warm']) for (const s of lines(p[k])) if (DEMONSTRATIVE.test(s)) out.warnings.push(`${k}：指示語「${s}」`);
  for (const s of lines(p.curt_one)) if (s.length > 12 || isQuestion(s)) out.errors.push(`curt_one：長いか質問「${s}」`);
  for (const s of lines(p.curt_short)) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.errors.push(`curt_short：聞き返している「${s}」`);
  for (const s of lines(p.invite_busy)) if (/仲良く|もう少し(お話|やり取り|メッセージ)|電話/.test(s)) out.errors.push(`invite_busy：使わない言い方「${s}」`);
  return out;
}

export function validatePlayerPack(p: Record<string, unknown>): Check {
  const out: Check = { errors: [], warnings: [] };
  const hob = p.hobbies as string[];
  if (!Array.isArray(hob) || hob.length !== 2 || !hob.every((h) => HOBBIES.includes(h)) || hob[0] === hob[1]) out.errors.push(`hobbies が一覧の2つでない ${JSON.stringify(hob)}`);
  for (const k of ['food', 'place', 'hometown']) if (typeof p[k] !== 'string' || !String(p[k]).trim() || String(p[k]).length > 12) out.errors.push(`${k} が名詞1つでない「${p[k]}」`);
  const ans = p.answer as Record<string, string[][]>;
  for (const t of TOPICS) {
    const a = ans?.[t];
    if (!Array.isArray(a) || a.length !== 2 || a.some((x) => !Array.isArray(x) || x.length !== 2)) { out.errors.push(`answer.${t} が2×2でない`); continue; }
    a.flat().forEach((s, i) => { checkLine(`answer.${t}[${i}]`, s, [], out); if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.warnings.push(`answer.${t}[${i}]：聞き返している「${s}」`); });
  }
  eachTopic(p, 'self_talk', 1, out, [], 0);
  eachTopic(p, 'dodge', 1, out, [], 0);
  eachTopic(p, 'ask', 2, out, ['their_hobby', 'name']);
  eachTopic(p, 'dig', 2, out, ['their_hobby', 'their_food', 'their_area', 'their_place', 'name']);
  for (const [k, n, allowed] of [['intro', 2, []], ['aizuchi', 4, []], ['ask_back', 3, ['name']]] as [string, number, string[]][]) {
    const v = p[k];
    if (!Array.isArray(v) || v.length !== n) { out.errors.push(`${k} が${n}個でない`); continue; }
    v.forEach((s, i) => checkLine(`${k}[${i}]`, String(s), allowed, out));
  }
  for (const s of lines(p.intro)) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.errors.push(`intro：質問している「${s}」`);
  for (const s of lines(p.ask_back)) if (!s.includes('{name}')) out.errors.push(`ask_back：{name} がない「${s}」`);
  for (const s of lines(p.answer)) if (/\d{3,4}万/.test(s)) out.errors.push(`answer：年収の数字「${s}」`);
  return out;
}
