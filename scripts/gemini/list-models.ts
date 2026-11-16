// 利用可能なモデルを公式APIで確認し、設定中の生成・レビュー用モデルが存在するかを表示する（キーは表示しない）。
import { API_BASE, IMAGE_MODEL, REVIEW_MODEL, loadApiKey } from './client';

const key = loadApiKey();
const res = await fetch(`${API_BASE}/models?pageSize=300`, { headers: { 'x-goog-api-key': key } });
if (!res.ok) {
  console.log(`HTTP ${res.status}`);
  process.exit(1);
}
const json = (await res.json()) as { models: { name: string; displayName: string; supportedGenerationMethods: string[] }[] };
const names = json.models.map((m) => m.name.replace('models/', ''));
for (const m of json.models.filter((x) => /image|banana|flash|pro|argon/i.test(x.name))) {
  console.log(`${m.name.replace('models/', '').padEnd(36)} ${m.displayName}`);
}
console.log(`\nGEMINI_IMAGE_MODEL = ${IMAGE_MODEL} … ${names.includes(IMAGE_MODEL) ? '利用可能' : '見つかりません'}`);
console.log(`GEMINI_REVIEW_MODEL = ${REVIEW_MODEL} … ${names.includes(REVIEW_MODEL) ? '利用可能' : '見つかりません'}`);
