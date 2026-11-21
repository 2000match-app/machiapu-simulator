// デート中の具体的なセリフの生成（2026-11-19 指示：「元カレの話が止まらない」のような説明ではなく、「」の会話を入れる）
// 使い方：
//   GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-date-lines.ts [--jobs hobbyF,hobbyM,misc] [--force]
// 出力：../トークパック/date/<job>.json と、ゲームに取り込む src/engine/data/dateLines.ts
// キーは表示・保存しない（client.ts）。ゲーム本体は生成済みのデータだけを使う。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, RequestBudget, type Attempt } from '../gemini/client';
import { HOBBIES } from '../../src/engine/data/npcPool';
import { FEMALE_PHOTOS, MALE_PHOTOS } from '../../src/engine/data/npcPhotos';

/** 写真の相手の趣味（30種の一覧にないもの）で、2人以上が持っているもの。相手の9割以上をカバーする（2026-11-19） */
function extraHobbies(g: 'F' | 'M'): string[] {
  const m = new Map<string, number>();
  for (const p of g === 'F' ? FEMALE_PHOTOS : MALE_PHOTOS) for (const h of (p as { hobbies?: string[] }).hobbies ?? []) m.set(h, (m.get(h) ?? 0) + 1);
  return [...m].filter(([h, n]) => n >= 2 && !HOBBIES.includes(h)).map(([h]) => h).sort();
}
const BATCH = 40;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'トークパック', 'date');
const TS_OUT = path.resolve(HERE, '../../src/engine/data/dateLines.ts');
const MODEL = process.env.GEMINI_TALK_MODEL || 'gemini-4-argon';

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const force = process.argv.includes('--force');
const extraJobs = (['F', 'M'] as const).flatMap((g) => {
  const n = Math.ceil(extraHobbies(g).length / BATCH);
  return Array.from({ length: n }, (_, i) => `extra${g}${i + 1}`);
});
const jobs = arg('jobs', ['hobbyF', 'hobbyM', 'misc', 'oshi', ...extraJobs].join(',')).split(',').filter(Boolean);

const str = { type: 'string' };
const arr = (n: number, items: unknown = str) => ({ type: 'array', items, minItems: n, maxItems: n });
const obj = (props: Record<string, unknown>) => ({ type: 'object', properties: props, required: Object.keys(props) });

const RULES = `
# 共通の決まり（必ず守る）
- 舞台は首都圏。マッチングアプリで知り合った2人が、カフェや居酒屋・レストランで向かい合って話している（1〜3回目のデート）。
- 1つの項目は、相手がその場で口にするセリフ1つ。2〜3文、全体で40〜90字くらい。話し言葉で、小説調・説明調にしない。
- 「」は付けない（ゲームが吹き出しにする）。改行しない。
- 具体的に書く：いつ・どこで・何を・どうだったかが分かる細部を1つ以上入れる（例：「この前、元カレに連れて行ってもらったお寿司屋さんが本当においしくて、大将が目の前で炙ってくれるんですよ」）。抽象的なまとめ（「楽しいです」「いろいろあって」）だけにしない。
- 地名（渋谷・横浜・箱根など実在の地名）は使ってよい。店名・人名・商品名などの固有名詞は出さない（「駅前のカフェ」「会社の先輩」のように書く）。
- 基本は丁寧語（です・ます）が少し崩れた、初対面に近い距離感。「〜なんですよ」「〜で笑」など。指定があるときはタメ口。
- 同じ言い回し・同じ話の筋を繰り返さない。項目ごとに場面を変える。
- 相手の名前やあなたへの呼びかけ（「〇〇さん」）は入れない。
`;

