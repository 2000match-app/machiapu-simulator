// マチアプ風のプロフィール写真（スマホのスナップ）を試作する。相手NPC用（2026-11-03 試作6枚）。
// 参考：ユーザー提供の素材（drive-download-…）の写り方。素材の画像そのものは送らず、構図・場面だけを文章で指定する。
// 出力は production/app-photos/ に保存（ゲームの public には入れない。採用はユーザーの確認後）。
// 使い方: GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/gemini/generate-app-photos.ts [--dry-run] [--ids a1,a2] [--max-requests 8]
import fs from 'node:fs';
import path from 'node:path';
import { RequestBudget, callInteractions, extractImage, type Attempt } from './client';

const MODEL = process.env.GEMINI_APP_PHOTO_MODEL || 'gemini-nano-banana-2.1';
const PRICE_1K_USD = 0.0336; // 2026-11-03 料金ページの標準価格（1K）。出力トークンが多いと上振れする
const OUT = path.resolve(import.meta.dirname, '..', '..', 'production', 'app-photos');

interface Spec {
  id: string;
  gender: 'M' | 'F';
  age: number;
  looks: 1 | 2 | 3 | 4 | 5;
  who: string;
  scene: string;
  /** 写真のウケが悪い撮り方（トイレ自撮りなど） */
  weak?: string;
  /** 顔が写らない（後ろ姿・スマホで隠れる鏡自撮りなど）。looks は実際の顔評価 */
  faceHidden?: boolean;
  /** ゲームに組み込む時の設定（npcPhotos.ts へ移す） */
  game?: { job?: string; income?: [number, number]; education?: 'top' | 'univ' | 'student' | 'vocational' | 'highschool'; hobbies?: string[]; note: string };
}

