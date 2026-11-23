// トークパックの機械検証（生成直後と取り込み時に使う）。2026-11-11、2026-11-23 第2版（言い回しを複数・16話題）に対応
import { ALT_TOPICS, NEW_TOPICS, NPC_FACT_KEYS, THEIR_KEYS, TOPICS, FACT_OF_TOPIC, type TopicId } from '../../src/engine/data/talkSlots';
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

/** 文字列なら1つの配列に（第1版のパックを第2版の形にそろえる） */
const many = (x: unknown): string[] => (Array.isArray(x) ? (x as unknown[]).map(String) : typeof x === 'string' ? [x] : []);
const pairOf = (x: unknown): [string[], string[]] => {
  const a = Array.isArray(x) ? x : [];
  return [many(a[0]), many(a[1])];
};
function byTopicMap<T>(o: unknown, f: (x: unknown) => T): Partial<Record<TopicId, T>> {
  const out: Partial<Record<TopicId, T>> = {};
  if (!o || typeof o !== 'object') return out;
  for (const t of TOPICS) if ((o as Record<string, unknown>)[t] !== undefined) out[t] = f((o as Record<string, unknown>)[t]);
  return out;
}

/** 第1版（talk-1.0）・第2版のどちらでも、ゲームが使う第2版の形にそろえる */
export function upgradeNpcPack(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p };
  for (const k of ['ask', 'answer', 'detail', 'answer_alt', 'detail_alt']) if (p[k]) out[k] = byTopicMap(p[k], pairOf);
  for (const k of ['react', 'react_fact', 'curt_short']) if (p[k]) out[k] = byTopicMap(p[k], many);
  return out;
}
export function upgradePlayerPack(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p };
  for (const k of ['answer', 'ask', 'dig']) if (p[k]) out[k] = byTopicMap(p[k], pairOf);
  for (const k of ['self_talk', 'dodge']) if (p[k]) out[k] = byTopicMap(p[k], many);
  return out;
}

const NPC_SLOTS = [...NPC_FACT_KEYS, 'name'];
const DEMONSTRATIVE = /(^|[、。！？\s])(それ|そこ|あれ|あそこ|その[^後]|あの)/;
const SLOT_VERB = /\{(hobby2?|food|their_hobby|their_food|dish|their_dish|sport|their_sport)\}(に行|をし|をや|をする|しに|に通|して)/;

export function lines(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(lines);
  if (v && typeof v === 'object') return Object.values(v).flatMap(lines);
  return [];
}

function checkLine(where: string, s: string, allowed: readonly string[], out: Check): void {
  if (!s || !s.trim()) { out.errors.push(`${where}：空`); return; }
  for (const m of s.matchAll(/\{([a-z_0-9]+)\}/g)) if (!allowed.includes(m[1])) out.errors.push(`${where}：使えない差し込み {${m[1]}}「${s}」`);
  if (/[{}]/.test(s.replace(/\{[a-z_0-9]+\}/g, ''))) out.errors.push(`${where}：差し込みの書き方が崩れている「${s}」`);
  if (SLOT_VERB.test(s)) out.errors.push(`${where}：差し込みに動詞が付いている「${s}」`);
  const n = splitSentences(s, 99).length;
  if (n > 3) out.errors.push(`${where}：${n}文（3文まで）「${s}」`);
  if (s.length > 110) out.warnings.push(`${where}：長い（${s.length}字）`);
  if (/[「」『』]/.test(s)) out.warnings.push(`${where}：かぎかっこ「${s}」`);
}

/** 話題ごとの [言い回し[], 言い回し[]]（質問の番号2つ）を調べる。need：必ずある話題 */
function eachPair(o: Record<string, unknown>, key: string, need: TopicId[], min: number, out: Check, allowed: (t: TopicId) => readonly string[]): void {
  const v = (o[key] ?? {}) as Record<string, unknown>;
  for (const t of TOPICS) {
    const x = v[t] as unknown[] | undefined;
    if (x === undefined) { if (need.includes(t)) out.errors.push(`${key}.${t} がない`); continue; }
    if (!Array.isArray(x) || x.length !== 2) { out.errors.push(`${key}.${t} が2つ（質問の番号）でない`); continue; }
    x.forEach((vs, i) => {
      const arr = many(vs);
      if (arr.length < min) out.errors.push(`${key}.${t}[${i}] の言い回しが${min}つ未満`);
      arr.forEach((s, j) => checkLine(`${key}.${t}[${i}][${j}]`, s, allowed(t), out));
    });
  }
}
function eachList(o: Record<string, unknown>, key: string, need: TopicId[], min: number, out: Check, allowed: (t: TopicId) => readonly string[]): void {
  const v = (o[key] ?? {}) as Record<string, unknown>;
  for (const t of TOPICS) {
    const x = v[t];
    if (x === undefined) { if (need.includes(t)) out.errors.push(`${key}.${t} がない`); continue; }
    const arr = many(x);
    if (arr.length < min) out.errors.push(`${key}.${t} の言い回しが${min}つ未満`);
    arr.forEach((s, j) => checkLine(`${key}.${t}[${j}]`, s, allowed(t), out));
  }
}

