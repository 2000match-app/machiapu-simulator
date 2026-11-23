// 話題カード方式の会話（2026-11-06）。APIを使わず、話題ごとの「聞く・答える・広げる」の型と、
// 双方のプロフィール（趣味・仕事・住まい・好きな食べ物など）から文を組み立てて、会話をかみ合わせる。
// 相手のメッセージは直前の自分の行動（答えて聞き返した・質問した・相槌だけ・話題を変えた）に反応する。
// 会話の状態は Contact.flags に持つ：convTopic（いまの話題）、convAct（相手が ask＝質問した／tell＝話した）、myAct（自分の直前の行動）。
import { AREAS } from './data/areas';
import { HOBBIES } from './data/npcPool';
import { Rng } from './rng';
import { attentiveness } from './appeal';
import { character, withRng } from './state';
import type { Contact, GameState, Npc } from './types';

import { TOPICS, type NpcTalk, type PlayerTalk, type TopicId } from './data/talkSlots';
import { NPC_TALK, PLAYER_TALK } from './data/talkPacks';
import { splitSentences } from './textSplit';
import { askableHobbies, askableTopics, profileQuestionLimit } from './profileDepth';
export type { TopicId };

const FOODS = ['焼肉', 'ラーメン', 'お寿司', 'イタリアン', 'カレー', '韓国料理', '中華', 'パスタ', '和食', 'ハンバーガー'];
const PLACES = ['京都', '箱根', '沖縄', '金沢', '軽井沢', '北海道', '鎌倉', '福岡', '台湾', '伊豆'];

