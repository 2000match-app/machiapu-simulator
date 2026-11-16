// 顔をぼかした写真・イラスト（2026-11-12 追加、44枚）の設定をGeminiで仮決めする。性別と種類は目視で決めたものを渡す。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/photos/classify-blurred.ts <サムネイルのフォルダ> <出力JSON>
import fs from 'node:fs';
import path from 'node:path';
import { callInteractions, extractText, imagePart, REVIEW_MODEL, RequestBudget, type Attempt } from '../gemini/client';

const [thumbDir, outFile] = process.argv.slice(2);
const MALE_ILLUS = [1, 2, 3, 4, 5, 6, 10, 22];
const FEMALE_ILLUS = [19, 21, 23, 24, 25, 26, 27, 28, 29, 30, 32, 35];
const FEMALE_BLUR = [31, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44];
const items = Array.from({ length: 44 }, (_, i) => {
  const n = i + 1;
  const gender = MALE_ILLUS.includes(n) || !(FEMALE_ILLUS.includes(n) || FEMALE_BLUR.includes(n)) ? 'M' : 'F';
  const kind = MALE_ILLUS.includes(n) || FEMALE_ILLUS.includes(n) ? 'illustration' : 'blurred';
  return { id: `z${String(n).padStart(3, '0')}`, gender, kind };
});

const schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' }, age: { type: 'integer' }, job: { type: 'string' },
      income_min: { type: 'integer' }, income_max: { type: 'integer' },
      education: { type: 'string', enum: ['highschool', 'vocational', 'univ', 'top', 'grad'] },
      hobbies: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    },
    required: ['id', 'age', 'job', 'income_min', 'income_max', 'education', 'hobbies'],
  },
};

async function main(): Promise<void> {
  const budget = new RequestBudget(8);
  const out: unknown[] = [];
  for (let b = 0; b < items.length; b += 11) {
    const batch = items.slice(b, b + 11);
    const input: Record<string, unknown>[] = [{ type: 'text', text: `マッチングアプリの恋愛シミュレーションゲームの相手キャラ（架空）の設定を作ります。次の画像はプロフィール写真で、顔をぼかした写真か、アニメ風のイラスト（顔写真を載せない人がよく使う）です。
画像ごとに、見た目の雰囲気・服装・背景から推定年齢（23〜45歳、整数）と、架空の設定（職業・年収の幅（万円）・学歴・趣味3つ）を作ってください。首都圏で働く、ありふれた人にしてください（医師・弁護士・経営者は避ける）。年収は年齢と職業に合う現実的な値（男性は350〜800万円、女性は250〜550万円くらいが中心）。イラストの人は、顔を出さない理由がにじむ職業・趣味でもよい。
各画像の id・性別・種類：
${batch.map((x) => `- ${x.id}：${x.gender === 'M' ? '男性' : '女性'}・${x.kind === 'illustration' ? 'イラスト' : '顔をぼかした写真'}`).join('\n')}
JSONの配列だけを出力してください。` }];
    for (const x of batch) {
      input.push({ type: 'text', text: `画像 ${x.id}` });
      input.push(imagePart(fs.readFileSync(path.join(thumbDir, `${x.id}.jpg`)), 'image/jpeg'));
    }
    const attempts: Attempt[] = [];
    const res = await callInteractions({ model: REVIEW_MODEL, input, response_format: { type: 'text', mime_type: 'application/json', schema } }, { budget, attempts });
    if (!res) throw new Error(`失敗：${attempts.map((a) => a.outcome + (a.httpStatus ?? '')).join(',')}`);
    const arr = JSON.parse(extractText(res.json)) as { id: string }[];
    for (const r of arr) out.push({ ...r, ...batch.find((x) => x.id === r.id) });
    console.log(`batch ${b / 11 + 1}: ${arr.length}件`);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1), 'utf8');
  console.log(`${out.length}件 → ${outFile}（リクエスト ${budget.used} 回）`);
}
void main();
