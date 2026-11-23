// トークパック第2版の生成（2026-11-23 指示：トークに多様性を）。言い回しを複数・16話題・会話の自然さの部品。
// 使い方：
//   GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-talk-v2.ts --kind npc [--ids P-F01,P-M02] [--force]
//   GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-talk-v2.ts --kind player [--ids M01] [--force]
// 出力：../トークパック/v2/npc/<人格ID>.json・../トークパック/v2/player/<人物ID>.json（第1版は ../トークパック/npc などにそのまま残す）
// 1つのパックを3回に分けて作る：A（もとの8話題）・B（増やした8話題）・C（話題によらない一言など。プレイヤーは材料と一言）。
// キーは表示・保存しない（client.ts）。このあと review-talk-v2.ts（ChatGPT）で不自然な文を落とし、build-talk-data.ts で取り込む。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, RequestBudget, type Attempt } from '../gemini/client';
import { ALT_TOPICS, ASK_SLOTS, DIG_SLOTS, FACT_OF_TOPIC, NEW_TOPICS, TOPICS, type TopicId } from '../../src/engine/data/talkSlots';
import { CHARACTERS } from '../../src/engine/data/characters';
import { AREAS } from '../../src/engine/data/areas';
import { HOBBIES } from '../../src/engine/data/npcPool';
import { normalizePack, validateNpcPack, validatePlayerPack } from './validate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'トークパック', 'v2');
const V1 = path.join(ROOT, 'トークパック');
const PERSONA_DIR = path.join(ROOT, '人格テンプレ');
const MODEL = process.env.GEMINI_TALK_MODEL || 'gemini-4-argon';

const arg = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const kind = arg('kind', 'npc') as 'npc' | 'player';
const force = process.argv.includes('--force');
const only = arg('ids').split(',').filter(Boolean);

const GROUP_A = TOPICS.filter((t) => !NEW_TOPICS.includes(t));
const GROUP_B = NEW_TOPICS;

const str = { type: 'string' };
const arr = (n: number, items: unknown = str) => ({ type: 'array', items, minItems: n, maxItems: n });
const byTopics = (ts: TopicId[], v: unknown) => ({ type: 'object', properties: Object.fromEntries(ts.map((t) => [t, v])), required: [...ts] });

/** 差し込みの値の例（どの値でも文が崩れないように、生成AIに見せる） */
const SLOT_EXAMPLES: Record<string, string> = {
  hobby: '映画・料理・カフェ巡り・筋トレ・サウナ', hobby2: '読書・ドライブ・温泉', food: '焼肉・ラーメン・パスタ', area: '世田谷区・川口市・船橋市', place: '京都・沖縄・台湾',
  job: '会社員・看護師・エンジニア', months: '1〜8の数字', hometown: '東京都・北海道・大阪府', sibling: '一人っ子・姉が1人いる次女・妹が1人いる長男・三人兄弟の真ん中',
  pet: '犬・猫・うさぎ・ハムスター', drink: 'ビール・ハイボール・ワイン・日本酒', music: '邦ロック・K-POP・J-POP・洋楽・アイドル（音楽のジャンル）', show: '韓国ドラマ・洋画・アニメ・お笑い・海外ドラマ（映画・ドラマのジャンル）',
  sport: 'ジム・ランニング・ヨガ・テニス・ゴルフ', dish: 'カレー・パスタ・肉じゃが・唐揚げ', club: 'バスケ部・吹奏楽部・テニス部・美術部（帰宅部は入らない）', dateplace: '水族館・美術館・温泉・鎌倉・箱根',
};
const TOPIC_SLOTS: Partial<Record<TopicId, string[]>> = {
  hobby: ['hobby', 'hobby2'], food: ['food'], area: ['area', 'hometown'], travel: ['place'], work: ['job'], app: ['months'],
  family: ['sibling'], pet: ['pet'], drink: ['drink'], media: ['music', 'show'], sports: ['sport'], cooking: ['dish'], school: ['club'], date: ['dateplace'],
};
const ALT_NOTE: Partial<Record<TopicId, string>> = {
  family: '一人っ子の人。兄弟がいない前提で答える（{sibling} は使わない）',
  pet: 'ペットを飼っていない人。{pet} は「好きな動物」（犬・猫など）',
  drink: 'お酒を飲まない人。{drink} は「よく飲む飲み物」（お茶・コーヒー・ジュース）',
  sports: '運動をしていない人。{sport} は「見るのが好きなスポーツ」（野球・サッカー・バスケ）',
};