/** 会話に使う、ある人物の話の材料 */
interface Facts {
  hobbies: string[];
  job: string;
  area: string;
  food: string;
  place: string;
  busy: boolean;
  appMonths: number;
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const pickBy = <T>(key: string, xs: T[]): T => xs[hashOf(key) % xs.length];
const areaName = (id: string) => AREAS.find((a) => a.id === id)?.name ?? '都内';

function npcFacts(npc: Npc): Facts {
  return {
    hobbies: askableHobbies(npc.hobbies), // 推し活は質問の材料にしない（2026-11-23）
    job: npc.job.replace(/（.*）/, ''),
    area: areaName(npc.areaId),
    food: pickBy(`${npc.id}:food`, FOODS),
    place: pickBy(`${npc.id}:place`, PLACES),
    busy: hashOf(`${npc.id}:busy`) % 3 === 0,
    appMonths: 1 + (hashOf(`${npc.id}:app`) % 8),
  };
}

/** プレイヤーの趣味（人物ごとに固定。魅力度の格差の「趣味の一致」にも使う） */
export function playerHobbies(state: GameState): string[] {
  return playerFacts(state).hobbies;
}

/** プレイヤーの話の材料（趣味は人物ごとに固定） */
function playerFacts(state: GameState): Facts {
  const ch = character(state);
  const pack = PLAYER_TALK[ch.id];
  const h1 = pickBy(`${ch.id}:h1`, HOBBIES);
  let h2 = pickBy(`${ch.id}:h2`, HOBBIES);
  if (h2 === h1) h2 = HOBBIES[(HOBBIES.indexOf(h1) + 7) % HOBBIES.length];
  return {
    // 回答パック（第4段階）があれば、その人物の設定に合わせて決めた趣味・好物・旅行先
    hobbies: pack ? [...pack.hobbies] : [h1, h2],
    job: ch.job.replace(/（.*）/, ''),
    area: areaName(ch.areaId),
    food: pack?.food ?? pickBy(`${ch.id}:food`, FOODS),
    place: pack?.place ?? pickBy(`${ch.id}:place`, PLACES),
    busy: !!(ch.constraints.busy || ch.constraints.shiftWork),
    appMonths: Math.max(1, Math.round(ch.appHistoryMonths)),
  };
}

type Ans = (me: Facts) => string;
/**
 * 最初の質問と、その答えの対。答えは言い回しを2つ持ち、相手は自分と違う言い回しで答える（オウム返しにならないように）。
 * 質問の番号は c.flags.askIdx、最後に使った言い回しは c.flags.ansJ に残す
 */
const QA: Record<TopicId, { q: (o: Facts) => string; a: [Ans, Ans] }[]> = {
  hobby: [
    { q: (o) => `プロフィールの${o.hobbies[0]}、気になってました！よくするんですか？`, a: [(me) => `${me.hobbies[0]}は月に何回かって感じです`, (me) => `時間があるときは、だいたい${me.hobbies[0]}です笑`] },
    { q: (o) => `${o.hobbies[0]}が好きなんですね。どんなところが好きなんですか？`, a: [(me) => `${me.hobbies[0]}のときは、気づいたら時間がたってるところですかね笑`, (me) => `${me.hobbies[0]}は、いい気分転換になるんです`] },
  ],
  work: [
    { q: () => 'お仕事はどんな感じですか？忙しいですか？', a: [(me) => (me.busy ? `仕事は${me.job}で、平日はけっこうバタバタしてます…` : `仕事は${me.job}です。わりと落ち着いてます`), (me) => (me.busy ? `${me.job}の仕事で、忙しい時期は帰りが遅いです…` : `${me.job}の仕事で、そこまで忙しくないです`)] },
    { q: () => 'お仕事って、平日は何時くらいまでなんですか？', a: [(me) => (me.busy ? '日によっては21時すぎまでかかります…' : 'だいたい18時くらいには終わります'), (me) => (me.busy ? '遅い日は終電近くなっちゃいます笑' : 'わりと定時で帰れる方です')] },
  ],
  holiday: [
    { q: () => '休みの日は何してることが多いですか？', a: [(me) => `だいたい${me.hobbies[0]}か、家でゆっくりしてます`, (me) => `${me.hobbies[0]}の日が多いです。たまに${me.hobbies[1] ?? '散歩'}も`] },
    { q: () => 'お休みの日って、家派ですか？外派ですか？', a: [(me) => `外派です！${me.hobbies[0]}の日が多いです`, (me) => `半々ですね笑 ${me.hobbies[0]}の日もあれば、一日家の日もあります`] },
  ],
  food: [
    { q: () => '好きな食べ物ってなんですか？', a: [(me) => `${me.food}が好きです！毎週でもいけます笑`, (me) => `${me.food}ですね。迷ったらだいたい${me.food}です`] },
    { q: () => '最近おいしかったお店とかあります？', a: [(me) => `この前行った${me.food}のお店がおいしかったです`, (me) => `最近だと、近所の${me.food}屋さんが当たりでした！`] },
  ],
  area: [
    { q: () => 'どのへんに住んでるんですか？', a: [(me) => `${me.area}のほうです。けっこう住みやすいですよ`, (me) => `${me.area}です！駅の近くで便利なんです`] },
    { q: () => '地元ってどこなんですか？', a: [() => '地元もこのへんです', () => '地元は関東じゃないんです'] },
  ],
  travel: [
    { q: () => '最近どこか旅行行きました？', a: [(me) => `少し前に${me.place}に行きました！`, (me) => `最近は行けてないんですけど、${me.place}にまた行きたいです`] },
    { q: () => '行ってよかった旅行先ってあります？', a: [(me) => `${me.place}がすごくよかったです`, (me) => `${me.place}ですね。また行きたいです`] },
  ],
  weekend: [
    { q: () => '今週末は何か予定あるんですか？', a: [(me) => `特に決めてないです〜。${me.hobbies[0]}かなって`, () => '友達とごはんに行くくらいですね'] },
    { q: () => '最近ハマってることってあります？', a: [(me) => `最近は${me.hobbies[0]}にハマってます笑`, () => '最近は料理にハマってます'] },
  ],
  app: [
    { q: () => 'このアプリって、いつごろから使ってるんですか？', a: [(me) => `始めて${me.appMonths}か月くらいです`, (me) => `${me.appMonths}か月くらい前からです。なかなか難しいですね笑`] },
    { q: () => 'アプリで実際に会ったことってあります？', a: [() => '何回かあります。緊張しますよね笑', () => 'まだないんです'] },
  ],
};

/** 話を広げる質問（深掘り）と、その答えの対。質問と答えがずれないよう、同じ番号で選ぶ */
const DIGS: Record<TopicId, { q: (o: Facts) => string; a: (me: Facts) => string }[]> = {
  hobby: [
    { q: (o) => `${o.hobbies[0]}いいですね！始めたきっかけって何だったんですか？`, a: (me) => `友達に誘われたのがきっかけです。${me.hobbies[0]}のときは何も考えなくていいのが好きで` },
    { q: (o) => `${o.hobbies[0]}、おすすめってあります？`, a: (me) => `${me.hobbies[0]}なら、最近行ったところがすごくよかったです！今度写真見せますね` },
  ],
  work: [
    { q: () => '大変そうですね…！どんなときにやりがいを感じますか？', a: () => 'お客さんに感謝されたときですかね。それがあるから続けられてます' },
    { q: () => 'すごいですね。休みはちゃんと取れてますか？', a: (me) => (me.busy ? '正直あんまり…笑 でも休みの日はしっかり休むようにしてます' : 'わりと取れてます！土日はちゃんと休みです') },
  ],
  holiday: [
    { q: () => 'いいですね！最近の休みで一番楽しかったのって何ですか？', a: (me) => `この前の${me.hobbies[0]}がすごく楽しかったです` },
    { q: () => 'わかります笑 家ではなにしてるんですか？', a: () => '家だとドラマ見たり、料理したりしてます' },
  ],
  food: [
    { q: (o) => `${o.food}いいですね！よく行くお店あるんですか？`, a: (me) => `${me.area}の近くに好きな${me.food}のお店があって、よく行きます` },
    { q: (o) => `${o.food}、自分も好きです！どんなのが好きですか？`, a: (me) => `${me.food}ならなんでも好きです笑 こってりめが好きかも` },
  ],
  area: [
    { q: (o) => `${o.area}いいですね！おすすめのお店とかあります？`, a: () => '駅の近くにおいしいパン屋さんがあります！' },
    { q: (o) => `${o.area}って住みやすいですか？`, a: () => '静かで住みやすいですよ。買い物も困らないです' },
  ],
  travel: [
    { q: (o) => `${o.place}いいなあ！何が一番よかったですか？`, a: () => 'ごはんがとにかくおいしかったです笑' },
    { q: (o) => `${o.place}、行ってみたいんです。おすすめあります？`, a: () => '景色のいいところが多くて、ゆっくり歩くだけでも楽しいですよ' },
  ],
  weekend: [
    { q: () => 'いいですね！どこか行くんですか？', a: (me) => `${me.hobbies[0]}の予定です！` },
    { q: () => 'どれくらいハマってるんですか？笑', a: () => '休みの日はほぼそれです笑' },
  ],
  app: [
    { q: () => '始めたきっかけって何だったんですか？', a: () => '友達に勧められたのがきっかけです' },
    { q: () => '実際やってみてどうですか？', a: () => 'いろんな人と話せて楽しいです' },
  ],
};

/** 文末に記号がなければ「！」を付ける（「笑！」「…！」のような重なりを避ける） */
function bang(s: string): string {
  return /[！？。…笑〜!?)）\p{Extended_Pictographic}️]$/u.test(s) ? s : `${s}！`;
}