function hobbyPrompt(g: 'F' | 'M', list: string[] = HOBBIES, counts = { chat: 3, brag: 2 }): string {
  const who = g === 'F' ? '女性（20〜40代）' : '男性（20〜40代）';
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。デート中に${who}が話す、趣味についての具体的なセリフをJSONで作ってください。

# 趣味の一覧（すべてについて書く。キーは一覧の文字のまま）
${list.join('、')}

# 書くもの（趣味ごと）
- chat：最近ハマっている、その趣味の話を楽しそうにする（${counts.chat}つ。ふつうの好感の持てる話）
- brag：その趣味の自慢話。自分の話ばかりで、聞いている側が少し退屈になるような、得意げで長い話（${counts.brag}つ。「〇〇も知らないんですか？」のような上から目線や、数字・道具・回数の自慢を入れる）
${RULES}`;
}

function miscPrompt(): string {
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。マッチングアプリのデート中に相手が口にする、具体的なセリフをJSONで作ってください。F は女性が話すセリフ、M は男性が話すセリフです。

# 書くもの
- work：仕事の愚痴を少しだけこぼす（F・M 各6つ。職種は特定しすぎない：会議、上司、残業、取引先、異動、締め切りなど）
- ex：デート中なのに元恋人の話をしてしまう（F は元カレ、M は元カノの話。各8つ）。思い出の店・旅行・プレゼント・別れた理由・今でも連絡が来る、など。聞いている側が「なんで今その話？」と引くような内容。例：「元カレに連れて行ってもらったお寿司屋さんがすごくおいしくて、また行きたいんですよね。あ、元カレとはもう連絡取ってないですよ笑」
- ex_more：元恋人の話がさらに続くときの、2言目のセリフ（F・M 各6つ。1言目を受けて自然につながる、どの1言目のあとでも使える内容）
- late：待ち合わせに5〜10分遅れてきたときの言い訳（F・M 各4つ。電車・道に迷った・仕事など）
- narrow：容姿に自信のない男性が、風俗・パチンコ・競馬・アニメ・ソシャゲの話ばかりする（M のみ8つ）。下品すぎない表現で、聞いている女性が引く内容。性的な描写は書かない（「この前行ったお店の子が〜」程度まで）。
- rude：初デートなのに会って5分でタメ口になり、なれなれしく下ネタまじりに話す男性（M のみ6つ。タメ口で書く。露骨な性的表現は書かず、「経験人数」「今日どんな下着？」程度まで）
- after：まだ2杯目なのに、この後の予定ばかり聞いてくる男性（M のみ5つ。タメ口まじり。「この後どうする？」の言い換え。ホテルや家に誘う含みを持たせる）
- polite：最後まで敬語で、相手の話を丁寧に聞いてくれる誠実な男性のセリフ（M のみ5つ。相手の話を受けて質問を返す）
- phone：デート中ずっとスマホを気にしている相手の、言い訳のひと言（F・M 各4つ。短くてよい）
${RULES}`;
}

/** 女性NPCの推し活の話が止まらない（2026-11-21 指示） */
function oshiPrompt(): string {
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。マッチングアプリの初デートで、女性が「推し」（アイドル・俳優・Vtuber・2.5次元・K-POPなど）の話を止まらずに続けるセリフをJSONで作ってください。

# 書くもの
- oshi：推しの話を始める1言目（8つ。推しのジャンルを散らす。ライブ遠征・グッズ・握手会・配信・ペンライト・同担拒否・アクスタ・缶バッジなど具体的に）
- oshi_more：さらに続く2言目（6つ。どの1言目のあとでも自然につながる。チケット代やグッズ代の金額、遠征の回数、推しの尊さを語る。聞いている側が置いていかれる内容）
- 推しの名前（実在・架空とも）・グループ名は出さない（「推し」「メンバー」「あの子」などで書く）。
${RULES}`;
}
function oshiSchema() {
  return obj({ oshi: obj({ F: arr(8) }), oshi_more: obj({ F: arr(6) }) });
}

function hobbySchema(list: string[] = HOBBIES, counts = { chat: 3, brag: 2 }) {
  return obj(Object.fromEntries(list.map((h) => [h, obj({ chat: arr(counts.chat), brag: arr(counts.brag) })])));
}
/** extraF2 → 女性の追加の趣味の2つ目の束 */
function extraOf(job: string): { g: 'F' | 'M'; list: string[] } | undefined {
  const m = /^extra([FM])(\d+)$/.exec(job);
  if (!m) return undefined;
  const g = m[1] as 'F' | 'M';
  const i = Number(m[2]) - 1;
  return { g, list: extraHobbies(g).slice(i * BATCH, (i + 1) * BATCH) };
}
const EXTRA_COUNTS = { chat: 2, brag: 1 };
function miscSchema() {
  const fm = (n: number) => obj({ F: arr(n), M: arr(n) });
  const m = (n: number) => obj({ M: arr(n) });
  return obj({ work: fm(6), ex: fm(8), ex_more: fm(6), late: fm(4), narrow: m(8), rude: m(6), after: m(5), polite: m(5), phone: fm(4) });
}

/** 生成結果の点検（「」や改行、長すぎる文） */
function check(data: unknown): string[] {
  const errors: string[] = [];
  const walk = (v: unknown, at: string) => {
    if (typeof v === 'string') {
      if (/[「」\n]/.test(v)) errors.push(`${at}：「」や改行がある`);
      if (v.length > 130) errors.push(`${at}：長すぎる（${v.length}字）`);
      if (v.length < 12) errors.push(`${at}：短すぎる（${v.length}字）`);
      if (/さん[、。！？]/.test(v) && /^[^。]{0,8}さん/.test(v)) errors.push(`${at}：呼びかけがある`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k);
  };
  walk(data, '');
  return errors;
}

async function genJob(job: string, budget: RequestBudget, log: Record<string, unknown>[]): Promise<void> {
  const file = path.join(OUT, `${job}.json`);
  if (fs.existsSync(file) && !force) { console.log(`skip ${job}（生成済み）`); return; }
  const ex = extraOf(job);
  const prompt = job === 'misc' ? miscPrompt() : job === 'oshi' ? oshiPrompt() : ex ? hobbyPrompt(ex.g, ex.list, EXTRA_COUNTS) : hobbyPrompt(job === 'hobbyF' ? 'F' : 'M');
  const schema = job === 'misc' ? miscSchema() : job === 'oshi' ? oshiSchema() : ex ? hobbySchema(ex.list, EXTRA_COUNTS) : hobbySchema();
  let feedback = '';
  for (let round = 1; round <= 3; round++) {
    const attempts: Attempt[] = [];
    const res = await callInteractions({ model: MODEL, input: [{ type: 'text', text: prompt + feedback }], response_format: { type: 'text', mime_type: 'application/json', schema } }, { budget, attempts, timeoutMs: 400_000 });
    if (!res) { log.push({ job, round, ok: false, attempts }); console.log(`NG ${job}（${round}回目）: 通信失敗 ${attempts.map((a) => a.outcome + (a.httpStatus ?? '')).join(',')}`); continue; }
    let data: unknown;
    try { data = JSON.parse(extractText(res.json)); } catch { log.push({ job, round, ok: false, reason: 'JSONでない' }); console.log(`NG ${job}（${round}回目）: JSONでない`); continue; }
    const errors = check(data);
    log.push({ job, round, ok: errors.length === 0, errors, usage: res.attempt.usage });
    if (errors.length > 0 && round < 3) {
      console.log(`NG ${job}（${round}回目）: ${errors.slice(0, 3).join(' / ')}`);
      feedback = `\n\n# 前回の出力で直すところ\n${errors.slice(0, 15).map((e) => `- ${e}`).join('\n')}`;
      continue;
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ job, model: MODEL, createdAt: new Date().toISOString(), data }, null, 1), 'utf8');
    console.log(`${errors.length ? 'NG（保存）' : 'OK'} ${job}（${round}回目）${errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''}`);
    return;
  }
}

