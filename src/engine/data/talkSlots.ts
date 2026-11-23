// トークの質問の型（第3・4段階、2026-11-11）。生成スクリプト（scripts/talk）とゲームが同じ一覧を使う。
// 話題ごとに「最初の質問」2つと「深掘りの質問」2つ。人格テンプレ（相手）とプレイヤー20人は、
// それぞれの言い回しと答えをこの番号で持つ。番号の意味を変えるときは、トークパックを作り直す。

// 2026-11-23：質問項目を8→16に増やした（家族・ペット・お酒・音楽や映画・運動・料理・学生時代・理想のデート）。
// 古いトークパック（8話題）にない話題は、conversation.ts の汎用文で話す。
export type TopicId = 'hobby' | 'work' | 'holiday' | 'food' | 'area' | 'travel' | 'weekend' | 'app'
  | 'family' | 'pet' | 'drink' | 'media' | 'sports' | 'cooking' | 'school' | 'date';
export const TOPICS: TopicId[] = ['hobby', 'work', 'holiday', 'food', 'area', 'travel', 'weekend', 'app',
  'family', 'pet', 'drink', 'media', 'sports', 'cooking', 'school', 'date'];
/** 2026-11-23 に増やした話題 */
export const NEW_TOPICS: TopicId[] = ['family', 'pet', 'drink', 'media', 'sports', 'cooking', 'school', 'date'];
/** 相手の事情で答え方が2通りになる話題（一人っ子・飼っていない・飲まない・運動していない）。answer_alt・detail_alt に入れる */
export const ALT_TOPICS: TopicId[] = ['family', 'pet', 'drink', 'sports'];

export interface SlotDef {
  /** 質問の意味（生成AIへの指示と、検証用） */
  meaning: string;
  /** 言い回しの例（生成がない時の文面にも使う） */
  example: string;
}

export const ASK_SLOTS: Record<TopicId, [SlotDef, SlotDef]> = {
  hobby: [
    { meaning: '相手の趣味（{their_hobby}）をよくするのか、頻度を聞く', example: 'プロフィールの{their_hobby}、気になってました！よくするんですか？' },
    { meaning: '相手の趣味（{their_hobby}）のどんなところが好きか聞く', example: '{their_hobby}が好きなんですね。どんなところが好きなんですか？' },
  ],
  work: [
    { meaning: '仕事はどんな感じか・忙しいか聞く', example: 'お仕事はどんな感じですか？忙しいですか？' },
    { meaning: '平日は何時くらいまで仕事か聞く', example: 'お仕事って、平日は何時くらいまでなんですか？' },
  ],
  holiday: [
    { meaning: '休みの日は何をしていることが多いか聞く', example: '休みの日は何してることが多いですか？' },
    { meaning: '休みの日は家派か外派か聞く', example: 'お休みの日って、家派ですか？外派ですか？' },
  ],
  food: [
    { meaning: '好きな食べ物を聞く', example: '好きな食べ物ってなんですか？' },
    { meaning: '最近おいしかったお店があるか聞く', example: '最近おいしかったお店とかあります？' },
  ],
  area: [
    { meaning: 'どのあたりに住んでいるか聞く', example: 'どのへんに住んでるんですか？' },
    { meaning: '地元（出身）はどこか聞く', example: '地元ってどこなんですか？' },
  ],
  travel: [
    { meaning: '最近どこか旅行に行ったか聞く', example: '最近どこか旅行行きました？' },
    { meaning: '行ってよかった旅行先を聞く', example: '行ってよかった旅行先ってあります？' },
  ],
  weekend: [
    { meaning: '今週末の予定を聞く', example: '今週末は何か予定あるんですか？' },
    { meaning: '最近ハマっていることを聞く', example: '最近ハマってることってあります？' },
  ],
  app: [
    { meaning: 'このアプリをいつごろから使っているか聞く', example: 'このアプリって、いつごろから使ってるんですか？' },
    { meaning: 'アプリで実際に会ったことがあるか聞く', example: 'アプリで実際に会ったことってあります？' },
  ],
  family: [
    { meaning: '兄弟姉妹がいるか聞く', example: 'ご兄弟っているんですか？' },
    { meaning: '家族とは仲がいいか・実家にはよく帰るか聞く', example: 'ご家族とは仲いいですか？実家にはよく帰るんですか？' },
  ],
  pet: [
    { meaning: 'ペットを飼っているか聞く', example: 'ペットって飼ってます？' },
    { meaning: '犬派か猫派か聞く', example: '犬派ですか？猫派ですか？' },
  ],
  drink: [
    { meaning: 'お酒は飲むか聞く', example: 'お酒って飲まれます？' },
    { meaning: '外で飲むのと家で飲むのとどちらが多いか、どんなお店が好きか聞く', example: '飲みに行くなら、どんなお店が好きですか？' },
  ],
  media: [
    { meaning: 'よく聴く音楽を聞く', example: '普段どんな音楽聴いてるんですか？' },
    { meaning: '最近見た映画やドラマでよかったものを聞く', example: '最近見た映画とかドラマで、よかったのあります？' },
  ],
  sports: [
    { meaning: '何か運動やスポーツをしているか聞く', example: '何か運動とかしてます？' },
    { meaning: 'スポーツ観戦はするか聞く', example: 'スポーツ観戦とかはしますか？' },
  ],
  cooking: [
    { meaning: '料理・自炊はするか聞く', example: '料理ってします？' },
    { meaning: '得意な料理を聞く', example: '得意料理ってなんですか？' },
  ],
  school: [
    { meaning: '学生時代に部活をしていたか聞く', example: '学生時代って、部活とかやってました？' },
    { meaning: '学生時代はどんな学生だったか聞く', example: '学生のころって、どんな感じだったんですか？' },
  ],
  date: [
    { meaning: '休みの日に行ってみたい場所・デートで行きたい場所を聞く', example: '今行ってみたいところってあります？' },
    { meaning: '一緒に過ごすなら、まったり派かアクティブ派か聞く', example: '休みの日に誰かと出かけるなら、まったり派ですか？アクティブ派ですか？' },
  ],
};

