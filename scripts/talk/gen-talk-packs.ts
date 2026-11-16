// トークパックの生成（第3段階：人格テンプレ30種の相手のセリフ／第4段階：プレイヤー20人の答え）。2026-11-11
// 使い方：
//   GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-talk-packs.ts --kind npc [--ids P-F01,P-M02] [--force]
//   GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-talk-packs.ts --kind player [--ids M01] [--force]
// 出力：../トークパック/npc/<人格ID>.json・../トークパック/player/<人物ID>.json と、生成の記録 ../トークパック/生成記録.json
// キーは表示・保存しない（client.ts）。ゲーム本体は生成済みのJSONだけを使う（build-talk-data.ts で取り込む）。
import fs from 'node:fs';
import path from 'node:path';
import { callInteractions, extractText, RequestBudget, type Attempt } from '../gemini/client';
import { ASK_SLOTS, DIG_SLOTS, TOPICS } from '../../src/engine/data/talkSlots';
import { CHARACTERS } from '../../src/engine/data/characters';
import { AREAS } from '../../src/engine/data/areas';
import { HOBBIES } from '../../src/engine/data/npcPool';
import { normalizePack, validateNpcPack, validatePlayerPack } from './validate';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'トークパック');
const PERSONA_DIR = path.join(ROOT, '人格テンプレ');
const MODEL = process.env.GEMINI_TALK_MODEL || 'gemini-4-argon';

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const kind = arg('kind', 'npc') as 'npc' | 'player';
const force = process.argv.includes('--force');
const only = arg('ids').split(',').filter(Boolean);

const str = { type: 'string' };
const arr = (n: number, items: unknown = str) => ({ type: 'array', items, minItems: n, maxItems: n });
const byTopic = (v: unknown) => ({ type: 'object', properties: Object.fromEntries(TOPICS.map((t) => [t, v])), required: [...TOPICS] });

const slotList = () => TOPICS.map((t) => [
  `- ${t}`,
  `  - ask[0]：${ASK_SLOTS[t][0].meaning}（例「${ASK_SLOTS[t][0].example}」）`,
  `  - ask[1]：${ASK_SLOTS[t][1].meaning}（例「${ASK_SLOTS[t][1].example}」）`,
  `  - dig[0]：${DIG_SLOTS[t][0].meaning}（例「${DIG_SLOTS[t][0].example}」）`,
  `  - dig[1]：${DIG_SLOTS[t][1].meaning}（例「${DIG_SLOTS[t][1].example}」）`,
].join('\n')).join('\n');

const COMMON_RULES = `
# 共通の決まり（必ず守る）
- 舞台は首都圏のマッチングアプリ（アプリ内トーク）。マッチして間もない、まだ会っていない2人のやり取り。
- 1つの項目は、そのまま送るメッセージ。1〜2文（多くても3文）。1文は40字くらいまで。実際のトークで打つ話し言葉で、小説調・説明調にしない。
- ゲームは文末（。！？…笑）で吹き出しを分ける。1文の途中に改行や空白を入れない。
- 敬語（です・ます）が基本。人によっては軽く崩してよい（「〜ですよね笑」「〜かも」）。
- 差し込みは {名前} の形だけ。使ってよい差し込みは項目ごとに書いたものだけ。差し込みは名詞なので、「{hobby}が好き」「{hobby}の日」「{hobby}とか」のように「が・の・は・も・とか・って」で受ける。「{hobby}に行く」「{hobby}をする」のように動詞を付けない（料理・読書・映画などで文が崩れるため）。
- 相手の名前は {name} だけ（「{name}さん」）。架空の固有名詞（店名・人名）は出さない。
- 反応の文に「それ」「そこ」「あれ」「その〜」などの指示語を使わない（何を指すか分からなくなるため）。
- 下ネタ・個人情報（最寄り駅・勤務先の名前）・年収の数字は書かない。
- 顔文字を使うなら、空白を含まない短いものだけ。「{hobby}をして」「{hobby}や{hobby2}をして」は書かない（「{hobby}の日」「{hobby}とか」「{hobby}を楽しんで」のように書く）。
`;