const isV2 = (p: Record<string, unknown>) => String(p.schema_version ?? '') === 'talk-2.0';
const BASE = TOPICS.filter((t) => !NEW_TOPICS.includes(t));

export function validateNpcPack(raw: Record<string, unknown>): Check {
  const p = upgradeNpcPack(raw);
  const out: Check = { errors: [], warnings: [] };
  const v2 = isV2(raw);
  const need = v2 ? TOPICS : BASE;
  const min = 1; // 第2版は生成で3〜4通り作り、ChatGPTの点検で落とした後も1つ以上残っていればよい
  eachPair(p, 'ask', need, min, out, () => ['their_hobby', 'name']);
  eachPair(p, 'answer', need, min, out, () => NPC_SLOTS);
  eachPair(p, 'detail', need, min, out, () => NPC_SLOTS);
  if (v2) {
    eachPair(p, 'answer_alt', ALT_TOPICS, min, out, () => NPC_SLOTS);
    eachPair(p, 'detail_alt', ALT_TOPICS, min, out, () => NPC_SLOTS);
    eachList(p, 'react_fact', [], 1, out, (t) => (FACT_OF_TOPIC[t] ? [FACT_OF_TOPIC[t]!, 'name'] : ['name']));
    for (const t of TOPICS) for (const s of many((p.react_fact as Record<string, unknown> | undefined)?.[t])) {
      const key = FACT_OF_TOPIC[t];
      if (key && !s.includes(`{${key}}`)) out.errors.push(`react_fact.${t}：{${key}} がない「${s}」`);
    }
  }
  eachList(p, 'react', need, min, out, () => ['name']);
  eachList(p, 'curt_short', need, 1, out, () => NPC_SLOTS);
  const flat: [string, number, string[]][] = [
    ['react_shared', 3, ['hobby', 'name']], ['curt_one', 5, []], ['disclose', 3, NPC_SLOTS], ['match', 3, NPC_SLOTS], ['aizuchi_back', 2, ['name']],
    ['profile_change', 2, ['hobby', 'name']], ['warm', 3, ['name']], ['invite_accept', 3, ['name']], ['invite_busy', 3, ['name']],
  ];
  if (v2) flat.push(['bridge', 4, ['name']], ['late_sorry', 3, ['name']]);
  for (const [k, n0, allowed] of flat) {
    const v = p[k];
    const n = v2 ? 1 : n0; // 第2版は点検で落とした後も1つ以上あればよい
    if (!Array.isArray(v) || v.length < n) { out.errors.push(`${k} が${n}個未満`); continue; }
    v.forEach((s, i) => checkLine(`${k}[${i}]`, String(s), allowed, out));
  }
  // 質問の文は質問で終わる
  for (const t of TOPICS) for (const [i, vs] of (((p.ask as Record<string, string[][]>)?.[t]) ?? []).entries()) for (const s of vs) if (!isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.warnings.push(`ask.${t}[${i}]：質問で終わっていない「${s}」`);
  // 指示語（受け止めの文）
  for (const k of ['react', 'react_fact']) for (const t of TOPICS) for (const s of many((p[k] as Record<string, unknown> | undefined)?.[t])) if (DEMONSTRATIVE.test(s)) out.errors.push(`${k}.${t}：指示語「${s}」`);
  for (const k of ['react_shared', 'aizuchi_back', 'curt_one']) for (const s of lines(p[k])) if (DEMONSTRATIVE.test(s)) out.errors.push(`${k}：指示語「${s}」`);
  for (const k of ['profile_change', 'warm']) for (const s of lines(p[k])) if (DEMONSTRATIVE.test(s)) out.warnings.push(`${k}：指示語「${s}」`);
  for (const s of lines(p.curt_one)) if (s.length > 12 || isQuestion(s)) out.errors.push(`curt_one：長いか質問「${s}」`);
  for (const t of TOPICS) for (const s of many((p.curt_short as Record<string, unknown> | undefined)?.[t])) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.errors.push(`curt_short.${t}：聞き返している「${s}」`);
  for (const s of lines(p.invite_busy)) if (/仲良く|もう少し(お話|やり取り|メッセージ)|電話/.test(s)) out.errors.push(`invite_busy：使わない言い方「${s}」`);
  for (const s of lines(p.bridge)) if (isQuestion(s)) out.errors.push(`bridge：質問している（前置きだけにする）「${s}」`);
  for (const s of lines(p.late_sorry)) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.errors.push(`late_sorry：質問している「${s}」`);
  return out;
}

export function validatePlayerPack(raw: Record<string, unknown>): Check {
  const p = upgradePlayerPack(raw);
  const out: Check = { errors: [], warnings: [] };
  const v2 = isV2(raw);
  const need = v2 ? TOPICS : BASE;
  const min = 1; // 第2版は生成で3〜4通り作り、ChatGPTの点検で落とした後も1つ以上残っていればよい
  const hob = p.hobbies as string[];
  if (!Array.isArray(hob) || hob.length !== 2 || !hob.every((h) => HOBBIES.includes(h)) || hob[0] === hob[1]) out.errors.push(`hobbies が一覧の2つでない ${JSON.stringify(hob)}`);
  const facts = v2 ? ['food', 'place', 'hometown', 'sibling', 'pet', 'drink', 'music', 'show', 'sport', 'dish', 'club', 'dateplace'] : ['food', 'place', 'hometown'];
  for (const k of facts) if (typeof p[k] !== 'string' || !String(p[k]).trim() || String(p[k]).length > 14) out.errors.push(`${k} が短い名詞でない「${p[k]}」`);
  eachPair(p, 'answer', need, min, out, () => []);
  for (const s of lines(p.answer)) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.warnings.push(`answer：聞き返している「${s}」`);
  eachList(p, 'self_talk', need, 1, out, () => []);
  eachList(p, 'dodge', need, 1, out, () => []);
  eachPair(p, 'ask', need, min, out, () => ['their_hobby', 'name']);
  eachPair(p, 'dig', need, min, out, () => [...THEIR_KEYS, 'name']);
  const flat: [string, number, string[]][] = [['intro', 2, []], ['aizuchi', 4, []], ['ask_back', 3, ['name']]];
  if (v2) flat.push(['bridge', 3, ['name']]);
  for (const [k, n0, allowed] of flat) {
    const v = p[k];
    const n = v2 ? 1 : n0; // 第2版は点検で落とした後も1つ以上あればよい
    if (!Array.isArray(v) || v.length < n) { out.errors.push(`${k} が${n}個未満`); continue; }
    v.forEach((s, i) => checkLine(`${k}[${i}]`, String(s), allowed, out));
  }
  for (const s of lines(p.intro)) if (isQuestion(splitSentences(s, 9).at(-1) ?? '')) out.errors.push(`intro：質問している「${s}」`);
  for (const s of lines(p.ask_back)) if (!s.includes('{name}')) out.errors.push(`ask_back：{name} がない「${s}」`);
  for (const s of lines(p.answer)) if (/\d{3,4}万/.test(s)) out.errors.push(`answer：年収の数字「${s}」`);
  for (const s of lines(p.bridge)) if (isQuestion(s)) out.errors.push(`bridge：質問している「${s}」`);
  return out;
}

/** プロフィールの自己紹介文の検証（2026-11-23）。rich は6行以上・仕事・休日（趣味）・好きなタイプに触れる */
export function checkBio(b: string, depth: 'rich' | 'normal'): string[] {
  const errs: string[] = [];
  if (!b || !b.trim()) return ['空'];
  for (const m of b.matchAll(/\{([a-z_0-9]+)\}/g)) if (!['job', 'hobby', 'hobby2', 'food'].includes(m[1])) errs.push(`使えない差し込み {${m[1]}}`);
  if (/[{}]/.test(b.replace(/\{[a-z_0-9]+\}/g, ''))) errs.push('差し込みの書き方が崩れている');
  if (SLOT_VERB.test(b)) errs.push('差し込みに動詞');
  if (/[「」『』]/.test(b)) errs.push('かぎかっこ');
  if (/\d{3,4}万|土日|平日|LINE|インスタ|Instagram/.test(b)) errs.push('書かない内容（年収・曜日・連絡先）');
  const lines = b.split('\n').map((x) => x.trim()).filter(Boolean);
  if (depth === 'rich') {
    if (lines.length < 6) errs.push(`${lines.length}行（6行以上）`);
    if (!/仕事|{job}/.test(b)) errs.push('仕事に触れていない');
    if (!/休日|休み|お休み|{hobby}/.test(b)) errs.push('休日・趣味に触れていない');
    if (!/タイプ|惹かれ|素敵だな|好きな人/.test(b)) errs.push('好きなタイプに触れていない');
  } else {
    if (lines.length > 1) errs.push('改行がある');
    if (splitSentences(b, 99).length > 3) errs.push('長い');
  }
  return errs;
}