/** 相手の名前を呼ぶ */
const san = (name: string) => `${name}さん`;

/** 相手が知らない話題を選ぶ（使っていない話題から） */
function nextTopic(c: Contact, rng: Rng): TopicId {
  const used = String(c.flags.convUsed ?? '').split(',').filter(Boolean);
  const rest = TOPICS.filter((t) => !used.includes(t));
  return rng.pick(rest.length ? rest : TOPICS);
}
function markUsed(c: Contact, t: TopicId): void {
  const used = new Set(String(c.flags.convUsed ?? '').split(',').filter(Boolean));
  used.add(t);
  c.flags.convUsed = [...used].join(',');
}

const REACT = ['そうなんですね！', 'へえ〜！', 'いいですね！', 'わかります笑', 'なるほど！'];

// ───────── トークパック（第3・4段階、2026-11-11）─────────
// 相手の文は人格テンプレのトークパック（NPC_TALK）、プレイヤーの文は人物ごとの回答パック（PLAYER_TALK）から引く。
// パックがない時は、上の QA・DIGS の汎用文で話す。

interface Ctx { state: GameState; c: Contact; npc: Npc; me: Facts; them: Facts; np?: NpcTalk; pp?: PlayerTalk }

function ctxOf(state: GameState, c: Contact, npc: Npc): Ctx {
  return { state, c, npc, me: playerFacts(state), them: npcFacts(npc), np: NPC_TALK[String(c.flags.persona ?? '')], pp: PLAYER_TALK[state.characterId] };
}
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_0-9]+)\}/g, (m, k: string) => vars[k] ?? m);
}
/** 相手（NPC）の文の差し込み */
function npcText(x: Ctx, s: string, over: Record<string, string> = {}): string {
  const t = x.them;
  return fill(s, { hobby: t.hobbies[0], hobby2: t.hobbies[1] ?? t.hobbies[0], food: t.food, area: t.area, place: t.place, job: t.job, months: String(t.appMonths), name: character(x.state).name, their_hobby: x.me.hobbies[0], ...over });
}
/** プレイヤーの文の差し込み（相手のことを聞く） */
function myText(x: Ctx, s: string): string {
  const t = x.them;
  return fill(s, { their_hobby: t.hobbies[0], their_food: t.food, their_area: t.area, their_place: t.place, name: x.npc.name });
}
const firstSentence = (s: string) => splitSentences(s, 9)[0] ?? s;

