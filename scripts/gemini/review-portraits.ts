// 生成した画像を実際にGeminiへ入力してレビューする（生成とは別リクエスト）。
// 1) 個別レビュー：1人だけか、年齢のずれ、顔・手・背景の破綻、共通撮影条件、文字・小道具、過度の美化、設計との一致
// 2) 盲検比較：男女別に、レベル・職業・収入を伏せ、順序を入れ替えた A/B/C… の画像で印象を比較
//    ファイル名は送らず画像データだけを送る。対応表はレビュー保存時にだけ記録する。
// 使い方: npm run gemini:review-images -- --ids M07,M05,M01,F06,F03,F01
import fs from 'node:fs';
import path from 'node:path';
import { REVIEW_MODEL, RequestBudget, callInteractions, extractText, imagePart, type Attempt } from './client';
import { PORTRAIT_SPECS } from './portraitSpecs';
import { PRODUCTION, loadLedger, saveLedger } from './ledger';
import { Rng } from '../../src/engine/rng';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const ids = (arg('ids') ?? 'M07,M05,M01,F06,F03,F01').split(',').map((s) => s.trim());
const ledger = loadLedger();
const budget = new RequestBudget(Number(arg('max-requests') ?? ids.length + 4));
const attempts: Attempt[] = [];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(PRODUCTION, 'reviews');
fs.mkdirSync(outDir, { recursive: true });

const CHECK_ITEMS = ['single_person', 'age_match', 'face_integrity', 'hands_integrity', 'background_integrity', 'shooting_conditions', 'text_watermark_props', 'over_beautification', 'design_match'] as const;
const SEVERITY = ['none', 'low', 'medium', 'high'] as const;
const UNCERTAINTY = ['low', 'medium', 'high'] as const;

const individualSchema = {
  type: 'object',
  properties: {
    person_count: { type: 'integer' },
    apparent_age_min: { type: 'integer' },
    apparent_age_max: { type: 'integer' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string', enum: [...CHECK_ITEMS] },
          observation: { type: 'string' },
          location: { type: 'string' },
          severity: { type: 'string', enum: [...SEVERITY] },
          uncertainty: { type: 'string', enum: [...UNCERTAINTY] },
          fix: { type: 'string' },
        },
        required: ['item', 'observation', 'location', 'severity', 'uncertainty', 'fix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['person_count', 'apparent_age_min', 'apparent_age_max', 'checks', 'summary'],
};

const compareSchema = {
  type: 'object',
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          observed_features: { type: 'string' },
          apparent_age: { type: 'string' },
          expression: { type: 'string' },
          shooting_notes: { type: 'string' },
          impression_1to5: { type: 'integer' },
          rank: { type: 'integer' },
        },
        required: ['label', 'observed_features', 'apparent_age', 'expression', 'shooting_notes', 'impression_1to5', 'rank'],
      },
    },
    near_equal: { type: 'array', items: { type: 'string' } },
    hard_to_compare: { type: 'array', items: { type: 'string' } },
    confounds: { type: 'array', items: { type: 'string' } },
    uncertainty: { type: 'string', enum: [...UNCERTAINTY] },
  },
  required: ['images', 'near_equal', 'hard_to_compare', 'confounds', 'uncertainty'],
};

function imageFor(id: string): { buf: Buffer; mime: string; version: number } {
  const e = ledger.portraits[id];
  const v = e?.versions.find((x) => x.version === e.adoptedVersion) ?? e?.versions.at(-1);
  if (!v) throw new Error(`${id}: 画像がありません`);
  return { buf: fs.readFileSync(path.join(PRODUCTION, v.file)), mime: v.mimeType, version: v.version };
}

