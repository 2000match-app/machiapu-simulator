// ゲーム仕様の壁打ち（2026-11-12）。仕様v0.3・判断記録（v0.3以降の変更）・トーク仕様v0.2・バランスの検証結果を Gemini に読ませて批判してもらう。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/gemini/review-spec.ts
// 出力：../ゲーム仕様_壁打ち記録_20261112.md（送った指示・返答をそのまま残す。資料本文は長いので記録には載せない）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, RequestBudget, type Attempt } from './client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const MODEL = process.env.GEMINI_SPEC_MODEL || 'gemini-4-argon';
const OUT = path.join(ROOT, 'ゲーム仕様_壁打ち記録_20261112.md');

const docs: [string, string][] = [
  ['シミュレーター仕様案_v0.3.md（元の仕様。以下の判断記録で変わった点はそちらが優先）', path.join(ROOT, 'シミュレーター仕様案_v0.3.md')],
  ['game/docs/判断記録.md（v0.3以降のユーザー指示による変更と、実装上の判断。新しいものが上）', path.join(ROOT, 'game/docs/判断記録.md')],
  ['トーク仕様案_v0.2.md（トークの温度。第1〜4段階まで実装済み。選択肢はその後さらに作り直した＝判断記録参照）', path.join(ROOT, 'トーク仕様案_v0.2.md')],
  ['game/docs/検証結果_バランス.md（自動プレイのクリア率。2026-11-11時点）', path.join(ROOT, 'game/docs/検証結果_バランス.md')],
];

const ROUND1 = `あなたは日本のマッチングアプリ（Pairs・with・タップル・Omiai・東カレデート等）の実際の利用実態に詳しいゲームデザイナーです。
これから、恋愛シミュレーションゲーム「マチアプシミュレーター」の仕様書一式を渡します。ユーザーが人物を1人選び、首都圏のマッチングアプリを使って「交際60日」を目指すゲームです。ライフ（精神的な消耗）が0になると失敗。ゲーム中に生成AIは使わず、会話文は事前生成です。
制作者の判断基準は「実際のマッチングアプリにない機能は入れない。実際にある体験は入れる」です。

資料は、元の仕様（v0.3）と、その後の変更をまとめた判断記録です。判断記録の内容が新しく、元の仕様と食い違う点は判断記録が正です。

次の観点で、遠慮なく批判してください。褒め言葉は不要です。重大な順に、各指摘に「どこ（資料のどの部分）」「何が問題か」「直し方の具体案（数値があれば数値も）」を書いてください。
1. 実際のマッチングアプリの体験とずれている点（ありえない仕組み・ありえない頻度・現実ならあるはずの体験が抜けている点）
2. ゲームとして退屈・理不尽・正解が分かりやすすぎる・抜け道がある点（最適戦略が1つに決まる、プレイヤーの判断が結果に効かない、など）
3. ルールどうしの矛盾・説明と実装のずれ・数値の不整合
4. 検証結果（クリア率）から見たバランスの問題（人物ごとの難易度の差、失敗の原因の偏りなど）
5. 判断記録の変更が積み重なって、元の仕様の狙い（何を体験させたいか）から外れてきている点

最後に、全体として一番の問題を3行でまとめてください。`;

const ROUND2 = `ありがとうございます。続けて次を答えてください。
1. あなたの指摘のうち、最初に直すべきものを10個選び、優先順に並べてください。それぞれ「変えるルールと数値」「期待する体験の変化」「クリア率への影響の見込み」「副作用・リスク」を書いてください。
2. あなたの指摘のうち、実際のアプリの挙動について確信が持てないもの（制作者が実態を確認すべきもの）を挙げ、何を確認すればよいか書いてください。
3. 逆に、この仕様で「実際のマチアプらしさ」がよく出ていて、変えないほうがよい部分があれば、短く挙げてください（変更で壊さないため）。`;

function firstId(json: Record<string, unknown>): string | undefined {
  return typeof json.id === 'string' ? json.id : undefined;
}

async function main(): Promise<void> {
  const budget = new RequestBudget(6);
  const material = docs.map(([title, file]) => `\n\n===== 資料：${title} =====\n${fs.readFileSync(file, 'utf8')}`).join('');
  const log: string[] = [
    '# ゲーム仕様 壁打ち記録（Gemini）', '',
    `- 日付：2026-11-12`, `- モデル：${MODEL}（Interactions API。2往復目は1往復目を引き継いで送信）`,
    `- 渡した資料：${docs.map(([t]) => t.replace(/（.*）/, '')).join('、')}（本文は長いので記録には載せない）`, '',
  ];
  const a1: Attempt[] = [];
  const r1 = await callInteractions({ model: MODEL, input: [{ type: 'text', text: ROUND1 + material }] }, { budget, attempts: a1, timeoutMs: 600_000 });
  if (!r1) throw new Error(`1往復目に失敗：${a1.map((a) => `${a.outcome}${a.httpStatus ?? ''} ${a.message ?? ''}`).join(' / ')}`);
  const t1 = extractText(r1.json);
  log.push('## 1往復目　送った指示', '', '````text', ROUND1, '````', '', '## 1往復目　返答', '', t1, '');
  fs.writeFileSync(OUT, log.join('\n'), 'utf8');
  console.log(`1往復目 ${t1.length}字`);
  const a2: Attempt[] = [];
  const r2 = await callInteractions({ model: MODEL, previous_interaction_id: firstId(r1.json), input: [{ type: 'text', text: ROUND2 }] }, { budget, attempts: a2, timeoutMs: 600_000 });
  if (!r2) throw new Error(`2往復目に失敗：${a2.map((a) => `${a.outcome}${a.httpStatus ?? ''} ${a.message ?? ''}`).join(' / ')}`);
  const t2 = extractText(r2.json);
  log.push('## 2往復目　送った指示', '', '````text', ROUND2, '````', '', '## 2往復目　返答', '', t2, '');
  fs.writeFileSync(OUT, log.join('\n'), 'utf8');
  console.log(`2往復目 ${t2.length}字 → ${OUT}`);
}

void main().catch((e) => { console.error(String(e)); process.exit(1); });