/** 3つの生成結果を、ゲームが読む TypeScript にまとめる */
function writeTs(): void {
  const read = (job: string) => JSON.parse(fs.readFileSync(path.join(OUT, `${job}.json`), 'utf8')).data;
  const hf = read('hobbyF');
  const hm = read('hobbyM');
  const misc = read('misc');
  const oshiFile = path.join(OUT, 'oshi.json');
  const oshi = fs.existsSync(oshiFile) ? JSON.parse(fs.readFileSync(oshiFile, 'utf8')).data : { oshi: { F: [] }, oshi_more: { F: [] } };
  const hobby: Record<string, Record<string, unknown>> = {};
  for (const h of HOBBIES) hobby[h] = { F: hf[h], M: hm[h] };
  // 写真の相手の趣味（性別ごと）
  for (const job of extraJobs) {
    const file = path.join(OUT, `${job}.json`);
    if (!fs.existsSync(file)) continue;
    const g = extraOf(job)!.g;
    for (const [h, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).data as Record<string, unknown>)) (hobby[h] ??= {})[g] = v;
  }
  const body = `// デート中の具体的なセリフ（2026-11-19。Gemini ${MODEL} で生成。scripts/talk/gen-date-lines.ts が書き出す。手で直さない）
// hobby：趣味ごと・話す人の性別ごと（chat＝楽しそうな話／brag＝自慢話）。ほかは F＝女性が話す・M＝男性が話す
type FM = { F: string[]; M: string[] };
type MOnly = { M: string[] };
type FOnly = { F: string[] };
export const DATE_LINES: {
  hobby: Record<string, Partial<Record<'F' | 'M', { chat: string[]; brag: string[] }>>>;
  work: FM; ex: FM; ex_more: FM; late: FM; phone: FM;
  narrow: MOnly; rude: MOnly; after: MOnly; polite: MOnly;
  oshi: FOnly; oshi_more: FOnly;
} = ${JSON.stringify({ hobby, ...misc, ...oshi }, null, 1)};
`;
  fs.writeFileSync(TS_OUT, body, 'utf8');
  console.log(`書き出した：${path.relative(process.cwd(), TS_OUT)}`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--write-only')) { writeTs(); return; }
  const budget = new RequestBudget(Number(arg('max', '12')));
  const log: Record<string, unknown>[] = [];
  await Promise.all(jobs.map((j) => genJob(j, budget, log)));
  const recFile = path.join(OUT, '生成記録.json');
  const prev = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : [];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(recFile, JSON.stringify([...prev, { at: new Date().toISOString(), model: MODEL, requests: budget.used, results: log }], null, 1), 'utf8');
  console.log(`リクエスト ${budget.used} 回`);
  if (['hobbyF', 'hobbyM', 'misc'].every((j) => fs.existsSync(path.join(OUT, `${j}.json`)))) writeTs();
}

void main();