const slotList = (ts: TopicId[]) => ts.map((t) => [
  `- ${t}${TOPIC_SLOTS[t] ? `（この話題の差し込み：${TOPIC_SLOTS[t]!.map((k) => `{${k}}＝${SLOT_EXAMPLES[k]}`).join('／')}）` : ''}`,
  `  - ask[0]：${ASK_SLOTS[t][0].meaning}（例「${ASK_SLOTS[t][0].example}」）`,
  `  - ask[1]：${ASK_SLOTS[t][1].meaning}（例「${ASK_SLOTS[t][1].example}」）`,
  `  - dig[0]：${DIG_SLOTS[t][0].meaning}（例「${DIG_SLOTS[t][0].example}」）`,
  `  - dig[1]：${DIG_SLOTS[t][1].meaning}（例「${DIG_SLOTS[t][1].example}」）`,
].join('\n')).join('\n');

const COMMON_RULES = `
# 共通の決まり（必ず守る）
- 舞台は首都圏のマッチングアプリ（アプリ内トーク）。マッチして間もない、まだ会っていない2人のやり取り。
- 1つの項目は、そのまま送るメッセージ。1〜2文（多くても3文）。1文は40字くらいまで。実際のトークで打つ話し言葉で、小説調・説明調にしない。
- 同じ項目の中の言い回し（配列の要素）は、意味は同じでも、語順・言葉選び・長さ・テンションをはっきり変える。書き出しを同じ言葉にしない。
- ゲームは文末（。！？…笑）で吹き出しを分ける。1文の途中に改行や空白を入れない。
- 敬語（です・ます）が基本。人によっては軽く崩してよい（「〜ですよね笑」「〜かも」）。
- 差し込みは {名前} の形だけ。使ってよい差し込みは項目ごとに書いたものだけ。差し込みは名詞なので、「が・の・は・も・とか・って・派・です」で受ける。
  「{hobby}に行く」「{hobby}をする」「{sport}をする」「{dish}を作る」のように差し込みに動詞を直接付けない（値によって文が崩れるため）。差し込みの値の例を見て、どの値が入っても自然な文にする。
- 相手の名前は {name} だけ（「{name}さん」）。架空の固有名詞（店名・人名・作品名）は出さない。
- 受け止めの文に「それ」「そこ」「あれ」「その〜」などの指示語を使わない（何を指すか分からなくなるため）。
- 下ネタ・個人情報（最寄り駅・勤務先の名前）・年収の数字は書かない。かぎかっこ「」は使わない。
- 顔文字を使うなら、空白を含まない短いものだけ。
`;