const SPECS: Spec[] = [
  { id: 'a1', gender: 'M', age: 26, looks: 3, who: 'an ordinary office worker with short black hair, wearing a plain knit sweater', scene: 'sitting at a cafe table holding a latte, photo taken casually by a friend across the table' },
  { id: 'a2', gender: 'M', age: 33, looks: 2, who: 'a slightly overweight man with a round face, messy hair and a plain dark hoodie', scene: 'a selfie taken with a front camera from a low angle in a car parking lot on a cloudy day', weak: 'unflattering low-angle selfie, a little blurry' },
  { id: 'a3', gender: 'M', age: 29, looks: 4, who: 'a fit man with neat short hair in an outdoor jacket', scene: 'standing at a mountain viewpoint on a trip, smiling naturally, photo taken by a friend' },
  { id: 'a4', gender: 'F', age: 27, looks: 3, who: 'an ordinary office worker with shoulder-length hair and light natural makeup', scene: 'smiling at a cafe with a slice of cake on the table, photo taken by a friend' },
  { id: 'a5', gender: 'F', age: 31, looks: 2, who: 'a plain-looking woman with tired eyes, simple ponytail and minimal makeup', scene: 'a selfie at an izakaya table under yellowish indoor lighting', weak: 'harsh indoor light and slight motion blur' },
  { id: 'a6', gender: 'F', age: 24, looks: 4, who: 'a young woman with long hair in a casual spring outfit', scene: 'walking in a park with cherry blossoms, candid smile, photo taken by a friend' },
  // ── 男性の量産（5枚ずつ）。顔が写らない構図も混ぜる ──
  { id: 'b01', gender: 'M', age: 30, looks: 3, faceHidden: true, who: 'a man with short hair in a navy coat and beige chinos', scene: 'seen from behind, standing at a riverside railing looking at the city skyline at dusk, photo taken by a friend',
    game: { job: '会社員（事務・企画）', income: [400, 500], education: 'univ', hobbies: ['散歩', '写真'], note: '後ろ姿・顔出しなし（実際の顔評価3）' } },
  { id: 'b02', gender: 'M', age: 27, looks: 2, faceHidden: true, who: 'a thin man in an oversized black T-shirt and black pants', scene: 'a mirror selfie in a small apartment entrance; the phone completely covers his face', weak: 'cluttered background with shoes and a laundry bag visible',
    game: { job: '製造・技術職', income: [300, 380], education: 'highschool', hobbies: ['ゲーム', '筋トレ'], note: 'スマホで顔が隠れる玄関の鏡自撮り・生活感が出ていてウケが悪い（実際の顔評価2）' } },
  { id: 'b03', gender: 'M', age: 34, looks: 3, who: 'a cheerful man with short hair in a grey hoodie', scene: 'at a riverside barbecue with friends, holding tongs over the grill, laughing, photo taken by a friend',
    game: { job: '会社員（営業）', income: [500, 620], education: 'univ', hobbies: ['BBQ', 'キャンプ'], note: 'BBQの写真・趣味は陽キャ' } },
  { id: 'b04', gender: 'M', age: 24, looks: 4, who: 'a slim stylish man in a long dark coat', scene: 'a full-body shot from about 10 meters away, walking across a street in Shibuya on a sunny afternoon, face small but visible',
    game: { job: 'IT企業勤務', income: [380, 460], education: 'univ', hobbies: ['古着', 'カフェ巡り'], note: '遠めの全身写真・おしゃれ' } },
  { id: 'b05', gender: 'M', age: 38, looks: 1, who: 'a balding man with a stubble beard and glasses, in a work jacket', scene: 'a selfie taken in the driver seat of a parked car, slightly from below', weak: 'unflattering angle, harsh daylight, phone camera distortion',
    game: { job: '製造・技術職', income: [380, 450], education: 'highschool', hobbies: ['ドライブ', 'パチンコ'], note: '車内自撮り・ウケが悪い（顔評価1）' } },
  { id: 'b06', gender: 'M', age: 22, looks: 2, who: 'a university student with glasses and a bowl haircut in a college sweatshirt', scene: 'at a crowded izakaya with university friends around him, making a peace sign; he is in the center and in focus', weak: 'friends partly cut off at the edges, flash photo look',
    game: { job: '大学生', income: [0, 100], education: 'student', hobbies: ['ゲーム', 'カラオケ'], note: 'サークルの飲み会写真・大学生（顔評価2）' } },
  { id: 'b07', gender: 'M', age: 41, looks: 3, who: 'a calm middle-aged man with short greying hair in a casual shirt', scene: 'crouching at a dog run, petting a shiba inu, photo taken by a friend on a sunny weekend',
    game: { job: '会社員（管理職）', income: [650, 800], education: 'univ', hobbies: ['犬', '散歩'], note: '犬と一緒の写真・管理職' } },
  { id: 'b08', gender: 'M', age: 29, looks: 5, who: 'a handsome man with neat hair in a white shirt and light cardigan', scene: 'sitting at a cafe terrace with a book and a coffee, looking up at the camera with a soft smile, photo taken by a friend',
    game: { job: '医師', income: [1000, 1400], education: 'top', hobbies: ['読書', 'カフェ巡り'], note: 'ハイスペ・顔評価5' } },
  { id: 'b09', gender: 'M', age: 31, looks: 2, who: 'a man with unkempt hair and a checked shirt, carrying a backpack', scene: 'in a game arcade holding a big plush toy he won from a crane game, awkward smile', weak: 'neon lighting makes the skin look uneven',
    game: { job: 'エンジニア', income: [420, 520], education: 'univ', hobbies: ['ゲーム', 'アニメ'], note: 'ゲーセンの写真・オタク（顔評価2）' } },
  { id: 'b10', gender: 'M', age: 35, looks: 3, faceHidden: true, who: 'a man of average build in a T-shirt and shorts', scene: 'backlit silhouette standing on a beach at sunset, arms raised, only the dark outline of his body visible',
    game: { job: '公務員', income: [450, 560], education: 'univ', hobbies: ['海', '旅行'], note: '夕日の逆光シルエット・顔出しなし（実際の顔評価3）' } },
  // ── 顔評価5のイケメン ──
  { id: 'b11', gender: 'M', age: 27, looks: 5, who: 'a tall man in a white linen shirt with slightly wavy hair', scene: 'on a seaside boardwalk on a bright summer day, turning to the camera with a relaxed smile, photo taken by a friend',
    game: { job: '大手商社', income: [900, 1200], education: 'top', hobbies: ['旅行', 'サーフィン'], note: 'イケメン・ハイスペ（顔評価5）' } },
  { id: 'b12', gender: 'M', age: 25, looks: 5, who: 'a slim man with a trendy center-part haircut in a black knit and silver necklace', scene: 'at a rooftop bar at night with city lights behind him, holding a glass, looking at the camera',
    game: { job: 'アパレル販売', income: [280, 360], education: 'vocational', hobbies: ['古着', '音楽フェス'], note: 'イケメンだが年収は低い（顔評価5）' } },
  { id: 'b13', gender: 'M', age: 31, looks: 5, who: 'a well-groomed man with short neat hair in a navy suit with a light grey tie', scene: 'as a guest at the wedding reception of a friend, standing by a window with a champagne glass, candid smile, photo taken by a friend',
    game: { job: '弁護士', income: [900, 1300], education: 'top', hobbies: ['ゴルフ', 'ワイン'], note: '結婚式の参列写真・イケメン・ハイスペ（顔評価5）' } },
];

