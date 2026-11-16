// 代表的なプレイログをGeminiに渡し、会話と数値の矛盾、相手の秘密の早すぎる露出、
// 発生していない行動への批判、どのキャラでも同じ展開になる問題をレビューする。
// レビューだけで「ゲームバランス検証済み」とはしない（バランスは sim:balance の集計で見る）。
// 使い方: npm run gemini:review-playlog -- [--files a.md,b.md]
import fs from 'node:fs';
import path from 'node:path';
import { REVIEW_MODEL, RequestBudget, callInteractions, extractText, type Attempt } from './client';
import { PRODUCTION, loadLedger, saveLedger } from './ledger';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const dir = path.join(PRODUCTION, 'playlogs');
const files = arg('files', fs.readdirSync(dir).filter((f) => f.endsWith('.md')).join(',')).split(',').filter(Boolean);
const CATS = ['numbers_vs_text', 'early_secret_exposure', 'unfounded_criticism', 'sameness_across_characters', 'tone_or_harm', 'other'] as const;
const schema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...CATS] },
          log: { type: 'string' },
          quote: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggestion: { type: 'string' },
        },
        required: ['category', 'log', 'quote', 'problem', 'severity', 'uncertainty', 'suggestion'],
      },
    },
    overall: { type: 'string' },
  },
  required: ['findings', 'overall'],
};

const logs = files.map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 60_000) }));
const prompt = [
  'あなたはゲームシナリオの検証担当です。以下はマッチングアプリ体験ゲームの自動プレイログ（複数キャラ）です。',
  'ログの「結果解説（プレイ中は表示されない内部事情）」以外は、プレイヤーがプレイ中に見る文面です。',
  `次の観点で問題を探してください（category）：${CATS.join(', ')}。`,
  '- numbers_vs_text：会話や場面の文面と、ライフ・金額・日数・交際日数などの数値の食い違い',
  '- early_secret_exposure：相手の内部目的（業者・既婚・身体目的など）がプレイ中の文面で断定的に明かされている箇所（結果解説は対象外）',
  '- unfounded_criticism：結果画面のフィードバックが、ログに起きていない行動を批判している箇所',
  '- sameness_across_characters：キャラが違うのに同じ文面・同じ展開ばかりになっている点',
  '- tone_or_harm：特定の属性への蔑視、犯罪の手口の具体的な描写、性的な描写の行き過ぎ',
  '各指摘には、どのログか（log）、該当箇所の短い引用（quote）、問題、重大度、不確かさ、修正案を付けてください。問題がなければ findings は空配列にしてください。',
].join('\n');
const input: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
for (const l of logs) input.push({ type: 'text', text: `\n===== ログ：${l.name} =====\n${l.text}` });

const budget = new RequestBudget(3);
const attempts: Attempt[] = [];
const r = await callInteractions(
  { model: REVIEW_MODEL, input, response_format: { type: 'text', mime_type: 'application/json', schema } },
  { budget, attempts, timeoutMs: 300_000, maxRetries: 1 },
);
let data: unknown = null;
const errs: string[] = [];
if (r) {
  try {
    data = JSON.parse(extractText(r.json));
    for (const f of (data as { findings: { category: string; severity: string; log: string }[] }).findings ?? []) {
      if (!CATS.includes(f.category as never)) errs.push(`category:${f.category}`);
      if (!['low', 'medium', 'high'].includes(f.severity)) errs.push(`severity:${f.severity}`);
      if (!files.includes(f.log) && !files.some((x) => f.log.includes(x.replace('.md', '')))) errs.push(`log:${f.log}`);
    }
  } catch { errs.push('invalid_json'); }
} else errs.push('no_response');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(PRODUCTION, 'reviews', `playlog-review-${stamp}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), model: REVIEW_MODEL, files, validationErrors: errs, response: data, attempts }, null, 2), 'utf8');
const ledger = loadLedger();
ledger.reviews.push({ file: path.relative(PRODUCTION, out).replaceAll('\\', '/'), createdAt: new Date().toISOString(), kind: 'playlog', model: REVIEW_MODEL, targets: files });
saveLedger(ledger);
console.log(`指摘 ${(data as { findings?: unknown[] } | null)?.findings?.length ?? 0}件 ${errs.join(',')}`);
console.log(`保存: ${path.relative(process.cwd(), out)}`);