/** 構造化出力でも値の妥当性はスクリプト側で検証する */
function validateIndividual(o: unknown): string[] {
  const errs: string[] = [];
  const x = o as Record<string, unknown>;
  if (!Number.isInteger(x.person_count) || (x.person_count as number) < 0) errs.push('person_count');
  if (!Number.isInteger(x.apparent_age_min) || !Number.isInteger(x.apparent_age_max) || (x.apparent_age_min as number) > (x.apparent_age_max as number)) errs.push('apparent_age');
  const checks = x.checks as Record<string, unknown>[] | undefined;
  if (!Array.isArray(checks) || checks.length === 0) errs.push('checks');
  for (const c of checks ?? []) {
    if (!CHECK_ITEMS.includes(c.item as never)) errs.push(`item:${String(c.item)}`);
    if (!SEVERITY.includes(c.severity as never)) errs.push(`severity:${String(c.severity)}`);
    if (!UNCERTAINTY.includes(c.uncertainty as never)) errs.push(`uncertainty:${String(c.uncertainty)}`);
  }
  return errs;
}

function validateCompare(o: unknown, labels: string[]): string[] {
  const errs: string[] = [];
  const x = o as { images?: { label: string; rank: number; impression_1to5: number }[] };
  const got = (x.images ?? []).map((i) => i.label).sort();
  if (JSON.stringify(got) !== JSON.stringify([...labels].sort())) errs.push(`labels:${got.join(',')}`);
  for (const i of x.images ?? []) {
    if (!Number.isInteger(i.rank) || i.rank < 1 || i.rank > labels.length) errs.push(`rank:${i.label}`);
    if (!Number.isInteger(i.impression_1to5) || i.impression_1to5 < 1 || i.impression_1to5 > 5) errs.push(`impression:${i.label}`);
  }
  return errs;
}

async function ask(input: Record<string, unknown>[], schema: object): Promise<{ data: unknown; raw: string } | null> {
  const r = await callInteractions(
    { model: REVIEW_MODEL, input, response_format: { type: 'text', mime_type: 'application/json', schema } },
    { budget, attempts, timeoutMs: 180_000, maxRetries: 1 },
  );
  if (!r) return null;
  const raw = extractText(r.json);
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    attempts[attempts.length - 1].outcome = 'invalid_json';
    return { data: null, raw };
  }
}

const results: Record<string, unknown> = {};

// 1) 個別レビュー（年齢と顔立ちの設計は伝えるが、容姿レベル・職業・収入は伝えない）
for (const id of ids) {
  const spec = PORTRAIT_SPECS.find((s) => s.id === id)!;
  const img = imageFor(id);
  const prompt = [
    'あなたは写真のレビュー担当です。架空人物のプロフィール写真1枚を見て、実際に画像から観察できることだけを答えてください。',
    '画像から確認できない属性（年収・職業・学歴・身長・性格・交際経験など）は推定しないでください。',
    `制作時の指定：${spec.age}歳の日本人${spec.gender === 'M' ? '男性' : '女性'}。顔立ち：${spec.face}。髪型：${spec.hair}。服装：${spec.clothing}。`,
    '共通の撮影条件：目線の高さ・正面に近い胸上・柔らかい昼の自然光・無地の背景・普通に清潔な私服・口を閉じた穏やかな表情・文字や職業の小道具なし・広告モデル風の美化や加工なし。',
    `確認項目（item）：${CHECK_ITEMS.join(', ')}。`,
    'over_beautification では、目の拡大・輪郭の細身化・肌の過度な平滑化・広告モデル的な整い方など、指定の顔立ちより整えられている点を具体的に書いてください。',
    'design_match では、指定した顔立ちの特徴のうち画像に表れているもの・表れていないものを分けて書いてください。',
    'severity は問題の大きさ、uncertainty は判断の不確かさです。問題がなければ severity は none にしてください。location は画像内の位置（例：顎、右目、背景左上）。',
  ].join('\n');
  const r = await ask([{ type: 'text', text: prompt }, imagePart(img.buf, img.mime)], individualSchema);
  const errs = r?.data ? validateIndividual(r.data) : ['no_data'];
  results[id] = { kind: 'individual', imageVersion: img.version, ok: errs.length === 0, validationErrors: errs, response: r?.data ?? r?.raw ?? null };
  console.log(`${id}: 個別レビュー ${errs.length === 0 ? 'OK' : `検証エラー ${errs.join(',')}`}`);
}