const LOOKS: Record<Spec['looks'], string> = {
  1: 'clearly below-average looks: unattractive, awkward features, uneven skin, not photogenic at all. Do NOT make the person look good.',
  2: 'below-average, plain looks: unremarkable face, some skin imperfections, not photogenic. Do NOT beautify.',
  3: 'completely average looks, like an ordinary person you pass on the street. No glamour.',
  4: 'good-looking but still a real everyday person, not a model.',
  5: 'strikingly handsome or beautiful: sharp well-balanced features, clear skin, groomed eyebrows, stylish hair; the kind of face that gets the most likes on a dating app (b08 came out too average, so make this unmistakable). Still a real person in a casual snapshot, not a magazine shoot, and not resembling any celebrity.',
};

function prompt(s: Spec): string {
  return [
    `A realistic smartphone photo used on a Japanese dating app profile. Subject: a fictional Japanese ${s.gender === 'M' ? 'man' : 'woman'}, about ${s.age} years old, ${s.who}.`,
    `Scene: ${s.scene}, in Tokyo or the nearby area.`,
    s.faceHidden ? 'Appearance: an ordinary build and style; the face is not shown.' : `Appearance level: ${LOOKS[s.looks]}`,
    s.weak ? `Photo quality: ${s.weak}.` : 'Photo quality: ordinary phone camera snapshot, natural light, slight noise.',
    `Style: candid everyday snapshot, not a studio portrait, not retouched, no professional lighting, no bokeh-heavy portrait mode. One person only in focus${s.faceHidden ? '. The face must NOT be visible at all' : ', face visible'}.`,
    'Do not resemble any real or famous person. No text, no watermark, no logos.',
  ].join('\n');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ids = arg('ids')?.split(',');
const targets = SPECS.filter((s) => !ids || ids.includes(s.id)).filter((s) => !fs.existsSync(path.join(OUT, `${s.id}.png`)) && !fs.existsSync(path.join(OUT, `${s.id}.jpg`)));
const budget = new RequestBudget(Number(arg('max-requests') ?? targets.length + 2));
console.log(`モデル: ${MODEL}／対象 ${targets.length}枚／概算 ${targets.length} × $${PRICE_1K_USD} = $${(targets.length * PRICE_1K_USD).toFixed(3)}（上振れあり）／リクエスト上限 ${budget.max}`);
if (process.argv.includes('--dry-run')) {
  for (const s of targets) console.log(`--- ${s.id}\n${prompt(s)}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const ledgerPath = path.join(OUT, 'ledger.json');
const ledger: Record<string, unknown>[] = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
for (const s of targets) {
  const attempts: Attempt[] = [];
  const result = await callInteractions(
    { model: MODEL, input: [{ type: 'text', text: prompt(s) }], response_format: { type: 'image', aspect_ratio: '3:4', image_size: '1K' } },
    { budget, attempts, maxRetries: 1 },
  );
  const img = result ? extractImage(result.json) : null;
  let file: string | undefined;
  if (img) {
    file = `${s.id}.${img.mimeType.includes('jpeg') ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(OUT, file), img.data);
  }
  ledger.push({ id: s.id, spec: s, prompt: prompt(s), model: MODEL, file: file ?? null, attempts, at: new Date().toISOString() });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  const usage = result?.attempt.usage as Record<string, unknown> | undefined;
  console.log(`${s.id}: ${file ? `保存 ${file}` : '失敗'}（試行${attempts.length}回${usage ? `・usage ${JSON.stringify(usage).slice(0, 160)}` : ''}）`);
}
console.log(`使ったリクエスト ${budget.used}/${budget.max}`);
