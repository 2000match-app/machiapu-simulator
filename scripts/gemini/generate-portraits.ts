// プレイ可能キャラクターの基準ポートレートを生成する（Nano Banana Pro 第一候補）。
// 使い方:
//   npm run gemini:generate -- --dry-run                    … プロンプトと概算だけ表示
//   npm run gemini:generate -- --ids M07,M05 --max-requests 4
//   npm run gemini:generate -- --ids M07 --variant --note "顎が細く整えられている→小さめで丸みのある顎に"
// 同じ人物を再実行しても、既に画像がある場合は生成しない（--variant で派生版を別ファイルに追加）。
// 承認済みの画像は上書きしない。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_MODEL, RequestBudget, callInteractions, extractImage, type Attempt } from './client';
import { PORTRAIT_SPECS, FIRST_BATCH, buildPrompt } from './portraitSpecs';
import { PRODUCTION, PUBLIC_PORTRAITS, entry, loadLedger, saveLedger } from './ledger';
import { syncManifest } from './sync-manifest';

// 料金表（https://ai.google.dev/gemini-api/docs/pricing、2026-10-18確認）
const PRICE_PER_IMAGE_USD: Record<string, number> = { '1K': 0.134, '2K': 0.134, '4K': 0.24 };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const ids = (arg('ids') ?? FIRST_BATCH.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const size = arg('size') ?? '1K';
const aspect = arg('aspect') ?? '4:5';
const variant = has('variant');
const note = arg('note');
const dry = has('dry-run');
const maxRequests = Number(arg('max-requests') ?? ids.length + 2);

const ledger = loadLedger();
const targets = ids.filter((id) => {
  const e = ledger.portraits[id];
  if (e && e.versions.length > 0 && !variant) {
    console.log(`${id}: 既に画像があります（v${e.versions.length}）。重複生成しません。派生版は --variant`);
    return false;
  }
  return true;
});

const price = PRICE_PER_IMAGE_USD[size] ?? 0.134;
console.log(`対象: ${targets.join(', ') || '（なし）'}／${targets.length}枚／解像度 ${size}／縦横比 ${aspect}`);
console.log(`モデル: ${IMAGE_MODEL}／概算: ${targets.length} × $${price} = $${(targets.length * price).toFixed(3)}（通信エラーの再送があれば増える）`);
console.log(`このジョブのリクエスト上限: ${maxRequests}`);

if (dry) {
  for (const id of targets) {
    const spec = PORTRAIT_SPECS.find((s) => s.id === id)!;
    console.log(`\n── ${id} ${spec.name} ──\n${buildPrompt(spec, note)}`);
  }
  process.exit(0);
}

const budget = new RequestBudget(maxRequests);
fs.mkdirSync(PUBLIC_PORTRAITS, { recursive: true });

for (const id of targets) {
  const spec = PORTRAIT_SPECS.find((s) => s.id === id);
  if (!spec) {
    console.log(`${id}: 設計がありません`);
    continue;
  }
  const e = entry(ledger, id);
  const prompt = buildPrompt(spec, note);
  const attempts: Attempt[] = [];
  console.log(`\n${id} ${spec.name}：生成中…`);
  let result;
  try {
    result = await callInteractions(
      { model: IMAGE_MODEL, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', aspect_ratio: aspect, image_size: size } },
      { budget, attempts, timeoutMs: 240_000, maxRetries: 2 },
    );
  } catch (err) {
    console.log(`${id}: ${(err as Error).message}`);
    e.failedAttempts.push(...attempts);
    saveLedger(ledger);
    break;
  }
  const img = result ? extractImage(result.json) : null;
  if (!img) {
    if (result) attempts[attempts.length - 1] = { ...attempts[attempts.length - 1], outcome: 'no_image', message: JSON.stringify(result.json).slice(0, 300) };
    e.failedAttempts.push(...attempts);
    saveLedger(ledger);
    console.log(`${id}: 画像を取得できませんでした（試行${attempts.length}回、台帳に記録）`);
    continue;
  }
  const version = e.versions.length + 1;
  const ext = img.mimeType.includes('jpeg') ? 'jpg' : 'png';
  const dir = path.join(PRODUCTION, 'portraits', id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}_v${version}.${ext}`);
  // 来歴情報（SynthID等）を保つため、受け取ったバイト列をそのまま保存する（再圧縮しない）
  fs.writeFileSync(file, img.data);
  e.versions.push({
    version,
    file: path.relative(PRODUCTION, file).replaceAll('\\', '/'),
    createdAt: new Date().toISOString(),
    model: IMAGE_MODEL,
    settings: { aspectRatio: aspect, imageSize: size },
    prompt,
    revisionNote: note,
    attempts,
    sha256: crypto.createHash('sha256').update(img.data).digest('hex'),
    bytes: img.data.length,
    mimeType: img.mimeType,
    approval: 'awaiting_user_review',
  });
  // 承認済みの採用画像がなければ、確認待ちとしてゲーム表示用にコピーする
  const adopted = e.adoptedVersion ? e.versions.find((v) => v.version === e.adoptedVersion) : undefined;
  if (!adopted || adopted.approval !== 'approved') {
    fs.copyFileSync(file, path.join(PUBLIC_PORTRAITS, `${id}.${ext}`));
    e.adoptedVersion = version;
  }
  saveLedger(ledger);
  console.log(`${id}: 保存 ${path.relative(process.cwd(), file)}（試行${attempts.length}回）`);
}

syncManifest();
const billable = Object.values(ledger.portraits).flatMap((p) => [...p.versions.flatMap((v) => v.attempts), ...p.failedAttempts]).filter((a) => a.billable).length;
console.log(`\nこのジョブのリクエスト数: ${budget.used}／上限 ${maxRequests}。台帳上の課金され得る試行の累計: ${billable}`);