function npcPrompt(persona: Record<string, unknown>): string {
  const meta = persona.persona_meta as Record<string, unknown>;
  const pick = (k: string) => JSON.stringify((persona as Record<string, unknown>)[k] ?? null, null, 1);
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。マッチングアプリの相手（NPC）の「人格テンプレ」に合わせて、トークのセリフ集（トークパック）をJSONで作ってください。

# この人格テンプレ
- ID：${meta.persona_id}／${meta.label}／${meta.gender === 'F' ? '女性' : '男性'}／年齢帯 ${JSON.stringify(meta.age_band)}
- 対応タイプ：${meta.response_type}（sync＝相手との相性で温度が変わる／passive＝受け身で自分から質問しにくい／polite＝誰にでも丁寧／salty＝そっけない／moody＝気分で波がある）
- 話し方の要約：${JSON.stringify(meta.style_digest)}
- 会話のスタイル：${pick('conversation_style')}
- 話し方の例：${pick('dialogue_examples')}

この人格は、名前・職業・住まい・趣味が違う多くのNPCに割り当てられます。そのため、NPC本人の材料は次の差し込みで書きます：{hobby}（趣味1）{hobby2}（趣味2）{food}（好きな食べ物）{area}（住んでいる地域名）{place}（行ってよかった旅行先）{job}（職業名）{months}（アプリ歴の月数。数字だけ）。
人格テンプレにある具体的な趣味やエピソードは使わず、口調・性格・質問のしかた・絵文字の量だけをまねてください。

# 質問の型（番号の意味は固定。プレイヤーの答えはこの番号で引かれる）
${slotList()}

# 作るもの（キーとその中身）
- ask：話題ごとに2つ。ask[0]・ask[1] の意味の質問を、この人の言い回しで。プレイヤーの趣味などは知らない前提なので差し込みは使わない（hobby の質問だけ「プロフィールの趣味」を {their_hobby} で書く）。
- answer：話題ごとに2つ。プレイヤーから ask[0]・ask[1] と同じことを聞かれたときの、この人自身の答え。差し込み {hobby} {hobby2} {food} {area} {place} {job} {months} を使ってよい。area の answer[1]（地元）は「地元は関東じゃないんです」「地元もこのへんです」のように差し込みなしで。
- detail：話題ごとに2つ。プレイヤーから dig[0]・dig[1] を聞かれたときの、この人自身の答え（深掘りへの答え。answer より少し具体的に）。差し込みは answer と同じ。
- react：話題ごとに2つ。プレイヤーがその話題の質問に答えてくれた後の、受け止めの一言（話題に沿うが、プレイヤーの答えの中身には触れない）。差し込みなし。
- react_shared：3つ。プレイヤーとこの人の趣味 {hobby} が同じだと分かったときの、話を合わせる一言（「え、{hobby}好きなんですか！」のような）。
- curt_one：5つ。そっけない一言（「そうなんですね」「へー」など。2〜8字。質問しない）。
- curt_short：話題ごとに1つ。ask[0] を聞かれたときの、短くそっけない答え（10〜20字。聞き返さない）。差し込み可。
- disclose：3つ。乗り気なときに自分から話す、{hobby} についての自己開示（1〜2文）。
- match：3つ。相手との相性が良くて前のめりなときの、話を合わせる・好意がにじむ一言。
- aizuchi_back：2つ。こちらの質問に相手が相槌しか返さなかったときの、少し気まずい一言（「あ、はい笑」のような。質問しない）。
- profile_change：2つ。プレイヤーがこの人のプロフィールの趣味 {hobby} について聞いてくれたときの、うれしさの一言（例「覚えててくれたんですね！」。答えは別に付くので答えない）。
- warm：3つ。好意的なときに付け足す気づかい・好意の一言（「話しやすいですね笑」など）。
- invite_accept：3つ。「会ってみたい」と誘われて承諾する返事（日にちの相談に入る前の一言）。
- invite_busy：3つ。誘いを「予定が合わない」で断る返事（別の日を出さない。実際によくある言い方。「もう少し仲良くなってから」「先に電話」は使わない）。
${COMMON_RULES}
- 対応タイプが salty の人も、ask・answer・detail・react はふつうに書く（そっけなさはゲームが curt_one・curt_short で出す）。passive の人は ask を控えめな聞き方に。

JSONだけを出力してください。`;
}

function npcSchema() {
  return {
    type: 'object',
    properties: {
      ask: byTopic(arr(2)), answer: byTopic(arr(2)), detail: byTopic(arr(2)), react: byTopic(arr(2)),
      react_shared: arr(3), curt_one: arr(5), curt_short: byTopic(str), disclose: arr(3), match: arr(3),
      aizuchi_back: arr(2), profile_change: arr(2), warm: arr(3), invite_accept: arr(3), invite_busy: arr(3),
    },
    required: ['ask', 'answer', 'detail', 'react', 'react_shared', 'curt_one', 'curt_short', 'disclose', 'match', 'aizuchi_back', 'profile_change', 'warm', 'invite_accept', 'invite_busy'],
  };
}

function playerPrompt(id: string): string {
  const ch = CHARACTERS.find((c) => c.id === id)!;
  const area = AREAS.find((a) => a.id === ch.areaId);
  const facts = {
    名前: ch.name, 性別: ch.gender === 'M' ? '男性' : '女性', 年齢: ch.age, 職業: ch.job, 学歴: ch.education, 年収万円: Math.round(ch.incomeYen / 10000), 身長: ch.heightCm,
    住まい: `${area?.pref ?? ''}${area?.name ?? ''}`, 休日: ch.holiday, 子ども: ch.children, 結婚歴: ch.marital, お酒: ch.drinking, たばこ: ch.smoking,
    アプリ歴か月: ch.appHistoryMonths, 恋愛経験: ch.datingExperience, 生活: ch.lifeNote, ひとこと: ch.tagline, 制約: ch.constraints, プロローグ: ch.prologue ?? [],
  };
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。プレイヤーが操作する人物が、マッチングアプリのトークで送るメッセージ（回答パック）をJSONで作ってください。プレイヤーはこの中から選んで送ります。

# この人物（設定と矛盾しないこと）
${JSON.stringify(facts, null, 1)}

# 質問の型（番号の意味は固定。相手の質問はこの番号で来る）
${slotList()}

# 作るもの
- hobbies：この人の趣味を2つ、次の一覧から選ぶ（設定に合うもの）：${HOBBIES.join('、')}
- food：好きな食べ物（名詞1つ。例：焼肉・ラーメン・パスタ）
- place：行ってよかった旅行先（地名1つ）
- hometown：地元（都道府県名か「このへん」）
- intro：2つ。最初のメッセージで、挨拶のあとに添える自己紹介の1文（趣味を入れる。質問はしない。名前は名乗らない）。
- answer：話題ごと・質問の番号ごとに、答えを2通り（answer.hobby[0][0] と answer.hobby[0][1] のように）。1〜2文。聞き返しは付けない（ゲームが「{name}さんは？」を足す）。hobby の質問は相手の趣味についてなので、相手と同じ趣味の話ではなく「自分は〜が好き」と自分の趣味（hobbies）の話で答える。仕事・休日・アプリ歴は設定どおりに（忙しい人は忙しいと答える。年収の数字は書かない）。
- self_talk：話題ごとに1つ。ask[0] への答えを、つい長く語ってしまった版（3文）。
- dodge：話題ごとに1つ。ask[0] を聞かれて、はぐらかす返事（「まあいろいろですね笑」のような。1文）。
- ask：話題ごとに2つ。この人が相手に ask[0]・ask[1] の質問をするときの言い回し（hobby は相手の趣味を {their_hobby} で）。
- dig：話題ごとに2つ。相手の話に dig[0]・dig[1] で深掘りするときの言い回し。差し込みは {their_hobby} {their_food} {their_area} {their_place} のうち、意味に出てくるものだけ。
- aizuchi：4つ。相槌だけの返事（「そうなんですね！」など）。
- ask_back：3つ。答えのあとに付ける聞き返し（「{name}さんは？」「{name}さんはどうですか？」など）。
${COMMON_RULES}
- この人の性格・事情（プロローグ・生活）がにじむ書き方にする。ただし重い打ち明け話はしない（マッチして間もない相手なので）。

JSONだけを出力してください。`;
}

