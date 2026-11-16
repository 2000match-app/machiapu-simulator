// ゲーム仕様の壁打ち（2026-11-14）：Gemini と ChatGPT の両方に今の仕様を批判してもらい、相手の指摘も読ませて詰める。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/gemini/review-spec-dual.ts
//   キーのファイルの sk- で始まる行を ChatGPT（OpenAI）のキー、それ以外を Gemini のキーとして読む（表示・保存しない）
// 出力：../ゲーム仕様_壁打ち記録_20261114.md（送った指示・返答をそのまま残す。資料本文は長いので記録には載せない）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, loadOpenAiKey, RequestBudget, type Attempt } from './client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const GEMINI_MODEL = process.env.GEMINI_SPEC_MODEL || 'gemini-4-argon';
const OPENAI_MODEL = process.env.OPENAI_SPEC_MODEL || 'gpt-6.1-sol';
const OUT = path.join(ROOT, 'ゲーム仕様_壁打ち記録_20261114.md');

const docs: [string, string][] = [
  ['シミュレーター仕様案_v0.3.md（元の仕様。判断記録で変わった点はそちらが優先）', path.join(ROOT, 'シミュレーター仕様案_v0.3.md')],
  ['game/docs/判断記録.md（v0.3以降のユーザー指示による変更と実装上の判断。新しいものが上。2026-11-13〜14 に時間進行・ロック画面・通知・生活リズムなどを大きく変えた）', path.join(ROOT, 'game/docs/判断記録.md')],
  ['トーク仕様案_v0.2.md（トークの温度。選択肢はその後作り直した＝判断記録参照）', path.join(ROOT, 'トーク仕様案_v0.2.md')],
  ['ゲーム仕様_壁打ち記録_20261112.md（前回 2026-11-12 の壁打ち。ここで出た指摘のうち採用したものは判断記録の「Gemini の指摘から採用した5つ」）', path.join(ROOT, 'ゲーム仕様_壁打ち記録_20261112.md')],
];

const ROUND1 = `あなたは日本のマッチングアプリ（Pairs・with・タップル・Omiai・東カレデート等）の実際の利用実態に詳しいゲームデザイナーです。
恋愛シミュレーションゲーム「マチアプシミュレーター」の仕様書一式を渡します。ユーザーが人物を1人選び、首都圏のマッチングアプリで「交際60日」を目指すゲームです。ライフ（精神的な消耗）が0になると失敗。ゲーム中に生成AIは使わず、会話文は事前生成です。
制作者の判断基準は「実際のマッチングアプリにない機能は外し、実際にある体験は入れる。ただしゲームとしての面白さのために崩すことはある」です。

最近の大きな変更（詳細は判断記録の新しい項目）：
- 1日単位の進行から、時刻のある進行に変えた。アプリを閉じるとスマホのロック画面になり、自由時間は現実20秒＝1日で進む。睡眠・勤務・予定の時間は約2秒の表示で飛ばす。人物ごとに生活リズム（勤務・残業・在宅・飲み会など）がある。
- ロック画面に通知（マチアプ／ほかのアプリ／プライベートの出来事）。いいねの回数制限は撤廃。
- トークは「相槌・質問に答える／プロフィールを見て質問する／電話してみたいと言う」が中心。電話の後はデートになりやすい。誘えるのは3〜6往復以降。
- 前回の壁打ち（資料に記録あり）の指摘の一部は採用済み。

前回と同じ指摘の繰り返しは避け、前回の後に入った変更や、前回の指摘で未解決のまま重要なものを中心に、遠慮なく批判してください。褒め言葉は不要です。重大な順に、各指摘に「どこ（資料のどの部分）」「何が問題か」「直し方の具体案（数値があれば数値も）」を書いてください。
1. 実際のマッチングアプリの体験とずれている点
2. ゲームとして退屈・理不尽・正解が分かりやすすぎる・抜け道がある点（特に、時間進行とロック画面の導入で生まれた問題）
3. ルールどうしの矛盾・数値の不整合
4. 変更が積み重なって、元の仕様の狙い（何を体験させたいか）から外れてきている点

最後に、全体として一番の問題を3行でまとめてください。`;

