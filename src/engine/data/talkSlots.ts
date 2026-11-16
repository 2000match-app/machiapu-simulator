// トークの質問の型（第3・4段階、2026-11-11）。生成スクリプト（scripts/talk）とゲームが同じ一覧を使う。
// 話題ごとに「最初の質問」2つと「深掘りの質問」2つ。人格テンプレ（相手）とプレイヤー20人は、
// それぞれの言い回しと答えをこの番号で持つ。番号の意味を変えるときは、トークパックを作り直す。

export type TopicId = 'hobby' | 'work' | 'holiday' | 'food' | 'area' | 'travel' | 'weekend' | 'app';
export const TOPICS: TopicId[] = ['hobby', 'work', 'holiday', 'food', 'area', 'travel', 'weekend', 'app'];

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
};

/**
 * 差し込みの名前（名詞だけ。助詞が崩れないよう「{hobby}が好き」「{hobby}の日」のように使う）
 * - 相手（NPC）の材料：{hobby} {hobby2} {food} {area} {place} {job} {months}
 * - プレイヤーが相手のことを聞くとき：{their_hobby} {their_food} {their_area} {their_place}
 * - 名前：{name}（相手の名前。「{name}さん」と書く）
 */
export const SLOT_KEYS = ['hobby', 'hobby2', 'food', 'area', 'place', 'job', 'months', 'hometown', 'their_hobby', 'their_food', 'their_area', 'their_place', 'name'] as const;

type ByTopic<T> = Record<TopicId, T>;
/** 人格テンプレごとの相手のセリフ（../トークパック/npc。差し込み {hobby} など） */
export interface NpcTalk {
  ask: ByTopic<[string, string]>;
  answer: ByTopic<[string, string]>;
  detail: ByTopic<[string, string]>;
  react: ByTopic<[string, string]>;
  react_shared: string[];
  curt_one: string[];
  curt_short: ByTopic<string>;
  disclose: string[];
  match: string[];
  aizuchi_back: string[];
  profile_change: string[];
  warm: string[];
  invite_accept: string[];
  invite_busy: string[];
}
/** プレイヤー20人の答えと言い回し（../トークパック/player） */
export interface PlayerTalk {
  hobbies: [string, string];
  food: string;
  place: string;
  hometown: string;
  intro: string[];
  answer: ByTopic<[[string, string], [string, string]]>;
  self_talk: ByTopic<string>;
  dodge: ByTopic<string>;
  ask: ByTopic<[string, string]>;
  dig: ByTopic<[string, string]>;
  aizuchi: string[];
  ask_back: string[];
}