// 2) 盲検比較（男女別。順序をシャッフルし、ラベルA,B,C…だけを付ける）
const blind: Record<string, unknown> = {};
for (const gender of ['M', 'F'] as const) {
  const group = ids.filter((id) => PORTRAIT_SPECS.find((s) => s.id === id)?.gender === gender);
  if (group.length < 2) continue;
  const rng = Rng.fromSeed('blind', stamp, gender);
  const order = rng.shuffle([...group]);
  const labels = order.map((_, i) => String.fromCharCode(65 + i));
  const input: Record<string, unknown>[] = [{
    type: 'text',
    text: [
      `以下の${order.length}枚は、同じ撮影条件を指示して作った架空人物（${gender === 'M' ? '男性' : '女性'}）のマッチングアプリ用プロフィール写真です。画像の順にラベル ${labels.join('・')} を付けます。`,
      '各画像で実際に観察できる顔立ちの特徴を具体的に記述し、マッチングアプリの写真としての「見た目の第一印象の訴求力」を相対的に比べてください。',
      'impression_1to5 は 1=第一印象ではかなり不利 〜 5=際立って魅力的 の目安、rank は1が最も訴求力が高い順位です。',
      '差がほとんどない画像同士は near_equal に「A≒B」の形で書き、無理に差をつけないでください（同順位も可）。',
      '年齢差・表情・服装・光や背景などの撮影条件の差が印象に影響していそうな点は confounds に、比較が難しい点は hard_to_compare に書いてください。',
      '画像から確認できない属性（収入・職業・学歴・身長・性格）は推定しないでください。',
    ].join('\n'),
  }];
  order.forEach((id, i) => {
    const img = imageFor(id);
    input.push({ type: 'text', text: `画像${labels[i]}：` });
    input.push(imagePart(img.buf, img.mime));
  });
  const r = await ask(input, compareSchema);
  const errs = r?.data ? validateCompare(r.data, labels) : ['no_data'];
  blind[gender] = {
    kind: 'blind_comparison',
    // 対応表はモデルに送っていない（保存時にだけ記録）
    labelMap: Object.fromEntries(order.map((id, i) => [labels[i], { id, targetLooks: PORTRAIT_SPECS.find((s) => s.id === id)!.looks, targetAge: PORTRAIT_SPECS.find((s) => s.id === id)!.age }])),
    ok: errs.length === 0,
    validationErrors: errs,
    response: r?.data ?? r?.raw ?? null,
  };
  console.log(`${gender}: 盲検比較 ${errs.length === 0 ? 'OK' : `検証エラー ${errs.join(',')}`}（順序 ${order.join(',')}）`);
}

const file = path.join(outDir, `portrait-review-${stamp}.json`);
const doc = {
  createdAt: new Date().toISOString(),
  model: REVIEW_MODEL,
  note: 'AIの比較結果は補助。容姿の5段階には主観があり、AIの数値だけで合否や現実の美醜を確定させない。人による確認を展開基準にする。',
  targets: ids,
  individual: results,
  blind,
  attempts,
};
fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8');
const rel = path.relative(PRODUCTION, file).replaceAll('\\', '/');
ledger.reviews.push({ file: rel, createdAt: doc.createdAt, kind: 'portrait', model: REVIEW_MODEL, targets: ids });
for (const id of ids) {
  const e = ledger.portraits[id];
  const v = e?.versions.find((x) => x.version === e.adoptedVersion);
  if (v) v.reviewFile = rel;
}
saveLedger(ledger);
console.log(`保存: ${rel}（リクエスト ${budget.used}）`);