// 相手の文
function npcAsk(x: Ctx, t: TopicId, rng: Rng): string {
  const i = rng.int(0, 1);
  x.c.flags.askIdx = i;
  x.c.flags.ansJ = -1;
  return x.np ? npcText(x, x.np.ask[t][i]) : QA[t][i % QA[t].length].q(x.me);
}
function npcAnswer(x: Ctx, t: TopicId, rng: Rng): string {
  const i = Number(x.c.flags.askIdx ?? 0) % 2;
  if (x.np) return npcText(x, x.np.answer[t][i]);
  const prev = Number(x.c.flags.ansJ ?? -1);
  const j = prev === 0 ? 1 : prev === 1 ? 0 : rng.int(0, 1);
  x.c.flags.ansJ = j;
  return QA[t][i % QA[t].length].a[j](x.them);
}
function npcDetail(x: Ctx, t: TopicId, rng: Rng): string {
  const i = Number(x.c.flags.digIdx ?? rng.int(0, 1)) % 2;
  return x.np ? npcText(x, x.np.detail[t][i]) : DIGS[t][i % DIGS[t].length].a(x.them);
}
function npcReact(x: Ctx, t: TopicId, rng: Rng): string {
  return x.np ? firstSentence(rng.pick(x.np.react[t])) : rng.pick(REACT);
}

// プレイヤーの文（選択肢に出すので、状態を変えずに文だけ作る）
function myAsk(x: Ctx, t: TopicId, i: number): string {
  return x.pp ? myText(x, x.pp.ask[t][i]) : QA[t][i % QA[t].length].q(x.them);
}
function myDig(x: Ctx, t: TopicId, i: number): string {
  return x.pp ? myText(x, x.pp.dig[t][i]) : DIGS[t][i % DIGS[t].length].q(x.them);
}
function myAnswer(x: Ctx, t: TopicId, i: number, j: number): string {
  // 趣味の質問は、相手が聞いた趣味（1つ目）の答えにそろえる
  if (x.pp) return x.pp.answer[t][i % 2][t === 'hobby' ? 0 : j % 2];
  return bang(QA[t][i % QA[t].length].a[j % 2](x.me));
}
function myAskBack(x: Ctx, rng: Rng): string {
  return x.pp ? myText(x, rng.pick(x.pp.ask_back)) : `${san(x.npc.name)}は？`;
}

function setConv(c: Contact, t: TopicId, act: 'ask' | 'tell'): void {
  c.flags.askBack = false;
  c.flags.convTopic = t;
  c.flags.convAct = act;
  markUsed(c, t);
}

/**
 * 相手のふつうの会話のメッセージ（chat_normal）。直前の自分の行動に反応する。
 * 戻り値の文を npcSay に渡す（1通1文に分けて送られる）。
 */
export function npcConvMessage(state: GameState, c: Contact, npc: Npc): string {
  return withRng(state, (rng) => {
    const x = ctxOf(state, c, npc);
    const myName = san(character(state).name);
    const t = (c.flags.convTopic as TopicId | undefined) ?? 'hobby';
    const act = c.flags.myAct as string | undefined;
    c.flags.myAct = '';
    const warm = attentiveness(state, npc); // 格上のこちらには親身（聞き返しや気づかいが増える）
    let parts: string[];
    if (act === 'answer' || act === 'answer_casual' || act === 'selftalk') {
      // 質問に答えた → 相手は受け止めて、次の話題を聞く
      const nt = nextTopic(c, rng);
      parts = [npcReact(x, t, rng), npcAsk(x, nt, rng)];
      setConv(c, nt, 'ask');
    } else if (act === 'answer_ask') {
      // こちらが答えて聞き返した → 相手も同じ話題で答え、半分は次の話題を聞く
      parts = [npcReact(x, t, rng), npcAnswer(x, t, rng)];
      if (rng.chance(0.5)) {
        const nt = nextTopic(c, rng);
        parts.push(npcAsk(x, nt, rng));
        setConv(c, nt, 'ask');
      } else setConv(c, t, 'tell');
    } else if (act === 'ask') {
      // こちらが質問した → 相手が答え（深掘りなら詳しく）、6割は同じことを聞き返す
      parts = [c.flags.myQ === 'dig' ? npcDetail(x, t, rng) : npcAnswer(x, t, rng)];
      if (rng.chance(0.6 + 0.35 * warm)) { parts.push(`${myName}は？`); setConv(c, t, 'ask'); c.flags.askBack = true; } else setConv(c, t, 'tell');
    } else if (act === 'change') {
      // こちらが相手のプロフィールから話題を出した → 相手の趣味の話
      parts = [x.np ? npcText(x, rng.pick(x.np.profile_change)) : rng.pick(['覚えててくれたんですね！', 'そうなんです！']), npcAnswer(x, 'hobby', rng)];
      setConv(c, 'hobby', 'tell');
    } else if ((act === 'aizuchi' && c.flags.convAct === 'ask') || act === 'dodge') {
      // 質問に相槌だけ・はぐらかした → かみ合わず、相手は別の話題へ（少し冷める）
      c.interest -= 3;
      const nt = nextTopic(c, rng);
      parts = [x.np ? rng.pick(x.np.aizuchi_back) : rng.pick(['あ、はい笑', 'そうですよね笑', '笑']), npcAsk(x, nt, rng)];
      setConv(c, nt, 'ask');
    } else {
      // 会話の始まり・相槌のあと → 相手から質問する
      const nt = c.flags.convTopic ? nextTopic(c, rng) : 'holiday';
      parts = [npcAsk(x, nt, rng)];
      setConv(c, nt, 'ask');
    }
    c.flags.myQ = '';
    // 親身な相手は、気づかいや好意のひとことを添える
    if (warm > 0 && rng.chance(0.6 * warm)) {
      parts.unshift(x.np ? npcText(x, rng.pick(x.np.warm)) : rng.pick([`${myName}と話してると楽しいです☺️`, `${myName}のこと、もっと知りたいです！`, 'お仕事おつかれさまです！', `${myName}って話しやすいですね笑`]));
    }
    return parts.map(bang).join(' ');
  });
}