function playerSchema() {
  return {
    type: 'object',
    properties: {
      hobbies: arr(2, { type: 'string', enum: HOBBIES }), food: str, place: str, hometown: str, intro: arr(2),
      answer: byTopic(arr(2, arr(2))), self_talk: byTopic(str), dodge: byTopic(str), ask: byTopic(arr(2)), dig: byTopic(arr(2)),
      aizuchi: arr(4), ask_back: arr(3),
    },
    required: ['hobbies', 'food', 'place', 'hometown', 'intro', 'answer', 'self_talk', 'dodge', 'ask', 'dig', 'aizuchi', 'ask_back'],
  };
}

async function genOne(id: string, prompt: string, schema: unknown, budget: RequestBudget, log: Record<string, unknown>[]): Promise<void> {
  const file = path.join(OUT, kind, `${id}.json`);
  if (fs.existsSync(file) && !force) { console.log(`skip ${id}（生成済み）`); return; }
  let feedback = '';
  for (let round = 1; round <= 3; round++) {
    const attempts: Attempt[] = [];
    const res = await callInteractions({ model: MODEL, input: [{ type: 'text', text: prompt + feedback }], response_format: { type: 'text', mime_type: 'application/json', schema } }, { budget, attempts, timeoutMs: 300_000 });
    if (!res) { log.push({ id, round, ok: false, attempts }); console.log(`NG ${id}（${round}回目）: 通信失敗 ${attempts.map((a) => a.outcome + (a.httpStatus ?? '')).join(',')}`); continue; }
    let data: Record<string, unknown>;
    try { data = normalizePack(JSON.parse(extractText(res.json))); } catch { log.push({ id, round, ok: false, reason: 'JSONでない' }); console.log(`NG ${id}（${round}回目）: JSONでない`); continue; }
    const v = kind === 'npc' ? validateNpcPack(data) : validatePlayerPack(data);
    log.push({ id, round, ok: v.errors.length === 0, errors: v.errors, warnings: v.warnings, usage: res.attempt.usage });
    if (v.errors.length > 0 && round < 3) {
      console.log(`NG ${id}（${round}回目）: ${v.errors.slice(0, 3).join(' / ')}`);
      feedback = `\n\n# 前回の出力で直すところ（同じ間違いをしない）\n${v.errors.slice(0, 15).map((e) => `- ${e}`).join('\n')}`;
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schema_version: 'talk-1.0', id, kind, model: MODEL, createdAt: new Date().toISOString(), ...data }, null, 1), 'utf8');
    console.log(`${v.errors.length ? 'NG（保存）' : 'OK'} ${id}（${round}回目）${v.errors.length ? ': ' + v.errors.slice(0, 3).join(' / ') : ''}${v.warnings.length ? ` 注意${v.warnings.length}件` : ''}`);
    return;
  }
}

async function main(): Promise<void> {
  const budget = new RequestBudget(Number(arg('max', '120')));
  const log: Record<string, unknown>[] = [];
  const ids = kind === 'npc'
    ? fs.readdirSync(PERSONA_DIR).filter((f) => /^P-[FM]\d\d\.json$/.test(f)).map((f) => f.replace('.json', ''))
    : CHARACTERS.map((c) => c.id);
  const targets = only.length ? ids.filter((x) => only.includes(x)) : ids;
  const conc = Number(arg('concurrency', '4'));
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < targets.length) {
      const id = targets[next++];
      const prompt = kind === 'npc' ? npcPrompt(JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, `${id}.json`), 'utf8'))) : playerPrompt(id);
      await genOne(id, prompt, kind === 'npc' ? npcSchema() : playerSchema(), budget, log);
    }
  }));
  const recFile = path.join(OUT, '生成記録.json');
  const prev = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : [];
  fs.writeFileSync(recFile, JSON.stringify([...prev, { at: new Date().toISOString(), kind, model: MODEL, requests: budget.used, results: log }], null, 1), 'utf8');
  console.log(`リクエスト ${budget.used} 回`);
}

void main();