/** 深掘りの質問（相手が話したことに、もう一歩聞く） */
export const DIG_SLOTS: Record<TopicId, [SlotDef, SlotDef]> = {
  hobby: [
    { meaning: '趣味（{their_hobby}）を始めたきっかけを聞く', example: '{their_hobby}って、始めたきっかけは何だったんですか？' },
    { meaning: '趣味（{their_hobby}）のおすすめを聞く', example: '{their_hobby}で、おすすめってあります？' },
  ],
  work: [
    { meaning: '仕事でやりがいを感じるときを聞く', example: 'どんなときにやりがいを感じるんですか？' },
    { meaning: '休みはちゃんと取れているか聞く', example: 'お休みはちゃんと取れてますか？' },
  ],
  holiday: [
    { meaning: '最近の休みで一番楽しかったことを聞く', example: '最近の休みで一番楽しかったのって何ですか？' },
    { meaning: '家にいるときは何をしているか聞く', example: '家ではなにしてるんですか？' },
  ],
  food: [
    { meaning: '好きな食べ物（{their_food}）でよく行くお店があるか聞く', example: '{their_food}、よく行くお店あるんですか？' },
    { meaning: '好きな食べ物（{their_food}）はどんなのが好きか聞く', example: '{their_food}って、どんなのが好きなんですか？' },
  ],
  area: [
    { meaning: '住んでいるところ（{their_area}）のおすすめのお店を聞く', example: '{their_area}って、おすすめのお店とかあります？' },
    { meaning: '住んでいるところ（{their_area}）は住みやすいか聞く', example: '{their_area}って住みやすいですか？' },
  ],
  travel: [
    { meaning: '旅行先（{their_place}）で何が一番よかったか聞く', example: '{their_place}、何が一番よかったですか？' },
    { meaning: '旅行先（{their_place}）のおすすめを聞く', example: '{their_place}、行ってみたいんです。おすすめあります？' },
  ],
  weekend: [
    { meaning: '週末の予定について、どこか行くのか聞く', example: 'どこか行くんですか？' },
    { meaning: 'ハマっていることについて、どれくらいハマっているか聞く', example: 'どれくらいハマってるんですか？笑' },
  ],
  app: [
    { meaning: 'アプリを始めたきっかけを聞く', example: '始めたきっかけって何だったんですか？' },
    { meaning: 'アプリでやり取りしてみてどうか聞く', example: '実際やってみてどうですか？' },
  ],
  family: [
    { meaning: '兄弟とはどんな関係か（仲がいいか・よく連絡するか）聞く', example: '兄弟とは仲いいんですか？' },
    { meaning: '実家はどんな雰囲気か聞く', example: '実家ってにぎやかな感じですか？' },
  ],
  pet: [
    { meaning: '飼っている動物（好きな動物）の名前やかわいいところを聞く', example: 'どんなところがかわいいんですか？' },
    { meaning: '動物と触れ合えるところ（動物カフェ・動物園など）に行くか聞く', example: '動物カフェとか行ったりします？' },
  ],
  drink: [
    { meaning: '好きなお酒（{their_drink}）の、おすすめや飲み方を聞く', example: '{their_drink}って、どういうのが好きなんですか？' },
    { meaning: 'お酒を飲むと変わるタイプか聞く', example: 'お酒飲むと変わるタイプですか？笑' },
  ],
  media: [
    { meaning: 'よく聴く音楽のジャンル（{their_music}）のおすすめを聞く', example: '{their_music}で、おすすめってあります？' },
    { meaning: 'ライブや映画館などに行くか聞く', example: 'ライブとか映画館にも行ったりするんですか？' },
  ],
  sports: [
    { meaning: 'している運動（{their_sport}）をどのくらいの頻度でしているか聞く', example: '{their_sport}って、どれくらいの頻度でしてるんですか？' },
    { meaning: '運動を続けるコツ・始めたきっかけを聞く', example: '続けるコツとかあります？' },
  ],
  cooking: [
    { meaning: '得意な料理（{their_dish}）の作り方のこだわりを聞く', example: '{their_dish}、こだわりとかあるんですか？' },
    { meaning: '料理を作るのは平日か休みの日か聞く', example: '作るのは休みの日が多いですか？' },
  ],
  school: [
    { meaning: '部活（{their_club}）の思い出を聞く', example: '{their_club}って、きつかったですか？' },
    { meaning: '学生時代の友達と今も会うか聞く', example: '学生時代の友達とは、今も会ったりします？' },
  ],
  date: [
    { meaning: '行きたい場所（{their_dateplace}）のどんなところが好きか聞く', example: '{their_dateplace}、いいですね！どんなところが好きなんですか？' },
    { meaning: '最近行ってよかったお出かけ先を聞く', example: '最近行ってよかったお出かけ先ってあります？' },
  ],
};