/**
 * こちらが質問した直後に、相手が別の話（誘い・LINE・勤務の話など）をする時の前置き。
 * 先に質問に答えてから本題に入る。質問していなければ空文字
 */
export function npcAnswerFirst(state: GameState, c: Contact, npc: Npc): string {
  const act = c.flags.myAct as string | undefined;
  return withRng(state, (rng) => {
    const x = ctxOf(state, c, npc);
    const t = act === 'change' ? 'hobby' : ((c.flags.convTopic as TopicId | undefined) ?? 'hobby');
    if (act === 'answer' || act === 'answer_casual' || act === 'selftalk') return npcReact(x, t, rng); // 答えた → 受け止めてから本題へ
    if (act !== 'ask' && act !== 'answer_ask' && act !== 'change') return '';
    return bang(act === 'ask' && c.flags.myQ === 'dig' ? npcDetail(x, t, rng) : npcAnswer(x, t, rng));
  });
}

/** そっけない返事（温度2）。質問されても短く答えるだけで、聞き返さない */
export function npcCurtMessage(state: GameState, c: Contact, npc: Npc): string {
  return withRng(state, (rng) => {
    const x = ctxOf(state, c, npc);
    const t = (c.flags.convTopic as TopicId | undefined) ?? 'hobby';
    const act = c.flags.myAct as string | undefined;
    c.flags.myAct = '';
    c.flags.myQ = '';
    c.flags.convAct = 'tell';
    if (act === 'ask' || act === 'answer_ask' || act === 'change' || act === 'switch') {
      if (x.np) return npcText(x, x.np.curt_short[act === 'change' ? 'hobby' : t]);
      const them = x.them;
      const short: Record<TopicId, string> = {
        hobby: `${them.hobbies[0]}とかですね`, work: 'ふつうですね', holiday: '家にいることが多いです', food: `${them.food}とかです`,
        area: `${them.area}です`, travel: '最近は行ってないです', weekend: 'まだ決めてないです', app: '最近です',
      };
      return short[t];
    }
    return x.np ? rng.pick(x.np.curt_one) : rng.pick(state.gender === 'M' ? ['はい', 'そうなんですね', 'へー', 'なるほど'] : ['そうなんだ', 'うん', 'へー', 'なるほどです']);
  });
}

/** 相手の一言（温度1）。人格テンプレの一言から */
export function npcOneWord(state: GameState, c: Contact, _npc: Npc): string | undefined {
  const np = NPC_TALK[String(c.flags.persona ?? '')];
  return np ? withRng(state, (r) => r.pick(np.curt_one)) : undefined;
}

/** 乗り気（温度4）の自己開示・前のめり（温度5）の話を合わせる文。パックがなければ undefined */
export function npcEagerLine(state: GameState, c: Contact, npc: Npc, kind: 'disclose' | 'match' | 'shared', shared?: string): string | undefined {
  const x = ctxOf(state, c, npc);
  if (!x.np) return undefined;
  // 同じ相手には同じ文を2回使わない。使い切ったら空文字（足さない）
  const pool = kind === 'disclose' ? x.np.disclose : kind === 'shared' ? x.np.react_shared : x.np.match;
  const usedKey = `used_${kind}`;
  const used = new Set(String(c.flags[usedKey] ?? '').split(',').filter(Boolean).map(Number));
  const left = pool.map((_, i) => i).filter((i) => !used.has(i));
  if (left.length === 0) return '';
  const i = withRng(state, (r) => r.pick(left));
  used.add(i);
  c.flags[usedKey] = [...used].join(',');
  return npcText(x, pool[i], kind === 'shared' ? { hobby: shared ?? x.them.hobbies[0] } : {});
}

