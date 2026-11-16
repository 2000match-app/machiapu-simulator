// 実ブラウザで取得したスクリーンショットをGeminiに渡し、画面の読みやすさ等をレビューする。
// 操作可能か・実際に減点されたかは capture-screens.ts のブラウザ操作と状態検証で確かめる（ここでは判断しない）。
// 使い方: npm run gemini:review-screens -- [--dir production/screens]
import fs from 'node:fs';
import path from 'node:path';
import { REVIEW_MODEL, RequestBudget, callInteractions, extractText, imagePart, type Attempt } from './client';
import { PRODUCTION, loadLedger, saveLedger } from './ledger';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const dir = path.resolve(arg('dir', path.join(PRODUCTION, 'screens')));
const PICK: [string, string][] = [
  ['M05-390/01-select.png', 'スマホ幅：趣旨説明とキャラ選択'],
  ['M05-390/07-home-week2.png', 'スマホ幅：活動ホーム'],
  ['M05-390/04-search.png', 'スマホ幅：候補と検索'],
  ['M05-390/06-chat-w9.png', 'スマホ幅：トーク'],
  ['M05-390/event-02.png', 'スマホ幅：デートの場面'],
  ['M05-390/08-mypage.png', 'スマホ幅：マイページ（写真公開・休息・履歴）'],
  ['M05-390/10-result-gameover.png', 'スマホ幅：結果（失敗）'],
  ['F04-1280/01-select.png', 'PC幅：キャラ選択'],
  ['F04-1280/07-home-week2.png', 'PC幅：活動ホーム＋履歴'],
  ['F04-1280/10-result-cleared.png', 'PC幅：結果（クリア）'],
];
const ITEMS = ['readability', 'clipping', 'crowding', 'mobile_layout', 'life_time_money_clarity', 'choice_clarity', 'tone'] as const;
const schema = {
  type: 'object',
  properties: {
    screen_summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string', enum: [...ITEMS] },
          area: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggestion: { type: 'string' },
        },
        required: ['item', 'area', 'problem', 'severity', 'suggestion'],
      },
    },
    good_points: { type: 'array', items: { type: 'string' } },
  },
  required: ['screen_summary', 'issues', 'good_points'],
};

const budget = new RequestBudget(Number(arg('max-requests', String(PICK.length + 2))));
const attempts: Attempt[] = [];
const results: Record<string, unknown> = {};
for (const [rel, label] of PICK) {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) { console.log(`skip ${rel}`); continue; }
  const prompt = [
    `日本語のマッチングアプリ体験ゲームの画面（${label}）のスクリーンショットです。UIレビュー担当として、画像から見えることだけを評価してください。`,
    `確認項目（item）：${ITEMS.join(', ')}。readability=文字の読みやすさ、clipping=ボタンや文字の見切れ、crowding=情報の混雑、mobile_layout=スマートフォン幅での崩れ、life_time_money_clarity=ライフ・経過時間・支出の分かりやすさ、choice_clarity=選択肢の分かりやすさ、tone=内部パラメータや実装用ラベルが露出して管理画面のようになっていないか。`,
    '問題がない項目は issues に含めないでください。実際に見えている問題だけを、場所（area）と重大度つきで挙げてください。操作できるかどうかは推測しないでください。',
  ].join('\n');
  const r = await callInteractions(
    { model: REVIEW_MODEL, input: [{ type: 'text', text: prompt }, imagePart(fs.readFileSync(file), 'image/png')], response_format: { type: 'text', mime_type: 'application/json', schema } },
    { budget, attempts, timeoutMs: 180_000, maxRetries: 1 },
  );
  let data: unknown = null;
  const errs: string[] = [];
  if (r) {
    try {
      data = JSON.parse(extractText(r.json));
      const d = data as { issues?: { item: string; severity: string }[] };
      for (const i of d.issues ?? []) {
        if (!ITEMS.includes(i.item as never)) errs.push(`item:${i.item}`);
        if (!['low', 'medium', 'high'].includes(i.severity)) errs.push(`severity:${i.severity}`);
      }
    } catch { errs.push('invalid_json'); }
  } else errs.push('no_response');
  results[rel] = { label, ok: errs.length === 0, validationErrors: errs, response: data };
  const n = (data as { issues?: unknown[] } | null)?.issues?.length ?? 0;
  console.log(`${rel}: 指摘${n}件 ${errs.length ? errs.join(',') : ''}`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(path.join(PRODUCTION, 'reviews'), { recursive: true });
const out = path.join(PRODUCTION, 'reviews', `screen-review-${stamp}.json`);
fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), model: REVIEW_MODEL, note: '画面の見え方のレビュー。操作可能性と減点の正しさはブラウザ操作・状態検証で確認する。', results, attempts }, null, 2), 'utf8');
const ledger = loadLedger();
ledger.reviews.push({ file: path.relative(PRODUCTION, out).replaceAll('\\', '/'), createdAt: new Date().toISOString(), kind: 'screen', model: REVIEW_MODEL, targets: PICK.map(([p]) => p) });
saveLedger(ledger);
console.log(`保存: ${path.relative(process.cwd(), out)}（リクエスト ${budget.used}）`);