/**
 * 差し込みの名前（名詞だけ。助詞が崩れないよう「{hobby}が好き」「{hobby}の日」のように使う）
 * - 相手（NPC）の材料：{hobby} {hobby2} {food} {area} {place} {job} {months} {hometown}
 *   2026-11-23 追加：{sibling}（「一人っ子」「姉が1人いる末っ子」など。「{sibling}です」で使う）{pet}（動物の名前）{drink}（好きなお酒）
 *   {music}（よく聴く音楽のジャンル）{show}（よく見る映画・ドラマのジャンル）{sport}（している運動）{dish}（得意な料理）{club}（学生時代の部活）{dateplace}（行ってみたい場所）
 * - プレイヤーが相手のことを聞くとき・相手の答えを受け止めるとき：{their_hobby} {their_food} {their_area} {their_place}
 *   2026-11-23 追加：{their_job} {their_pet} {their_drink} {their_music} {their_show} {their_sport} {their_dish} {their_club} {their_dateplace}
 * - 名前：{name}（相手の名前。「{name}さん」と書く）
 */
export const NPC_FACT_KEYS = ['hobby', 'hobby2', 'food', 'area', 'place', 'job', 'months', 'hometown', 'sibling', 'pet', 'drink', 'music', 'show', 'sport', 'dish', 'club', 'dateplace'] as const;
export const THEIR_KEYS = ['their_hobby', 'their_food', 'their_area', 'their_place', 'their_job', 'their_pet', 'their_drink', 'their_music', 'their_show', 'their_sport', 'their_dish', 'their_club', 'their_dateplace'] as const;
export const SLOT_KEYS = [...NPC_FACT_KEYS, ...THEIR_KEYS, 'name'] as const;