// ───────── 相手（人格テンプレ）─────────
function personaHead(persona: Record<string, unknown>): string {
  const meta = persona.persona_meta as Record<string, unknown>;
  const pick = (k: string) => JSON.stringify((persona as Record<string, unknown>)[k] ?? null, null, 1);
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。マッチングアプリの相手（NPC）の「人格テンプレ」に合わせて、トークのセリフ集をJSONで作ってください。

# この人格テンプレ
- ID：${meta.persona_id}／${meta.label}／${meta.gender === 'F' ? '女性' : '男性'}／年齢帯 ${JSON.stringify(meta.age_band)}
- 対応タイプ：${meta.response_type}（sync＝相手との相性で温度が変わる／passive＝受け身で自分から質問しにくい／polite＝誰にでも丁寧／salty＝そっけない／moody＝気分で波がある）
- 話し方の要約：${JSON.stringify(meta.style_digest)}
- 会話のスタイル：${pick('conversation_style')}
- 話し方の例：${pick('dialogue_examples')}

この人格は、名前・職業・住まい・趣味などが違う多くのNPCに割り当てられます。NPC本人の材料は差し込みで書きます（話題ごとに書いた差し込みだけ使う）。
人格テンプレにある具体的な趣味やエピソードは使わず、口調・性格・質問のしかた・絵文字の量だけをまねてください。
`;
}

function npcTopicPrompt(persona: Record<string, unknown>, ts: TopicId[]): string {
  const alts = ts.filter((t) => ALT_TOPICS.includes(t));
  const facts = ts.filter((t) => FACT_OF_TOPIC[t]);
  return `${personaHead(persona)}
# 話題と質問の型（番号の意味は固定）
${slotList(ts)}

# 作るもの（話題ごと。キーとその中身）
- ask：ask[0]・ask[1] の意味の質問を、それぞれ4通りの言い回しで（ask.t[0] は4つの配列）。プレイヤーのことは知らない前提なので差し込みは使わない（hobby の質問だけ「プロフィールの趣味」を {their_hobby} で）。{name} は使ってよい。
- answer：プレイヤーから ask[0]・ask[1] と同じことを聞かれたときの、この人自身の答え。それぞれ3通り。その話題の差し込みを使ってよい。
- detail：プレイヤーから dig[0]・dig[1] を聞かれたときの、この人自身の答え（answer より少し具体的に）。それぞれ3通り。
${alts.length ? `- answer_alt・detail_alt（${alts.join('・')} だけ）：answer・detail と同じ質問への、次の事情の人の答え。それぞれ3通り。\n${alts.map((t) => `  - ${t}：${ALT_NOTE[t]}`).join('\n')}\n` : ''}- react：4つ。プレイヤーがその話題の質問に答えてくれた後の、受け止めの一言（話題に沿うが、プレイヤーの答えの中身には触れない）。差し込みなし（{name} は可）。
${facts.length ? `- react_fact（${facts.join('・')} だけ）：3つ。プレイヤーの答えの中身に触れる受け止めの一言。必ず次の差し込みを1回使う：${facts.map((t) => `${t}＝{${FACT_OF_TOPIC[t]}}`).join('、')}（値の例は話題の差し込みと同じ。work の {their_job} は職業名、media の {their_music} は音楽のジャンル）。例「{their_food}いいですね！私も好きです」。\n` : ''}- curt_short：2つ。ask[0] を聞かれたときの、短くそっけない答え（10〜20字。聞き返さない）。差し込み可。
${COMMON_RULES}
- 対応タイプが salty の人も、ask・answer・detail・react はふつうに書く（そっけなさはゲームが curt_short で出す）。passive の人は ask を控えめな聞き方に。
- 質問（ask）は最後の文を質問にして「？」で終える（質問のあとに「ぜひ聞きたいです」などの文を足さない）。answer・detail・react は質問で終わらない。

JSONだけを出力してください。`;
}
function npcTopicSchema(ts: TopicId[]) {
  const alts = ts.filter((t) => ALT_TOPICS.includes(t));
  const facts = ts.filter((t) => FACT_OF_TOPIC[t]);
  const props: Record<string, unknown> = {
    ask: byTopics(ts, arr(2, arr(4))), answer: byTopics(ts, arr(2, arr(3))), detail: byTopics(ts, arr(2, arr(3))),
    react: byTopics(ts, arr(4)), curt_short: byTopics(ts, arr(2)),
  };
  if (alts.length) { props.answer_alt = byTopics(alts, arr(2, arr(3))); props.detail_alt = byTopics(alts, arr(2, arr(3))); }
  if (facts.length) props.react_fact = byTopics(facts, arr(3));
  return { type: 'object', properties: props, required: Object.keys(props) };
}

function npcFlatPrompt(persona: Record<string, unknown>): string {
  return `${personaHead(persona)}
# 作るもの（話題によらない一言。キーとその中身）
- react_shared：5つ。プレイヤーとこの人の趣味 {hobby} が同じだと分かったときの、話を合わせる一言（例「え、{hobby}好きなんですか！」）。
- curt_one：8つ。そっけない一言（「そうなんですね」「へー」など。2〜8字。質問しない）。
- disclose：5つ。乗り気なときに自分から話す、{hobby} についての自己開示（1〜2文）。
- match：5つ。相手との相性が良くて前のめりなときの、話を合わせる・好意がにじむ一言。
- aizuchi_back：3つ。こちらの質問に相手が相槌しか返さなかったときの、少し気まずい一言（「あ、はい笑」のような。質問しない）。
- profile_change：3つ。プレイヤーがこの人のプロフィールの趣味 {hobby} について聞いてくれたときの、うれしさの一言（答えは別に付くので答えない）。
- warm：5つ。好意的なときに付け足す気づかい・好意の一言（「話しやすいですね笑」など）。{name} 可。
- invite_accept：5つ。「会ってみたい」と誘われて承諾する返事（日にちの相談に入る前の一言）。カフェの誘いにも食事の誘いにも合うよう、店の種類・飲食物には触れない。
- invite_busy：4つ。誘いを「予定が合わない」で断る返事（別の日を出さない。「もう少し仲良くなってから」「先に電話」は使わない）。
- bridge：6つ。話題を変えるときの前置き（「そういえば、」「ちなみに、」「話変わるんですけど、」など。後ろに質問が続くので、前置きだけで終える。読点「、」で終えてよい。質問しない）。
- late_sorry：4つ。返信が2日以上あいたときの、軽いお詫びの一言（「返信遅くなってすみません！」など。言い訳は短く。質問しない）。
差し込み：react_shared・disclose・profile_change は {hobby}（値の例：${SLOT_EXAMPLES.hobby}）、ほかは {name} だけ。
${COMMON_RULES}
JSONだけを出力してください。`;
}
function npcFlatSchema() {
  const props: Record<string, unknown> = {
    react_shared: arr(5), curt_one: arr(8), disclose: arr(5), match: arr(5), aizuchi_back: arr(3), profile_change: arr(3),
    warm: arr(5), invite_accept: arr(5), invite_busy: arr(4), bridge: arr(6), late_sorry: arr(4),
  };
  return { type: 'object', properties: props, required: Object.keys(props) };
}

// ───────── プレイヤー（人物20人）─────────
function playerFactsOf(id: string): Record<string, unknown> {
  const ch = CHARACTERS.find((c) => c.id === id)!;
  const area = AREAS.find((a) => a.id === ch.areaId);
  return {
    名前: ch.name, 性別: ch.gender === 'M' ? '男性' : '女性', 年齢: ch.age, 職業: ch.job, 学歴: ch.education, 年収万円: Math.round(ch.incomeYen / 10000), 身長: ch.heightCm,
    住まい: `${area?.pref ?? ''}${area?.name ?? ''}`, 休日: ch.holiday, 子ども: ch.children, 結婚歴: ch.marital, お酒: ch.drinking, たばこ: ch.smoking,
    アプリ歴か月: ch.appHistoryMonths, 恋愛経験: ch.datingExperience, 生活: ch.lifeNote, ひとこと: ch.tagline, 制約: ch.constraints, プロローグ: ch.prologue ?? [],
  };
}
function playerHead(id: string, materials?: Record<string, unknown>): string {
  return `あなたは恋愛シミュレーションゲームのシナリオライターです。プレイヤーが操作する人物が、マッチングアプリのトークで送るメッセージ（回答パック）をJSONで作ってください。プレイヤーはこの中から選んで送ります。

# この人物（設定と矛盾しないこと）
${JSON.stringify(playerFactsOf(id), null, 1)}
${materials ? `\n# この人物の話の材料（すでに決めたもの。答えはこれに合わせる）\n${JSON.stringify(materials, null, 1)}\n` : ''}`;
}
function playerFactsPrompt(id: string, prev?: Record<string, unknown>): string {
  return `${playerHead(id)}
${prev ? `# 以前の版で決めた材料（なるべく引き継ぐ）\n${JSON.stringify(prev, null, 1)}\n` : ''}
# 作るもの
- hobbies：趣味を2つ、次の一覧から選ぶ（設定に合うもの）：${HOBBIES.join('、')}
- food：好きな食べ物（名詞1つ）／place：行ってよかった旅行先（地名1つ）／hometown：地元（都道府県名か「このへん」）
- sibling：兄弟構成（「一人っ子」「姉が1人いる長男」のような名詞句。性別に合わせる）
- pet：好きな動物（「犬」「猫」など。飼っているかは答えの文で書く）
- drink：好きなお酒（お酒を飲まない設定なら「お茶」「コーヒー」など飲み物）
- music：よく聴く音楽のジャンル（「邦ロック」「K-POP」など）／show：よく見る映画・ドラマのジャンル（「韓国ドラマ」「洋画」など）
- sport：している運動（していなければ見るのが好きなスポーツ。「ジム」「野球」など）
- dish：得意料理（名詞1つ）／club：学生時代の部活（「バスケ部」「吹奏楽部」など。帰宅部にはしない）／dateplace：行ってみたい場所（「水族館」「鎌倉」など）
- intro：4つ。最初のメッセージで、挨拶のあとに添える自己紹介の1文（趣味を入れる。質問はしない。名前は名乗らない）。
- aizuchi：8つ。相槌だけの返事（「そうなんですね！」など。言い回しを変える）。
- ask_back：5つ。答えのあとに付ける聞き返し（「{name}さんは？」「{name}さんはどうですか？」など）。必ず {name} を入れる。
- bridge：4つ。自分から話題を変えるときの前置き（「そういえば、」など。後ろに質問が続くので前置きだけ。質問しない）。
${COMMON_RULES}
- 材料（food・sibling など）は名詞1つ・14字まで。
JSONだけを出力してください。`;
}
function playerFactsSchema() {
  const props: Record<string, unknown> = {
    hobbies: arr(2, { type: 'string', enum: HOBBIES }), food: str, place: str, hometown: str, sibling: str, pet: str, drink: str, music: str, show: str, sport: str, dish: str, club: str, dateplace: str,
    intro: arr(4), aizuchi: arr(8), ask_back: arr(5), bridge: arr(4),
  };
  return { type: 'object', properties: props, required: Object.keys(props) };
}
function playerTopicPrompt(id: string, materials: Record<string, unknown>, ts: TopicId[]): string {
  const their = ts.map((t) => `${t}：${FACT_OF_TOPIC[t] ? `{${FACT_OF_TOPIC[t]}}` : 'なし'}`).join('、');
  return `${playerHead(id, materials)}
# 話題と質問の型（番号の意味は固定。相手の質問はこの番号で来る）
${slotList(ts)}

# 作るもの（話題ごと）
- answer：相手から ask[0]・ask[1] を聞かれたときの答えを、それぞれ4通り（answer.t[0] は4つの配列）。長め（2文）と短め（1文）を混ぜる。聞き返しは付けない（ゲームが「{name}さんは？」を足す）。hobby の質問は相手の趣味についてなので、自分の趣味（材料の hobbies）の話で答える。仕事・休日・アプリ歴・お酒・兄弟などは設定と材料のとおりに（年収の数字は書かない）。差し込みは使わない。
- self_talk：2つ。ask[0] への答えを、つい長く語ってしまった版（3文）。
- dodge：2つ。ask[0] を聞かれて、はぐらかす返事（「まあいろいろですね笑」のような。1文）。
- ask：この人が相手に ask[0]・ask[1] の質問をするときの言い回しを、それぞれ3通り。hobby は相手の趣味を {their_hobby} で。ほかは差し込みなし（{name} は可）。
- dig：相手の話に dig[0]・dig[1] で深掘りするときの言い回しを、それぞれ3通り。使ってよい差し込みは、意味に出てくる相手の材料だけ（${their}）。値の例：{their_hobby}＝${SLOT_EXAMPLES.hobby}、{their_food}＝${SLOT_EXAMPLES.food}、{their_area}＝${SLOT_EXAMPLES.area}、{their_place}＝${SLOT_EXAMPLES.place}、{their_drink}＝${SLOT_EXAMPLES.drink}、{their_music}＝${SLOT_EXAMPLES.music}、{their_show}＝${SLOT_EXAMPLES.show}、{their_sport}＝${SLOT_EXAMPLES.sport}、{their_dish}＝${SLOT_EXAMPLES.dish}、{their_club}＝${SLOT_EXAMPLES.club}、{their_dateplace}＝${SLOT_EXAMPLES.dateplace}。
${COMMON_RULES}
- この人の性格・事情（プロローグ・生活）がにじむ書き方にする。ただし重い打ち明け話はしない（マッチして間もない相手なので）。
JSONだけを出力してください。`;
}
function playerTopicSchema(ts: TopicId[]) {
  const props: Record<string, unknown> = {
    answer: byTopics(ts, arr(2, arr(4))), self_talk: byTopics(ts, arr(2)), dodge: byTopics(ts, arr(2)), ask: byTopics(ts, arr(2, arr(3))), dig: byTopics(ts, arr(2, arr(3))),
  };
  return { type: 'object', properties: props, required: Object.keys(props) };
}

// ───────── 生成の流れ ─────────
type Part = 'A' | 'B' | 'C';
/** 検証エラーが、どの部分（A・B・C）のものか */
function partOf(err: string): Part {
  const m = err.match(/^([a-z_]+)(?:\.([a-z]+))?/);
  if (!m) return 'C';
  const topic = m[2] as TopicId | undefined;
  if (topic && GROUP_A.includes(topic)) return 'A';
  if (topic && GROUP_B.includes(topic)) return 'B';
  return 'C';
}

async function call(prompt: string, schema: unknown, budget: RequestBudget, log: Record<string, unknown>[], tag: string): Promise<Record<string, unknown> | null> {
  const attempts: Attempt[] = [];
  const res = await callInteractions({ model: MODEL, input: [{ type: 'text', text: prompt }], response_format: { type: 'text', mime_type: 'application/json', schema } }, { budget, attempts, timeoutMs: 600_000 });
  if (!res) { log.push({ tag, ok: false, attempts }); console.log(`NG ${tag}: 通信失敗 ${attempts.map((a) => a.outcome + (a.httpStatus ?? '')).join(',')}`); return null; }
  try {
    const data = normalizePack(JSON.parse(extractText(res.json))) as Record<string, unknown>;
    log.push({ tag, ok: true, usage: res.attempt.usage });
    return data;
  } catch {
    log.push({ tag, ok: false, reason: 'JSONでない' });
    console.log(`NG ${tag}: JSONでない`);
    return null;
  }
}

/** エラーの文（「…」の中）と同じ言い回しを、ほかの言い回しが残る配列から落とす。落とした数を返す */
function dropBad(pack: Record<string, unknown>, errors: string[]): number {
  const bad = new Set(errors.map((e) => e.match(/「(.*)」$/)?.[1]).filter((x): x is string => !!x));
  let n = 0;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string')) {
        const kept = (v as string[]).filter((x) => !bad.has(x));
        if (kept.length >= 1 && kept.length < v.length) { n += v.length - kept.length; return kept; }
        return v;
      }
      return v.map(walk);
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const k of Object.keys(pack)) pack[k] = walk(pack[k]);
  return n;
}

/** 2つの部分を合わせる（話題ごとの辞書は話題をまとめる） */
function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    if (prev && typeof prev === 'object' && !Array.isArray(prev) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(prev as object), ...(v as object) };
    else out[k] = v;
  }
  return out;
}

async function genOne(id: string, budget: RequestBudget, log: Record<string, unknown>[]): Promise<void> {
  const file = path.join(OUT, kind, `${id}.json`);
  if (fs.existsSync(file) && !force) { console.log(`skip ${id}（生成済み）`); return; }
  const persona = kind === 'npc' ? JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, `${id}.json`), 'utf8')) : null;
  const parts: Partial<Record<Part, Record<string, unknown>>> = {};
  let materials: Record<string, unknown> | undefined;
  const prompts = (p: Part, feedback: string): [string, unknown] => {
    if (kind === 'npc') {
      if (p === 'C') return [npcFlatPrompt(persona) + feedback, npcFlatSchema()];
      const ts = p === 'A' ? GROUP_A : GROUP_B;
      return [npcTopicPrompt(persona, ts) + feedback, npcTopicSchema(ts)];
    }
    if (p === 'C') {
      const v1File = path.join(V1, 'player', `${id}.json`);
      const prev = fs.existsSync(v1File) ? (({ hobbies, food, place, hometown }) => ({ hobbies, food, place, hometown }))(JSON.parse(fs.readFileSync(v1File, 'utf8'))) : undefined;
      return [playerFactsPrompt(id, prev) + feedback, playerFactsSchema()];
    }
    const ts = p === 'A' ? GROUP_A : GROUP_B;
    return [playerTopicPrompt(id, materials!, ts) + feedback, playerTopicSchema(ts)];
  };
  // プレイヤーは材料（C）を先に決めて、A・B に渡す
  const order: Part[] = kind === 'player' ? ['C', 'A', 'B'] : ['A', 'B', 'C'];
  const feedback: Partial<Record<Part, string>> = {};
  for (let round = 1; round <= 3; round++) {
    const todo = order.filter((p) => !parts[p]);
    if (kind === 'player' && todo.includes('C')) {
      const [pr, sc] = prompts('C', feedback.C ?? '');
      const got = await call(pr, sc, budget, log, `${id}/C/${round}`);
      if (got) parts.C = got;
      if (!parts.C) continue;
    }
    if (kind === 'player') materials = Object.fromEntries(['hobbies', 'food', 'place', 'hometown', 'sibling', 'pet', 'drink', 'music', 'show', 'sport', 'dish', 'club', 'dateplace'].map((k) => [k, parts.C![k]]));
    await Promise.all(todo.filter((p) => !(kind === 'player' && p === 'C')).map(async (p) => {
      const [pr, sc] = prompts(p, feedback[p] ?? '');
      const got = await call(pr, sc, budget, log, `${id}/${p}/${round}`);
      if (got) parts[p] = got;
    }));
    if (!parts.A || !parts.B || !parts.C) continue;
    const data = { schema_version: 'talk-2.0', ...merge(merge(parts.A, parts.B), parts.C) } as Record<string, unknown>;
    let v = kind === 'npc' ? validateNpcPack(data) : validatePlayerPack(data);
    // 言い回しが複数ある項目は、決まりに反した言い回しだけ落とせば足りる（作り直さない）
    if (v.errors.length > 0 && dropBad(data, v.errors) > 0) v = kind === 'npc' ? validateNpcPack(data) : validatePlayerPack(data);
    if (v.errors.length > 0 && round < 3) {
      // エラーのある部分だけ作り直す
      const bad = new Set(v.errors.map(partOf));
      for (const p of bad) {
        delete parts[p];
        feedback[p] = `\n\n# 前回の出力で直すところ（同じ間違いをしない）\n${v.errors.filter((e) => partOf(e) === p).slice(0, 15).map((e) => `- ${e}`).join('\n')}`;
      }
      // プレイヤーの材料を作り直したら、A・B も作り直す
      if (kind === 'player' && bad.has('C')) { delete parts.A; delete parts.B; }
      console.log(`直す ${id}（${round}回目）: ${[...bad].join('・')} ${v.errors.slice(0, 2).join(' / ')}`);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ id, kind, model: MODEL, createdAt: new Date().toISOString(), ...data }, null, 1), 'utf8');
    console.log(`${v.errors.length ? 'NG（保存）' : 'OK'} ${id}（${round}回目）${v.errors.length ? ': ' + v.errors.slice(0, 3).join(' / ') : ''}${v.warnings.length ? ` 注意${v.warnings.length}件` : ''}`);
    return;
  }
  console.log(`NG ${id}: 3回で作れなかった`);
}

async function main(): Promise<void> {
  const budget = new RequestBudget(Number(arg('max', '400')));
  const log: Record<string, unknown>[] = [];
  const ids = kind === 'npc'
    ? fs.readdirSync(PERSONA_DIR).filter((f) => /^P-[FM]\d\d\.json$/.test(f)).map((f) => f.replace('.json', ''))
    : CHARACTERS.map((c) => c.id);
  const targets = only.length ? ids.filter((x) => only.includes(x)) : ids;
  const conc = Number(arg('concurrency', '3'));
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < targets.length) {
      const id = targets[next++];
      try { await genOne(id, budget, log); } catch (e) { console.log(`NG ${id}: ${(e as Error).message}`); }
    }
  }));
  const recFile = path.join(OUT, '生成記録.json');
  fs.mkdirSync(OUT, { recursive: true });
  const prev = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : [];
  fs.writeFileSync(recFile, JSON.stringify([...prev, { at: new Date().toISOString(), kind, model: MODEL, requests: budget.used, results: log }], null, 1), 'utf8');
  console.log(`リクエスト ${budget.used} 回`);
}

void main();
