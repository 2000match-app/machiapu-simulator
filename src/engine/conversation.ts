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

import { ALT_TOPICS, FACT_OF_TOPIC, TOPICS, type NpcTalk, type PlayerTalk, type TopicId } from './data/talkSlots';
import { detailsOf } from './profileDetails';
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
  // 2026-11-23 追加（16話題）
  hometown: string;
  sibling: string;
  pet: string;
  petOwned: boolean;
  drink: string;
  drinks: boolean;
  music: string;
  show: string;
  sport: string;
  doesSport: boolean;
  dish: string;
  club: string;
  dateplace: string;
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const pickBy = <T>(key: string, xs: T[]): T => xs[hashOf(key) % xs.length];
const areaName = (id: string) => AREAS.find((a) => a.id === id)?.name ?? '都内';

function npcFacts(npc: Npc): Facts {
  const d = detailsOf(npc);
  return {
    hometown: d.hometown, sibling: d.sibling, pet: d.pet, petOwned: d.petOwned, drink: d.drink, drinks: d.drinks,
    music: d.music, show: d.show, sport: d.sport, doesSport: d.doesSport, dish: d.dish, club: d.club, dateplace: d.dateplace,
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
  const drinks = ch.drinking !== 'none';
  return {
    // 2026-11-23 追加の材料：回答パック（第2版）にあればそれ、なければ人物ごとに固定で選ぶ
    hometown: pack?.hometown ?? 'このへん',
    sibling: pack?.sibling ?? pickBy(`${ch.id}:sib`, ['一人っ子', ch.gender === 'M' ? '姉が1人いる長男' : '兄が1人いる長女', ch.gender === 'M' ? '兄が1人いる次男' : '姉が1人いる次女']),
    pet: pack?.pet ?? pickBy(`${ch.id}:pet`, ['犬', '猫']),
    petOwned: false,
    drink: pack?.drink ?? (drinks ? pickBy(`${ch.id}:drink`, ['ビール', 'ハイボール', 'ワイン', 'レモンサワー']) : 'お茶'),
    drinks,
    music: pack?.music ?? pickBy(`${ch.id}:music`, ['J-POP', '邦ロック', '洋楽', 'K-POP']),
    show: pack?.show ?? pickBy(`${ch.id}:show`, ['韓国ドラマ', '洋画', 'お笑い', 'アニメ']),
    sport: pack?.sport ?? pickBy(`${ch.id}:sport`, ['ジム', 'ランニング', 'ヨガ']),
    doesSport: true,
    dish: pack?.dish ?? pickBy(`${ch.id}:dish`, ['カレー', 'パスタ', 'チャーハン', '鍋']),
    club: pack?.club ?? pickBy(`${ch.id}:club`, ['バスケ部', 'テニス部', '吹奏楽部', '帰宅部']),
    dateplace: pack?.dateplace ?? pickBy(`${ch.id}:dp`, ['水族館', '美術館', '温泉', '映画館']),
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
  // 2026-11-23 追加の話題（トークパックがないときの汎用文）
  family: [
    { q: () => 'ご兄弟っているんですか？', a: [(me) => `${me.sibling}です！`, (me) => (me.sibling === '一人っ子' ? '一人っ子なんです笑' : `うちは${me.sibling}なんです`)] },
    { q: () => 'ご家族とは仲いいですか？', a: [() => '仲いいほうだと思います！たまに実家に帰ってます', () => 'わりと仲いいです笑 連絡はよく取ってます'] },
  ],
  pet: [
    { q: () => 'ペットって飼ってます？', a: [(me) => (me.petOwned ? `${me.pet}を飼ってます！` : `飼ってないんですけど、${me.pet}が好きです`), (me) => (me.petOwned ? `${me.pet}と暮らしてます笑` : `今は飼ってないです。${me.pet}はずっと好きなんですけど`)] },
    { q: () => '犬派ですか？猫派ですか？', a: [(me) => `${me.pet}派です！`, (me) => `どっちも好きですけど、${me.pet}派かもです笑`] },
  ],
  drink: [
    { q: () => 'お酒って飲まれます？', a: [(me) => (me.drinks ? `飲みます！${me.drink}が好きです` : 'お酒はあまり飲めないんです'), (me) => (me.drinks ? `たまに飲みます。${me.drink}が多いです` : '飲めないんですけど、飲みの場は好きです笑')] },
    { q: () => '飲みに行くなら、どんなお店が好きですか？', a: [() => '落ち着いた雰囲気のお店が好きです', () => 'わいわいできる居酒屋が好きです笑'] },
  ],
  media: [
    { q: () => '普段どんな音楽聴いてるんですか？', a: [(me) => `${me.music}が多いです！`, (me) => `最近は${me.music}ばっかりです笑`] },
    { q: () => '最近見た映画とかドラマで、よかったのあります？', a: [(me) => `最近は${me.show}をよく見てます！`, () => '最近はあんまり見れてないんです…おすすめあったら知りたいです'] },
  ],
  sports: [
    { q: () => '何か運動とかしてます？', a: [(me) => (me.doesSport ? `${me.sport}に通ってます！` : '最近は全然できてないです笑'), (me) => (me.doesSport ? `${me.sport}をちょっとだけ続けてます` : '運動不足なので何か始めたいです')] },
    { q: () => 'スポーツ観戦とかはしますか？', a: [() => 'テレビでたまに見るくらいです！', () => '現地で見たことはあまりないです笑'] },
  ],
  cooking: [
    { q: () => '料理ってします？', a: [() => 'たまにします！休みの日が多いです', () => '簡単なものだけですけど作ります笑'] },
    { q: () => '得意料理ってなんですか？', a: [(me) => `${me.dish}ですかね！`, (me) => `得意ってほどじゃないですけど、${me.dish}はよく作ります`] },
  ],
  school: [
    { q: () => '学生時代って、部活とかやってました？', a: [(me) => `${me.club}でした！`, (me) => `${me.club}でしたよ笑`] },
    { q: () => '学生のころって、どんな感じだったんですか？', a: [() => 'わりと真面目なほうでした笑', () => '友達と遊んでばっかりでした笑'] },
  ],
  date: [
    { q: () => '今行ってみたいところってあります？', a: [(me) => `${me.dateplace}に行ってみたいです！`, (me) => `最近は${me.dateplace}が気になってます`] },
    { q: () => '休みの日に誰かと出かけるなら、まったり派ですか？アクティブ派ですか？', a: [() => 'まったり派です笑', () => 'どっちも好きですけど、まったり寄りかもです'] },
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
  family: [
    { q: () => '兄弟とは仲いいんですか？', a: (me) => (me.sibling === '一人っ子' ? '一人っ子なので、そのぶん親とよく話します笑' : '仲いいです！たまにごはんに行きます') },
    { q: () => '実家ってにぎやかな感じですか？', a: () => 'わりとにぎやかです笑 帰るとほっとします' },
  ],
  pet: [
    { q: () => 'どんなところがかわいいんですか？', a: (me) => `${me.pet}は、のんびりしてるところがかわいいんです` },
    { q: () => '動物カフェとか行ったりします？', a: () => 'たまに行きます！癒やされますよね' },
  ],
  drink: [
    { q: (o) => `${o.drink}って、どういうのが好きなんですか？`, a: (me) => (me.drinks ? `${me.drink}なら、すっきりしたのが好きです` : 'ノンアルコールのドリンクをいろいろ試してます笑') },
    { q: () => 'お酒飲むと変わるタイプですか？笑', a: () => 'ちょっと明るくなるくらいです笑' },
  ],
  media: [
    { q: (o) => `${o.music}で、おすすめってあります？`, a: (me) => `${me.music}なら、最近ハマってるのがあるので今度教えます！` },
    { q: () => 'ライブとか映画館にも行ったりするんですか？', a: () => 'たまに行きます！やっぱり迫力が違いますよね' },
  ],
  sports: [
    { q: (o) => `${o.sport}って、どれくらいの頻度でしてるんですか？`, a: (me) => (me.doesSport ? `${me.sport}は週1くらいです` : '今は見る専門です笑') },
    { q: () => '続けるコツとかあります？', a: () => '無理しないことですかね笑' },
  ],
  cooking: [
    { q: (o) => `${o.dish}、こだわりとかあるんですか？`, a: (me) => `${me.dish}は、ちょっとだけ隠し味を入れてます笑` },
    { q: () => '作るのは休みの日が多いですか？', a: () => '休みの日にまとめて作ることが多いです' },
  ],
  school: [
    { q: (o) => `${o.club}って、きつかったですか？`, a: () => '練習はきつかったですけど、楽しかったです' },
    { q: () => '学生時代の友達とは、今も会ったりします？', a: () => '今もたまに集まります！' },
  ],
  date: [
    { q: (o) => `${o.dateplace}、いいですね！どんなところが好きなんですか？`, a: () => 'ゆっくり過ごせるところが好きです' },
    { q: () => '最近行ってよかったお出かけ先ってあります？', a: (me) => `この前行った${me.dateplace}がよかったです！` },
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
/** ある人物の材料を差し込みの名前にする（prefix：'' は本人、'their_' は話し相手として） */
function factVars(f: Facts, prefix = ''): Record<string, string> {
  const v: Record<string, string> = {
    hobby: f.hobbies[0], hobby2: f.hobbies[1] ?? f.hobbies[0], food: f.food, area: f.area, place: f.place, job: f.job, months: String(f.appMonths),
    hometown: f.hometown, sibling: f.sibling, pet: f.pet, drink: f.drink, music: f.music, show: f.show, sport: f.sport, dish: f.dish, club: f.club, dateplace: f.dateplace,
  };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [prefix + k, x]));
}
/** 相手（NPC）の文の差し込み。{their_…} はプレイヤーの材料（受け止めで相手の答えの中身に触れる） */
function npcText(x: Ctx, s: string, over: Record<string, string> = {}): string {
  return fill(s, { ...factVars(x.them), ...factVars(x.me, 'their_'), name: character(x.state).name, ...over });
}
/** プレイヤーの文の差し込み（相手のことを聞く） */
function myText(x: Ctx, s: string): string {
  return fill(s, { ...factVars(x.them, 'their_'), name: x.npc.name });
}
/** 言い回しの中から1つ（ない・空なら undefined） */
function pickV(arr: string[] | undefined, rng: Rng): string | undefined {
  return arr && arr.length ? rng.pick(arr) : undefined;
}
/** 飼っていない・飲まない・運動していない相手は、別の答え（answer_alt）を使う */
function usesAlt(t: TopicId, f: Facts): boolean {
  if (!ALT_TOPICS.includes(t)) return false;
  if (t === 'family') return f.sibling === '一人っ子';
  return !(t === 'pet' ? f.petOwned : t === 'drink' ? f.drinks : f.doesSport);
}
const firstSentence = (s: string) => splitSentences(s, 9)[0] ?? s;

// 相手の文
// 2026-11-23：どの文も言い回しを複数持つ（第2版のトークパック）。パックにない話題は汎用文
function npcAsk(x: Ctx, t: TopicId, rng: Rng): string {
  const i = rng.int(0, 1);
  x.c.flags.askIdx = i;
  x.c.flags.ansJ = -1;
  const v = pickV(x.np?.ask[t]?.[i], rng);
  return v ? npcText(x, v) : QA[t][i % QA[t].length].q(x.me);
}
function npcAnswer(x: Ctx, t: TopicId, rng: Rng): string {
  const i = Number(x.c.flags.askIdx ?? 0) % 2;
  const alt = usesAlt(t, x.them);
  const v = pickV((alt ? x.np?.answer_alt?.[t] : x.np?.answer[t])?.[i], rng);
  if (v) return npcText(x, v);
  const prev = Number(x.c.flags.ansJ ?? -1);
  const j = prev === 0 ? 1 : prev === 1 ? 0 : rng.int(0, 1);
  x.c.flags.ansJ = j;
  return QA[t][i % QA[t].length].a[j](x.them);
}
function npcDetail(x: Ctx, t: TopicId, rng: Rng): string {
  const i = Number(x.c.flags.digIdx ?? rng.int(0, 1)) % 2;
  const alt = usesAlt(t, x.them);
  const v = pickV((alt ? x.np?.detail_alt?.[t] : x.np?.detail[t])?.[i], rng);
  return v ? npcText(x, v) : DIGS[t][i % DIGS[t].length].a(x.them);
}
/**
 * 受け止めの一言。半分は、こちらの答えの中身に触れる（「焼肉いいですね！」。2026-11-23 会話の自然さ）。
 * 飼っていない・飲まない話題は中身に触れない
 */
function npcReact(x: Ctx, t: TopicId, rng: Rng): string {
  const fact = FACT_OF_TOPIC[t];
  // 音楽・映画の話題は、音楽の質問（ask[0]）のときだけ中身に触れる
  const factOk = fact && !usesAlt(t, x.me) && !(t === 'media' && Number(x.c.flags.askIdx ?? 0) % 2 === 1);
  const rf = factOk ? pickV(x.np?.react_fact?.[t], rng) : undefined;
  if (rf && rng.chance(0.55)) return npcText(x, rf);
  const v = pickV(x.np?.react[t], rng);
  return v ? firstSentence(npcText(x, v)) : rng.pick(REACT);
}
/** 話題を変える前置き（「そういえば、」など）。付けないときは空文字 */
function npcBridge(x: Ctx, rng: Rng): string {
  if (!rng.chance(0.35)) return '';
  return pickV(x.np?.bridge, rng) ?? rng.pick(['そういえば、', 'ちなみに、', '話変わるんですけど、']);
}
/** 前置きと質問をつなぐ（前置きが「、」で終わるなら続けて書く） */
function joinBridge(bridge: string, ask: string): string {
  if (!bridge) return ask;
  return /、$/.test(bridge) ? `${bridge}${ask}` : `${bridge} ${ask}`;
}

// プレイヤーの文（選択肢に出すので、状態を変えずに文だけ作る）
function myAsk(x: Ctx, t: TopicId, i: number, rng?: Rng): string {
  const vs = x.pp?.ask[t]?.[i];
  if (vs && vs.length) return myText(x, rng ? rng.pick(vs) : vs[0]);
  return QA[t][i % QA[t].length].q(x.them);
}
function myDig(x: Ctx, t: TopicId, i: number, rng?: Rng): string {
  const vs = x.pp?.dig[t]?.[i];
  if (vs && vs.length) return myText(x, rng ? rng.pick(vs) : vs[0]);
  return DIGS[t][i % DIGS[t].length].q(x.them);
}
/** 自分の答えの言い回し（パックにあればすべて。なければ汎用文2つ） */
function myAnswers(x: Ctx, t: TopicId, i: number): string[] {
  const vs = x.pp?.answer[t]?.[i % 2];
  if (vs && vs.length) return t === 'hobby' && vs.length > 2 ? vs : vs;
  return [0, 1].map((j) => bang(QA[t][i % QA[t].length].a[j](x.me)));
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
/** 返信の部品。prio が高いものほど残す（3＝答え・質問、2＝遅れたお詫び、1＝受け止め、0＝好意の一言） */
interface Piece { text: string; prio: number }

/**
 * 相手のふつうの会話のメッセージ（chat_normal）。直前の自分の行動に反応する。
 * max：1回の返信の吹き出しの数の上限。部品の大事さの順に残す（2026-11-23：お詫びで答えが消えないように）
 */
export function npcConvMessage(state: GameState, c: Contact, npc: Npc, max = 3): string {
  return withRng(state, (rng) => {
    const x = ctxOf(state, c, npc);
    const myName = san(character(state).name);
    const t = (c.flags.convTopic as TopicId | undefined) ?? 'hobby';
    const act = c.flags.myAct as string | undefined;
    c.flags.myAct = '';
    const warm = attentiveness(state, npc); // 格上のこちらには親身（聞き返しや気づかいが増える）
    const P = (text: string, prio: number): Piece => ({ text, prio });
    let parts: Piece[];
    if (act === 'answer' || act === 'answer_casual' || act === 'selftalk') {
      // 質問に答えた → 相手は受け止めて、次の話題を聞く（ときどき「そういえば、」と前置き）
      const nt = nextTopic(c, rng);
      parts = [P(npcReact(x, t, rng), 1), P(joinBridge(npcBridge(x, rng), npcAsk(x, nt, rng)), 3)];
      setConv(c, nt, 'ask');
    } else if (act === 'answer_ask') {
      // こちらが答えて聞き返した → 相手も同じ話題で答え、半分は次の話題を聞く
      parts = [P(npcReact(x, t, rng), 1), P(npcAnswer(x, t, rng), 3)];
      if (rng.chance(0.5)) {
        const nt = nextTopic(c, rng);
        parts.push(P(joinBridge(npcBridge(x, rng), npcAsk(x, nt, rng)), 3));
        setConv(c, nt, 'ask');
      } else setConv(c, t, 'tell');
    } else if (act === 'ask') {
      // こちらが質問した → 相手が答え（深掘りなら詳しく）、6割は同じことを聞き返す
      parts = [P(c.flags.myQ === 'dig' ? npcDetail(x, t, rng) : npcAnswer(x, t, rng), 3)];
      if (rng.chance(0.6 + 0.35 * warm)) { parts.push(P(`${myName}は？`, 3)); setConv(c, t, 'ask'); c.flags.askBack = true; } else setConv(c, t, 'tell');
    } else if (act === 'change') {
      // こちらが相手のプロフィールから話題を出した → 相手の趣味の話。「見てくれたんですね」は最初の1回だけ
      parts = [];
      if (!c.flags.profileThanked) {
        c.flags.profileThanked = true;
        parts.push(P(x.np ? npcText(x, rng.pick(x.np.profile_change)) : rng.pick(['覚えててくれたんですね！', 'そうなんです！']), 1));
      }
      parts.push(P(npcAnswer(x, 'hobby', rng), 3));
      setConv(c, 'hobby', 'tell');
    } else if ((act === 'aizuchi' && c.flags.convAct === 'ask') || act === 'dodge') {
      // 質問に相槌だけ・はぐらかした → かみ合わず、相手は別の話題へ（少し冷める）
      c.interest -= 3;
      const nt = nextTopic(c, rng);
      parts = [P(x.np ? rng.pick(x.np.aizuchi_back) : rng.pick(['あ、はい笑', 'そうですよね笑', '笑']), 2), P(npcAsk(x, nt, rng), 3)];
      setConv(c, nt, 'ask');
    } else {
      // 会話の始まり・相槌のあと → 相手から質問する
      const nt = c.flags.convTopic ? nextTopic(c, rng) : 'holiday';
      parts = [P(npcAsk(x, nt, rng), 3)];
      setConv(c, nt, 'ask');
    }
    c.flags.myQ = '';
    // 親身な相手は、気づかいや好意のひとことを添える
    if (warm > 0 && rng.chance(0.6 * warm)) {
      parts.unshift(P(x.np ? npcText(x, rng.pick(x.np.warm)) : rng.pick([`${myName}と話してると楽しいです☺️`, `${myName}のこと、もっと知りたいです！`, 'お仕事おつかれさまです！', `${myName}って話しやすいですね笑`]), 0));
    }
    // 返信が2日以上あいたら、まず一言あやまる（2026-11-23 会話の自然さ）。お詫びは1文にする
    const lastMe = [...c.messages].reverse().find((m) => m.from === 'me');
    if (lastMe && state.day - lastMe.day >= 2 && rng.chance(0.6)) {
      parts.unshift(P(firstSentence(pickV(x.np?.late_sorry, rng) ?? rng.pick(['返信遅くなってすみません！', 'お返事遅くなりました🙇', 'バタバタしてて遅くなっちゃいました、すみません！'])), 2));
    }
    // 吹き出しの数が上限を超えたら、大事でない部品から落とす（同じ大事さなら前のものから）
    const count = (ps: Piece[]) => ps.reduce((n, q) => n + splitSentences(bang(q.text), 99).length, 0);
    while (parts.length > 1 && count(parts) > max) {
      const low = Math.min(...parts.map((q) => q.prio));
      if (low >= 3) break;
      parts.splice(parts.findIndex((q) => q.prio === low), 1);
    }
    return splitSentences(parts.map((q) => bang(q.text)).join(' '), max).join(' ');
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
      const cs = pickV(x.np?.curt_short[act === 'change' ? 'hobby' : t], rng);
      if (cs) return npcText(x, cs);
      const them = x.them;
      const short: Record<TopicId, string> = {
        hobby: `${them.hobbies[0]}とかですね`, work: 'ふつうですね', holiday: '家にいることが多いです', food: `${them.food}とかです`,
        area: `${them.area}です`, travel: '最近は行ってないです', weekend: 'まだ決めてないです', app: '最近です',
        family: `${them.sibling}です`, pet: them.petOwned ? `${them.pet}がいます` : '飼ってないです', drink: them.drinks ? 'たまに飲みます' : '飲まないです',
        media: `${them.music}とかです`, sports: them.doesSport ? `${them.sport}です` : 'してないです', cooking: 'たまにします', school: `${them.club}でした`, date: `${them.dateplace}とかですかね`,
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

const GROUP: Record<TopicId, string> = {
  hobby: '趣味', work: '仕事', holiday: '休日', food: '食べ物', area: '住まい', travel: '旅行', weekend: '最近・週末', app: 'アプリ',
  family: '家族', pet: 'ペット・動物', drink: 'お酒', media: '音楽・映画', sports: '運動', cooking: '料理', school: '学生時代', date: '行きたい場所',
};

/** はい・いいえで答える質問か（「何・どこ・いつ・どんな…」を含まない質問） */
export function isYesNoQuestion(text: string): boolean {
  return isQuestionText(text) && !/(何|なに|なん|どこ|いつ|誰|だれ|どんな|どう|どの|どれ|なぜ|どうして|いくつ|どのくらい|どれくらい)/.test(text);
}
function isQuestionText(text: string): boolean {
  return /[？?][\p{Extended_Pictographic}️‍笑〜ー]*$/u.test(text.trim());
}
/** 会話の流れの外から来た質問（挨拶・乗り気の追い質問など）の話題を、文面から推し量る */
function guessTopic(text: string): { t: TopicId; i: number } {
  if (/兄弟|姉妹|ご家族|実家/.test(text)) return { t: 'family', i: /実家|仲/.test(text) ? 1 : 0 };
  if (/ペット|犬派|猫派|動物/.test(text)) return { t: 'pet', i: /派/.test(text) ? 1 : 0 };
  if (/お酒|飲み|飲ま/.test(text)) return { t: 'drink', i: /お店/.test(text) ? 1 : 0 };
  if (/音楽|映画|ドラマ/.test(text)) return { t: 'media', i: /映画|ドラマ/.test(text) ? 1 : 0 };
  if (/運動|スポーツ|ジム/.test(text)) return { t: 'sports', i: /観戦/.test(text) ? 1 : 0 };
  if (/料理|自炊|得意料理/.test(text)) return { t: 'cooking', i: /得意/.test(text) ? 1 : 0 };
  if (/部活|学生/.test(text)) return { t: 'school', i: /部活/.test(text) ? 0 : 1 };
  if (/行ってみたい|まったり|アクティブ/.test(text)) return { t: 'date', i: /まったり|アクティブ/.test(text) ? 1 : 0 };
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
  // 答え（詳しく＝長い方、適当＝短い方の1文目）。言い回しが複数あれば、毎回その中から2つ選ぶ（2026-11-23）
  const all = myAnswers(x, t, i);
  const two = all.length > 2 ? rng.shuffle([...all]).slice(0, 2) : all;
  const variants = [...two].sort((a, b) => b.length - a.length);
  const selfTalk = mode === 'question' && i === 0 ? pickV(x.pp?.self_talk[t], rng) : undefined;
  const detailed = selfTalk ?? variants[0];
  // はい・いいえの質問に適当に答えるなら「そうですね」
  const casual = yesNo && inferred ? rng.pick(['そうですね！', 'そうですね笑']) : firstSentence(variants[variants.length - 1]);
  // プロフィールを見て聞ける質問
  const questions: TalkQuestion[] = [];
  if (mode === 'talk' && c.flags.convUsed) {
    for (const k of [0, 1]) if (!asked.has(`d:${t}:${k}`)) questions.push({ key: `d:${t}:${k}`, group: `いまの話（${GROUP[t]}）`, text: myDig(x, t, k, rng) });
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
    // 会話の途中で話題を変えるときは、ときどき「そういえば、」と前置きする（2026-11-23）
    const bridge = mode === 'talk' && c.flags.convUsed && rng.chance(0.4) ? (pickV(x.pp?.bridge, rng) ?? rng.pick(['そういえば、', 'ちなみに、', '話変わるんですけど、'])) : '';
    fromProfile.push({ key: `a:${topic}:${k}`, group: GROUP[topic], text: joinBridge(bridge, myAsk(x, topic, k, rng)) });
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