const round2 = (other: string, otherName: string) => `ありがとうございます。次は、同じ資料を読んだ別のAI（${otherName}）の批判です。

===== ${otherName} の批判 =====
${other}
===== ここまで =====

次を答えてください。
1. ${otherName} の指摘のうち、賛成するもの・反対するもの（理由つき）・あなたの指摘と同じことを言っているもの。
2. 両方の指摘を合わせて、制作者が最初に直すべきものを10個、優先順に。それぞれ「変えるルールと数値」「期待する体験の変化」「副作用・リスク」を短く。
3. 実際のアプリの挙動について確信が持てず、制作者が実態を確認すべきもの。
4. 変えないほうがよい（実際のマチアプらしさがよく出ている）部分を短く。`;

// ---- ChatGPT（OpenAI Responses API） ----
async function openai(input: string, previous?: string): Promise<{ id: string; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 900_000);
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loadOpenAiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, input, ...(previous ? { previous_response_id: previous } : {}) }),
      signal: ctrl.signal,
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify((j as { error?: unknown }).error ?? j).slice(0, 300)}`);
    const out = (j.output as { type: string; content?: { type: string; text?: string }[] }[] | undefined) ?? [];
    const text = out.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('\n');
    return { id: String(j.id), text };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Gemini（Interactions API） ----
const budget = new RequestBudget(6);
async function gemini(input: string, previous?: string): Promise<{ id: string; text: string }> {
  const attempts: Attempt[] = [];
  const r = await callInteractions({ model: GEMINI_MODEL, input: [{ type: 'text', text: input }], ...(previous ? { previous_interaction_id: previous } : {}) }, { budget, attempts, timeoutMs: 900_000 });
  if (!r) throw new Error(`Gemini 失敗：${attempts.map((a) => `${a.outcome}${a.httpStatus ?? ''} ${a.message ?? ''}`).join(' / ')}`);
  return { id: String((r.json as { id?: string }).id ?? ''), text: extractText(r.json) };
}

async function main(): Promise<void> {
  const material = docs.map(([title, file]) => `\n\n===== 資料：${title} =====\n${fs.readFileSync(file, 'utf8')}`).join('');
  const log: string[] = [
    '# ゲーム仕様 壁打ち記録（Gemini × ChatGPT）', '',
    '- 日付：2026-11-14',
    `- モデル：Gemini ${GEMINI_MODEL}（Interactions API）／ChatGPT ${OPENAI_MODEL}（Responses API）。2往復目は1往復目を引き継ぎ、相手の批判を読ませた`,
    `- 渡した資料：${docs.map(([t]) => t.replace(/（.*）/, '')).join('、')}（本文は長いので記録には載せない）`, '',
    '## 1往復目　送った指示（両方に同じもの）', '', '````text', ROUND1, '````', '',
  ];
  const save = () => fs.writeFileSync(OUT, log.join('\n'), 'utf8');

  const [g1, o1] = await Promise.all([gemini(ROUND1 + material), openai(ROUND1 + material)]);
  log.push('## 1往復目　Gemini の返答', '', g1.text, '', '## 1往復目　ChatGPT の返答', '', o1.text, '');
  save();
  console.log(`1往復目 Gemini ${g1.text.length}字／ChatGPT ${o1.text.length}字`);

  const [g2, o2] = await Promise.all([gemini(round2(o1.text, 'ChatGPT'), g1.id), openai(round2(g1.text, 'Gemini'), o1.id)]);
  log.push('## 2往復目　送った指示（相手の批判を付けて）', '', '````text', round2('（相手の1往復目の返答）', '相手のAI'), '````', '',
    '## 2往復目　Gemini の返答（ChatGPT の批判を読んで）', '', g2.text, '', '## 2往復目　ChatGPT の返答（Gemini の批判を読んで）', '', o2.text, '');
  save();
  console.log(`2往復目 Gemini ${g2.text.length}字／ChatGPT ${o2.text.length}字 → ${OUT}`);
}

void main().catch((e) => { console.error(String(e)); process.exit(1); });