/** 誘いへの返事（承諾・予定が合わない）。パックがなければ undefined */
export function npcInviteLines(state: GameState, c: Contact, npc: Npc, kind: 'accept' | 'busy'): string[] | undefined {
  const x = ctxOf(state, c, npc);
  if (!x.np) return undefined;
  let pool = kind === 'accept' ? x.np!.invite_accept : x.np!.invite_busy;
  // 誘った店の種類に合う文だけ使う（2026-11-16 修正：カフェに誘ったのに「美味しいもの食べに行きましょー🍺」と返っていた）
  if (kind === 'accept') {
    const tier = String(c.flags.inviteTier ?? 'cafe');
    pool = pool.filter((t) => fitsInviteTier(t, tier));
    if (pool.length === 0) return undefined; // 合う文がなければ、ふつうの承諾の文
  }
  return splitSentences(withRng(state, (r) => npcText(x, r.pick(pool))), 3);
}
/** カフェの誘いに合わない文（食事・お酒）と、食事の誘いに合わない文（お茶・カフェだけ） */
const FOOD_DRINK = /飲み|飲も|お酒|ビール|乾杯|🍺|🍻|🍷|ご飯|ごはん|食べ|ディナー|居酒屋|焼肉|ランチ|美味しいもの|おいしいもの/;
const CAFE_ONLY = /お茶|カフェ|コーヒー|☕/;
export function fitsInviteTier(text: string, tier: string): boolean {
  return tier === 'cafe' ? !FOOD_DRINK.test(text) : !CAFE_ONLY.test(text);
}

/** 会いたいと伝える文（話題に合わせて自然な誘いにする） */
export function playerMeetLine(_state: GameState, c: Contact, npc: Npc): string {
  if (c.meetings > 0) return 'また会いたいです。次はいつ空いてますか？';
  const them = npcFacts(npc);
  const t = c.flags.convTopic as TopicId | undefined;
  if (t === 'food') return `よかったら今度、${them.food}食べに行きませんか？`;
  if (t === 'hobby') return `${them.hobbies[0]}の話もっと聞きたいです。今度お茶でもどうですか？`;
  if (t === 'area') return `${them.area}のおすすめのお店、今度一緒に行きませんか？`;
  return `${san(npc.name)}と会ってみたいです。今度お茶でもどうですか？`;
}

/**
 * トークの選択肢（2026-11-11 指示で作り直し）。
 * - 相手が話した（質問ではない）とき：相槌を打つ／プロフィールを見て質問する／電話してみたいと言う
 * - 相手が質問したとき：詳しく答える／適当に答える／ブロックする。答えを選んだあと、聞き返す・プロフィールを見て質問を添える・答えだけ送る
 * 文面は人格テンプレ・回答パックのまま（第3・4段階）。選択肢のID：
 *   aizuchi ／ callwish ／ q:<質問> ／ ans_d・ans_c（＋ "+back" か "+q:<質問>"）／ block
 * 質問の書き方：d:<話題>:<番号>（相手の話の深掘り）／ a:<話題>:<番号>（その話題の最初の質問）
 */
export interface TalkQuestion { key: string; group: string; text: string }
export interface TalkMenu {
  mode: 'question' | 'talk';
  /** 相手が質問した話題（mode=question） */
  topic: TopicId;
  aizuchi: string;
  /** 詳しく答える・適当に答える（単独で送るときの文） */
  detailed: string;
  casual: string;
  /** 相手がもう答えて「◯◯さんは？」と聞き返してきた（聞き返しは出さない） */
  askedBack: boolean;
  /** 会話の流れの外から来た質問に答えるとき、その話題（答えたら会話の流れに乗せる） */
  inferred?: { t: TopicId; i: number };
  askBack: string;
  questions: TalkQuestion[];
}

const GROUP: Record<TopicId, string> = { hobby: '趣味', work: '仕事', holiday: '休日', food: '食べ物', area: '住まい', travel: '旅行', weekend: '最近・週末', app: 'アプリ' };