/** 話題ごとの「相手の答えの中身」の差し込み（受け止めの react_fact で使う。ないものは中身に触れない受け止めだけ） */
export const FACT_OF_TOPIC: Partial<Record<TopicId, (typeof THEIR_KEYS)[number]>> = {
  hobby: 'their_hobby', work: 'their_job', food: 'their_food', area: 'their_area', travel: 'their_place',
  // media は「音楽」の質問（ask[0]）への受け止めだけ中身に触れる（映画・ドラマの質問では触れない）
  pet: 'their_pet', drink: 'their_drink', media: 'their_music', sports: 'their_sport', cooking: 'their_dish', school: 'their_club', date: 'their_dateplace',
};

type ByTopic<T> = Record<TopicId, T>;
/** 話題によってはない（古いトークパックの8話題・まだ作っていない話題） */
type SomeTopics<T> = Partial<ByTopic<T>>;
/**
 * 人格テンプレごとの相手のセリフ（../トークパック/npc）。2026-11-23 の第2版（talk-2.0）から、
 * どの項目も言い回しを複数持つ（文字列の配列）。取り込み（build-talk-data.ts）で第1版も同じ形にそろえる。
 * ask・answer・detail は質問の番号（0・1）ごとに言い回しの配列。
 */
export interface NpcTalk {
  ask: SomeTopics<[string[], string[]]>;
  answer: SomeTopics<[string[], string[]]>;
  detail: SomeTopics<[string[], string[]]>;
  /** 一人っ子・飼っていない・飲まない・運動していない相手の答え（ALT_TOPICS だけ） */
  answer_alt?: SomeTopics<[string[], string[]]>;
  detail_alt?: SomeTopics<[string[], string[]]>;
  react: SomeTopics<string[]>;
  /** 相手（プレイヤー）の答えの中身に触れる受け止め（{their_food} など。FACT_OF_TOPIC の差し込み） */
  react_fact?: SomeTopics<string[]>;
  react_shared: string[];
  curt_one: string[];
  curt_short: SomeTopics<string[]>;
  disclose: string[];
  match: string[];
  aizuchi_back: string[];
  profile_change: string[];
  warm: string[];
  invite_accept: string[];
  invite_busy: string[];
  /** 話題を変えるときの前置き（「そういえば、」など。後ろに質問が続く） */
  bridge?: string[];
  /** 返信が遅れたときの一言 */
  late_sorry?: string[];
}
/** プレイヤー20人の答えと言い回し（../トークパック/player）。第2版から言い回しは配列 */
export interface PlayerTalk {
  hobbies: [string, string];
  food: string;
  place: string;
  hometown: string;
  /** 2026-11-23 追加の材料（相手の受け止めの差し込み {their_pet} などに使う） */
  sibling?: string;
  pet?: string;
  drink?: string;
  music?: string;
  show?: string;
  sport?: string;
  dish?: string;
  club?: string;
  dateplace?: string;
  intro: string[];
  /** answer[話題][質問の番号] = 言い回しの配列（長いもの・短いものを混ぜる） */
  answer: SomeTopics<[string[], string[]]>;
  self_talk: SomeTopics<string[]>;
  dodge: SomeTopics<string[]>;
  ask: SomeTopics<[string[], string[]]>;
  dig: SomeTopics<[string[], string[]]>;
  aizuchi: string[];
  ask_back: string[];
  /** 自分から話題を変えるときの前置き */
  bridge?: string[];
}