/** はい・いいえで答える質問か（「何・どこ・いつ・どんな…」を含まない質問） */
export function isYesNoQuestion(text: string): boolean {
  return isQuestionText(text) && !/(何|なに|なん|どこ|いつ|誰|だれ|どんな|どう|どの|どれ|なぜ|どうして|いくつ|どのくらい|どれくらい)/.test(text);
}
function isQuestionText(text: string): boolean {
  return /[？?][\p{Extended_Pictographic}️‍笑〜ー]*$/u.test(text.trim());
}
/** 会話の流れの外から来た質問（挨拶・乗り気の追い質問など）の話題を、文面から推し量る */
function guessTopic(text: string): { t: TopicId; i: number } {
  if (/ハマ/.test(text)) return { t: 'weekend', i: 1 };
  if (/週末|土日/.test(text)) return { t: 'weekend', i: 0 };
  if (/休み|休日|お休/.test(text)) return { t: 'holiday', i: /家派|外派|インドア|アウトドア/.test(text) ? 1 : 0 };
  if (/仕事|職場|働/.test(text)) return { t: 'work', i: /何時/.test(text) ? 1 : 0 };
  if (/食べ|ご飯|ごはん|お店|料理/.test(text)) return { t: 'food', i: /お店|最近/.test(text) ? 1 : 0 };
  if (/住|地元|出身/.test(text)) return { t: 'area', i: /地元|出身/.test(text) ? 1 : 0 };
  if (/旅行|旅/.test(text)) return { t: 'travel', i: /よかった/.test(text) ? 1 : 0 };
  if (/アプリ/.test(text)) return { t: 'app', i: /会った/.test(text) ? 1 : 0 };
  if (/趣味|好き/.test(text)) return { t: 'hobby', i: 0 };
  return { t: 'holiday', i: 0 };
}

function menuRng(state: GameState, c: Contact): Rng {
  return Rng.fromSeed(state.seed, 'talk-menu', c.npcId, c.messages.length);
}

export function talkMenu(state: GameState, c: Contact, npc: Npc): TalkMenu {
  const x = ctxOf(state, c, npc);
  const rng = menuRng(state, c);
  let t = (c.flags.convTopic as TopicId | undefined) ?? 'hobby';
  let i = Number(c.flags.askIdx ?? 0) % 2;
  let mode: 'question' | 'talk' = c.flags.convAct === 'ask' ? 'question' : 'talk';
  // 相手の最後のメッセージが質問なら、答える選択肢を出す（2026-11-11 指示：開いた質問に答えられない）
  const lastThem = [...c.messages].reverse().find((z) => z.from === 'them')?.text ?? '';
  let inferred: { t: TopicId; i: number } | undefined;
  if (mode === 'talk' && isQuestionText(lastThem)) {
    inferred = guessTopic(lastThem);
    t = inferred.t; i = inferred.i; mode = 'question';
  }
  const yesNo = isYesNoQuestion(lastThem);
  const asked = new Set(String(c.flags.myAsked ?? '').split(',').filter(Boolean));
  // 答え（詳しく＝長い方、適当＝短い方の1文目）
  const variants = [myAnswer(x, t, i, 0), myAnswer(x, t, i, 1)].sort((a, b) => b.length - a.length);
  const detailed = mode === 'question' && i === 0 && x.pp ? x.pp.self_talk[t] : variants[0];
  // はい・いいえの質問に適当に答えるなら「そうですね」
  const casual = yesNo && inferred ? rng.pick(['そうですね！', 'そうですね笑']) : firstSentence(variants[variants.length - 1]);
  // プロフィールを見て聞ける質問
  const questions: TalkQuestion[] = [];
  if (mode === 'talk' && c.flags.convUsed) {
    for (const k of [0, 1]) if (!asked.has(`d:${t}:${k}`)) questions.push({ key: `d:${t}:${k}`, group: `いまの話（${GROUP[t]}）`, text: myDig(x, t, k) });
  }
  // プロフィールが薄い相手には、聞ける話題が少ない（2026-11-23）
  const askable = askableTopics(npc);
  const fromProfile: TalkQuestion[] = [];
  for (const topic of TOPICS) {
    if (askable && !askable.includes(topic)) continue;
    if (mode === 'question' && topic === t) continue; // いま聞かれている話題は「聞き返す」で
    const ks = [0, 1].filter((k) => !asked.has(`a:${topic}:${k}`));
    if (ks.length === 0) continue;
    const k = topic === 'hobby' ? ks[0] : rng.pick(ks);
    fromProfile.push({ key: `a:${topic}:${k}`, group: GROUP[topic], text: myAsk(x, topic, k) });
  }
  // プロフィールを見て聞ける質問の数（2026-11-23 指示）：よろしくだけ2つ・5行以内3つ・充実5つ。趣味の質問はなるべく残す
  const limit = profileQuestionLimit(npc);
  const hobbyQ = fromProfile.find((q) => q.key.startsWith('a:hobby:'));
  const rest = fromProfile.filter((q) => q !== hobbyQ);
  for (let j = rest.length - 1; j > 0; j--) { const r = rng.int(0, j); [rest[j], rest[r]] = [rest[r], rest[j]]; }
  const chosen = new Set([...(hobbyQ ? [hobbyQ] : []), ...rest].slice(0, limit));
  questions.push(...fromProfile.filter((q) => chosen.has(q)));
  return {
    mode, topic: t, detailed, casual, questions, inferred,
    // 相槌は相手のメッセージに合わせる（2026-11-11 指示）：はい・いいえの質問なら「そうですね」、話や自己紹介なら「そうなんですね」
    aizuchi: yesNo ? rng.pick(['そうですね！', 'そうですね笑']) : rng.pick(['そうなんですね！', 'そうなんですね〜']),
    askedBack: !!c.flags.askBack,
    askBack: myAskBack(x, rng),
  };
}

/** 選んだ手の文面と、会話の状態の進め方。分からない選択肢は undefined */
export function talkChoice(state: GameState, c: Contact, npc: Npc, optionId: string): { text: string; apply: () => void; kind: 'answer' | 'question' | 'aizuchi' | 'callwish' } | undefined {
  const m = talkMenu(state, c, npc);
  const x = ctxOf(state, c, npc);
  const remember = (key: string) => {
    const asked = new Set(String(c.flags.myAsked ?? '').split(',').filter(Boolean));
    asked.add(key);
    c.flags.myAsked = [...asked].join(',');
  };
  const question = (key: string): { text: string; apply: () => void } | undefined => {
    const q = m.questions.find((z) => z.key === key);
    if (!q) return undefined;
    const [kind, topic, n] = key.split(':') as ['d' | 'a', TopicId, string];
    const k = Number(n);
    return {
      text: q.text,
      apply: () => {
        remember(key);
        c.flags.myQ = kind === 'd' ? 'dig' : 'ask';
        if (kind === 'd') { c.flags.myAct = 'ask'; c.flags.digIdx = k; return; }
        c.flags.myAct = topic === 'hobby' ? 'change' : 'ask';
        c.flags.convTopic = topic; c.flags.askIdx = k; c.flags.ansJ = -1;
        markUsed(c, topic);
      },
    };
  };
  if (optionId === 'aizuchi') return { kind: 'aizuchi', text: m.aizuchi, apply: () => { c.flags.myAct = 'aizuchi'; } };
  if (optionId === 'callwish') return { kind: 'callwish', text: x.pp ? 'よかったら今度、電話でお話ししてみたいです！' : '今度、電話してみたいです！', apply: () => { c.flags.myAct = 'callwish'; } };
  if (optionId.startsWith('q:')) {
    const q = question(optionId.slice(2));
    return q && { kind: 'question', ...q };
  }
  if (optionId.startsWith('ans_') && m.mode === 'question') {
    const [base, follow] = optionId.split('+');
    const casual = base === 'ans_c';
    // 流れの外の質問に答えたら、その話題に乗せる（相手の受け止めがその話題になる）
    const onTopic = () => { if (m.inferred) { c.flags.convTopic = m.inferred.t; c.flags.askIdx = m.inferred.i; c.flags.convAct = 'ask'; markUsed(c, m.inferred.t); } };
    if (!follow) return { kind: 'answer', text: casual ? m.casual : m.detailed, apply: () => { onTopic(); c.flags.myAct = casual ? 'answer_casual' : 'answer'; } };
    // 後ろに質問を添えるときは、1回3文に収まるよう答えを短くする
    const ans = casual ? m.casual : splitSentences(m.detailed, 9).slice(0, 2).join('');
    if (follow === 'back' && !m.askedBack) return { kind: 'answer', text: `${ans} ${m.askBack}`, apply: () => { onTopic(); c.flags.myAct = 'answer_ask'; } };
    if (follow.startsWith('q:')) {
      const q = question(follow.slice(2));
      if (!q) return undefined;
      const head = splitSentences(`${ans} ${q.text}`, 99).length > 3 ? firstSentence(ans) : ans;
      return { kind: 'answer', text: `${head} ${q.text}`, apply: q.apply };
    }
  }
  return undefined;
}

/** 相槌（トーク一覧からの1タップ返信など、選択肢を開かずに返す時） */
export function playerAizuchiLine(state: GameState, c: Contact): string {
  c.flags.myAct = 'aizuchi';
  const pp = PLAYER_TALK[state.characterId];
  return withRng(state, (rng) => rng.pick(pp ? pp.aizuchi : ['そうなんですね！', 'なるほど〜', 'たしかに笑', 'いいですね！']));
}
