import type { RngState } from './rng';

export type Gender = 'M' | 'F';
/** 金額は内部ですべて「円」の整数。万円表示はUI側でのみ行う。 */
export type Yen = number;
/** 開始日を0とした経過ゲーム日。1か月=30日、1年=12か月=360日。 */
export type Day = number;
export type Looks = 1 | 2 | 3 | 4 | 5;
/** 主人公の容姿。和樹・結衣は 3.5、蓮は 4.5（2026-11-18・21 指示）。NPC は整数のまま */
export type PlayerLooks = Looks | 3.5 | 4.5;

export type UniversityGroup = '旧帝大' | '早慶' | 'MARCH' | '日東駒専' | '大東亜帝国' | '産近甲龍';
export type Education =
  | { kind: 'university'; group: UniversityGroup; school: string; detail?: string }
  | { kind: 'vocational'; label?: string } // 専門卒（label で「高専卒」など）
  | { kind: 'highschool' }; // 高卒

export type Prefecture = '東京都' | '埼玉県' | '千葉県';
export type Smoking = 'none' | 'sometimes' | 'yes';
export type Drinking = 'none' | 'sometimes' | 'yes';
export type Marital = 'never' | 'divorced';
export type Holiday = 'weekend' | 'weekday' | 'irregular';

/** プロフィールに載る基本情報（プレイヤー・相手NPC共通） */
export interface ProfileBasics {
  areaId: string;
  smoking: Smoking;
  drinking: Drinking;
  marital: Marital;
  holiday: Holiday;
}

/** 検索の絞り込み（実際のマッチングアプリと同程度の項目） */
export interface Preference {
  ageMin: number;
  ageMax: number;
  /** 居住地（都県）。空なら首都圏すべて */
  prefectures: Prefecture[];
  /** 0なら条件なし */
  heightMin: number;
  heightMax: number;
  /** 0なら年収条件なし */
  minIncomeYen: Yen;
  universityOnly: boolean;
  neverMarriedOnly: boolean;
  noChildrenOnly: boolean;
  nonSmokerOnly: boolean;
  drinking: 'any' | 'noneOrSometimes' | 'none';
  holiday: 'any' | 'weekend' | 'weekday';
  /** （廃止）顔写真がある人だけ。2026-11-08 指示で絞り込みから外した。古いセーブとの互換のため残す */
  photoOnly: boolean;
}

export interface MatchRates {
  /** 受信いいね／30日の期待件数の調整幅 */
  receivedPer30: [number, number];
  /** 未接触の相手へ送ったいいねが相互マッチになる率（基準条件） */
  sendSuccess: number;
  /** 恋愛目的の通常NPCとの初回対面後、相手が再会を望まない率 */
  postDateRejection: number;
}

export interface Constraints {
  busy?: boolean;
  childcare?: boolean;
  shiftWork?: boolean;
  livesWithParents?: boolean;
  /** 土日に急に仕事が入ることがある（健人・大輔。2026-11-09） */
  weekendWorkCalls?: boolean;
}

export interface PlayableCharacter extends ProfileBasics {
  id: string;
  gender: Gender;
  name: string;
  age: number;
  job: string;
  education: Education;
  incomeYen: Yen;
  /** 画面に出す年収の書き方（「400万円以下」など）。なければ金額 */
  incomeLabel?: string;
  heightCm: number;
  looks: PlayerLooks;
  /** 初期状態でプロフィールに顔写真を載せているか（6人だけfalse） */
  photoInitiallyVisible: boolean;
  datingExperience: '豊富' | 'あり' | '少ない' | 'なし';
  children: number;
  /** 比較条件「片道◯分以内」。郊外の人物は近くの候補が少ないため広く取る */
  baseDistanceMin: number;
  /** 見た目の好み（検索条件ではなく、本人が誰にいいねするかの傾向。1なら気にしない） */
  lookPreference: Looks;
  constraints: Constraints;
  monthlyBudgetYen: Yen;
  /** 開始時点のアプリ歴（月） */
  appHistoryMonths: number;
  /** 本人が交際開始を望む期限までの残り（月）。男性は初版で一律12。 */
  relationshipDeadlineMonths: number;
  initialPreference: Preference;
  /** 選択画面の短い説明 */
  tagline: string;
  lifeNote: string;
  /** 月あたりデートに使える日の目安（育児・シフト・多忙） */
  freeSlotsPerMonth: number;
  /** 土日に会いにくい（シフト勤務など） */
  weekendLimited: boolean;
  /** 平日の夜に疲れてアプリを開かずに寝てしまう日（週に何回・理由の候補）。2026-11-11 指示（健人・大輔） */
  tiredNights?: { perWeek: number; reasons: string[] };
  /** 平日の在宅ワークの日（週に何回）。その日にデートをすると化粧が必要でライフ −1（2026-11-11 指示：麻衣・美咲） */
  homeWorkPerWeek?: number;
  /** 土日のどちらかを埋めておく予定の候補（2026-11-11 指示：麻衣・美咲） */
  weekendPlans?: string[];
  rates: MatchRates;
  /** ゲーム開始時に読むプロローグ（段落ごと） */
  prologue?: string[];
  /** 初回デート後、将来を考える相手から「将来性がない」と断られやすくなる分（蓮。2026-11-09） */
  futureConcern?: number;
  /** 調整用：この人物のライフ損失の倍率（画面には出さない。省略時1） */
  /** 顔写真なし開始の6人だけ：公開後の値 */
  ratesPhotoPublic?: MatchRates;
  route: { hardship: string; choices: string; clearPath: string };
}

/** 相手NPCの主目的（出会う前に固定し、途中で書き換えない） */
export type Purpose =
  | 'sincere' // 誠実に交際相手を探す
  | 'ambiguous' // 比較中・気持ちが曖昧
  | 'body' // 恋人探しを装った身体目的
  | 'profit' // 食事・贈り物などの利益目的
  | 'married' // 既婚・本命ありを隠している
  | 'business' // 業者・マルチ・営業勧誘（E11）
  | 'scam' // 投資・ロマンス詐欺（E12）
  | 'sakura' // 外部のサクラサイトへ誘導（E13）
  | 'bijin'; // 美人局・第三者による恐喝（E10）

export type PortraitAssetStatus = 'not_created' | 'generated' | 'approved';

export interface NpcTraits {
  /** 会話の温かさ 0..1 */
  warmth: number;
  /** 失礼さ 0..1（E07の発生） */
  rudeness: number;
  /** 誘い・会計・調整を任せがち（E18） */
  passive: boolean;
  moneySense: 'frugal' | 'normal' | 'lavish';
  contactPref: 'low' | 'mid' | 'high';
  future: 'soon' | 'someday' | 'undecided';
  /** 相手の子ども・勤務などの制約を受け入れるか */
  acceptsConstraints: boolean;
  /** 顔が分からない相手とは会わない */
  requiresFace: boolean;
  /** 写真・年齢・職業に重大な偽装がある（E06） */
  misrepresented: boolean;
  /** 断るときの伝え方の傾向 */
  delivery: 'polite' | 'ghost' | 'block';
  /** 会計の考え方：treat＝男性NPCは自分がおごる／女性NPCはおごってほしい、more＝多め、split＝割り勘 */
  payExpectation: 'treat' | 'more' | 'split';
  /** 休日：土日型／平日型 */
  weekendFree: boolean;
}

export interface Npc extends ProfileBasics {
  id: string;
  gender: Gender;
  name: string;
  age: number;
  job: string;
  education: Education;
  incomeYen: Yen;
  heightCm: number;
  /** ゲーム設定上の外見1〜5。NPCの写真が公開されている時だけプレイヤーに表示 */
  looks: Looks;
  /** 相手NPC自身がプロフィールに顔写真を載せているか */
  profilePhotoVisible: boolean;
  /** 画像ファイル（未制作）。写真公開とは別の状態 */
  portraitAssetStatus: PortraitAssetStatus;
  /** 将来の画像参照先（安定ID） */
  futureImageRef: string;
  /** プロフィール写真（public/npc/ のファイル名）。提供素材を割り当てた男性NPCと、顔を出していない人の風景写真 */
  photo?: string;
  /** プロフィール写真がTikTok風の加工写真（実物は写真より容姿が下。ドタキャン・別人が多い） */
  filteredPhoto?: boolean;
  /** 年収を盛っている場合の本当の年収（表示は incomeYen） */
  realIncomeYen?: number;
  /** 身長をサバ読みしている男性の本当の身長（2026-11-12。166〜169cmの人の多くが170〜172cmと書く） */
  realHeightCm?: number;
  /** 医師・弁護士を偽っている場合の本当の職業（表示は job） */
  fakeTitle?: string;
  /** プロフィールに年収を書いていない（女性NPCの1割。2026-11-09） */
  incomeHidden?: '未記入' | '未記載' | '秘密';
  /** プロフィールの充実度（2026-11-23）：bare＝「よろしくお願いします」だけ、sparse＝趣味だけ、rich＝5行以上 */
  profileDepth?: 'bare' | 'sparse' | 'normal' | 'rich';
  /** 夜職フォルダの写真の相手（2026-11-09）：bar＝メシ目＋ぼったくりバーへ勧誘、meshi＝高めの店を提案し交際にはならない */
  nightWork?: 'bar' | 'meshi';
  distanceMin: number;
  hasChildren: boolean;
  hobbies: string[];
  profileText: string;
  /** 人気の分位 0..1（1が最上位） */
  popularity: number;
  prefs: {
    ageMin: number;
    ageMax: number;
    minIncomeYen: Yen;
    acceptsPartnerChildren: boolean;
    universityOnly: boolean;
    nonSmokerOnly: boolean;
    acceptsDivorced: boolean;
    /** 0なら条件なし */
    minHeight: number;
  };
  purpose: Purpose;
  traits: NpcTraits;
  /** 個人の好みの揺らぎ（平均1） */
  taste: number;
  source: 'search' | 'received';
  createdDay: Day;
}

export type Stage =
  | 'like_sent' // いいね送信、反応待ち
  | 'like_failed' // 不成立（確定）
  | 'matched' // マッチ、まだ会話なし
  | 'talking' // 双方向の会話
  | 'scheduled' // デート予定あり
  | 'dating' // 会っている（交際前）
  | 'relationship' // 交際中（表示上）
  | 'ended';

/** やり取りの場所：アプリ内／LINE／外部の有料サイト */
export type Channel = 'app' | 'line' | 'external';

export interface ChatMessage {
  day: Day;
  from: 'me' | 'them' | 'system';
  text: string;
  read?: boolean;
  channel?: Channel;
  /** 一緒に送った写真（public/npc のファイル名）。顔写真を載せたと伝えるときなど */
  image?: string;
  /** その日の届く時刻（0時からの分）。時刻が来るまで画面に出さない（2026-11-13） */
  minute?: number;
}

/** デートの感触（プレイヤーが受け取った印象。相手の本心とは一致しないことがある） */
export type Impression = 'good' | 'okay' | 'awkward' | 'bad';

export interface DateRecord {
  day: Day;
  tier: VenueTier;
  costYen: Yen;
  outcome: 'met' | 'noshow' | 'canceled' | 'cut_short' | 'incident';
  /** その日に起きたこと（画面に見えた範囲） */
  notes?: string[];
  impression?: Impression;
}

export type VenueTier = 'cafe' | 'casual' | 'dinner' | 'luxury';

export interface Relationship {
  startDay: Day;
  /** 真の交際か（偽交際なら false）。画面には出さない。 */
  genuine: boolean;
  health: number;
  /** 二人の生活・価値観の相性（内部値 0..1）。話し合いが通じるかどうかに影響 */
  compat?: number;
  /** 偽交際の決着予定日（必ずクリアの60日より前） */
  fakeResolveDay?: Day;
  phaseEventsDone: number[];
  agreedContact?: 'low' | 'mid' | 'high';
  agreedExclusive: boolean;
  burdenWeeks: number;
  unresolvedClash: boolean;
  playerUsedAppDays: number;
}

export interface Series {
  /** 系列中に既に差し引いた最大の基準損失 */
  maxLoss: number;
  depthBonusApplied: boolean;
}

export interface Contact {
  npcId: string;
  stage: Stage;
  createdDay: Day;
  sentLikeDay?: Day;
  /** 送信いいねの結果が確定する日（内部）。結果は確定日まで表示しない */
  likeResolveDay?: Day;
  likeWillMatch?: boolean;
  fromReceived: boolean;
  matchedDay?: Day;
  messages: ChatMessage[];
  /** 相手の返信予定（内部で事前決定） */
  /** minute：届く時刻（0時からの分）。送った時刻から温度に応じて決める（2026-11-14）。なければその日の始まりに届く（古い形） */
  pendingReply?: { day: Day; kind: string; willReply: boolean; expireDay: Day; minute?: number };
  /** プレイヤーが返事を書く必要があるか */
  awaitingMe: boolean;
  /** 相手からの次の話題キー */
  topic?: string;
  firstMessageSentDay?: Day;
  firstMessageQuality?: 'good' | 'template' | 'intro' | 'heavy';
  twoWay: boolean;
  exchanges: number;
  lineExchanged: boolean;
  /** 相手がプレイヤーの顔を知っているか（写真公開か対面で知る） */
  faceKnown: boolean;
  faceKnownVia?: 'photo' | 'meeting';
  /** 公開写真を初めて見た時の判定 */
  photoJudgement?: 'pass' | 'left';
  interest: number;
  /** 通常NPCの初回対面後の継続意思（1回だけ決める） */
  postDateDecision?: 'continue' | 'reject';
  rejectReason?: 'appearance' | 'chemistry' | 'conditions' | 'future';
  playerWantsMore?: boolean;
  dates: DateRecord[];
  meetings: number;
  nextDate?: { day: Day; tier: VenueTier; proposedBy: 'me' | 'them' };
  /** 進行中のデートで起きたこと（デートの終わりに DateRecord へ移す） */
  dateNotes?: string[];
  relationship?: Relationship;
  series: Series;
  /** 関係が曖昧なまま続いた日数の起点（E15） */
  ambiguousSince?: Day;
  lastKeepPenaltyDay?: Day;
  /** 返事がないまま送った確認メッセージの日付（連投判定） */
  followUps: Day[];
  spentYen: Yen;
  /** 警告サインが見えた日（少ない反応に賭けすぎの判定） */
  warningSignDay?: Day;
  endedDay?: Day;
  endedBy?: 'me' | 'them';
  endCause?: string;
  /** 確定した内部事情（結果画面でだけ解説） */
  revealed?: string;
  flags: Record<string, number | boolean | string>;
}

export type LifeCategory =
  | 'weekly' // 週次の成果不足
  | 'monthly' // 月末の継続疲れ・歴・期限
  | 'budget' // 予算超過
  | 'event' // 個別イベント
  | 'depth' // 関係の深さによる加算
  | 'fatigue' // 比較疲れ等
  | 'talk' // トークで使ったライフ（雑談・電話・会いたいと伝える）
  | 'recovery';

export interface LifeEntry {
  day: Day;
  delta: number;
  category: LifeCategory;
  eventId?: string;
  npcId?: string;
  note: string;
  /** 系列差分精算の内訳など */
  detail?: string;
}

export type MoneyCategory = 'fee' | 'date' | 'transport' | 'prep' | 'boost' | 'gift' | 'special' | 'life';

export interface MoneyEntry {
  day: Day;
  yen: Yen;
  category: MoneyCategory;
  npcId?: string;
  note: string;
  /** 犯罪・詐欺などの特殊損失（予算超過の計算から除外） */
  special: boolean;
  /** プレイヤーが選んだ高額支出 */
  playerChosenHigh?: boolean;
}

export interface Choice {
  id: string;
  label: string;
  sub?: string;
  /** 送る文面そのもの（トークの選択肢。2026-11-11 第4段階） */
  message?: boolean;
}

export interface PendingEvent {
  uid: string;
  kind: string;
  npcId?: string;
  day: Day;
  title: string;
  /** 場面の文章・会話 */
  lines: { who: 'narration' | 'them' | 'me' | 'system'; text: string }[];
  choices: Choice[];
  data?: Record<string, number | string | boolean>;
  /** 場面で見せる画像（public/npc のファイル名）。「写真と違う」で実際の顔を見せる。label は画像の下の見出し（既定は「実際」） */
  image?: { file: string; caption: string; label?: string };
  /** その日の見える時刻（0時からの分）。なければすぐ見える（2026-11-13） */
  at?: number;
}

/** ロック画面の通知（2026-11-13） */
export interface Notice {
  id: string;
  day: Day;
  minute: number;
  /** 通知元（アプリ・カテゴリ） */
  app: string;
  icon: string;
  from: string;
  text: string;
  npcId?: string;
  /** タップしたときに開く画面 */
  target?: 'talk' | 'likes' | 'date' | 'app';
  read?: boolean;
  /** 種類（2026-11-14）。like・match・msg・event はマチアプの欄、work・sns はほかのアプリの欄、life はプライベートの出来事 */
  kind?: NoticeKind;
  /** ロックを解除したら消える（2026-11-14） */
  cleared?: boolean;
}

export type NoticeKind = 'like' | 'match' | 'msg' | 'event' | 'work' | 'sns' | 'life';

export interface FeedItem {
  day: Day;
  text: string;
  npcId?: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface WeekTracker {
  weekIndex: number;
  sendsConcluded: number;
  matchesFromConcluded: number;
  matchesThisWeek: number;
  firstMessagesSent: number;
  twoWayStarted: number;
  e02: { npcId: string; day: Day }[];
  activeConversationIds: string[];
  wasResting: boolean;
  /** その週に相手から届いたメッセージ数（停滞の判定。古いセーブには無い） */
  repliesReceived?: number;
  /** その週に会った回数（同上） */
  meetings?: number;
}

export interface Stats {
  likesSent: number;
  likesSentTopPopular: number;
  likesSentMatched: number;
  receivedTotal: number;
  receivedReviewed: number;
  receivedAccepted: number;
  matches: number;
  conversations: number;
  dates: number;
  firstDates: number;
  firstDateRejections: number;
  relationships: number;
  photoRequestDrops: number;
  photoJudgeLeft: number;
  faceUnknownFirstDates: number;
  appearanceEndings: number;
  candidateShortageDays: number;
  strictFilterDays: number;
  monthlySpend: { month: number; spend: Yen; budget: Yen }[];
  maxActiveConversations: number;
  restWeeks: number;
}

export interface PlayerState {
  age: number;
  /** プライベートの出来事の効果（その日まで有効） */
  effects?: { busyUntil?: Day; sickUntil?: Day; kidUntil?: Day; closedUntil?: Day; anxiousUntil?: Day; seasonUntil?: Day; tiredDay?: Day; tiredWhy?: string };
  /** その月だけ活動予算を増減する（ボーナスなど） */
  budgetAdjust?: { month: number; yen: number };
  /** 男性の有料会員の料金（料金改定で変わる。未設定なら仕様の4,000円） */
  feeYen?: number;
  privateEventsDone?: string[];
  lastPrivateEventDay?: Day;
  /** 男性の有料会員の期限（この日の前日まで有効）。未加入なら undefined */
  memberUntil?: Day;
  photoVisible: boolean;
  photoPublishedDay?: Day;
  prefs: Preference;
  /** 探索期間として積み上がったアプリ歴（日）。開始前の歴を含む */
  appHistoryDays: number;
  deadlineMonths: number;
  deadlineExtended: boolean;
}

export interface ReceivedState {
  /** これまでに届いた受信いいねの総数 */
  total: number;
  /** まだ確認していない件数 */
  unseen: number;
  /** プロフィールを生成済みで確認待ちのNPC */
  queue: string[];
  /** 今月の期待件数（30日ごとに幅の中から決める） */
  monthLambda: number;
}

export interface GameState {
  schema: number;
  dataVersion: string;
  seed: string;
  rng: RngState;
  characterId: string;
  gender: Gender;
  day: Day;
  life: number;
  status: 'playing' | 'cleared' | 'gameover';
  player: PlayerState;
  npcs: Record<string, Npc>;
  npcCounter: number;
  /** このプレイで使った写真素材（1枚につき1人） */
  usedPhotos?: string[];
  contacts: Record<string, Contact>;
  received: ReceivedState;
  /** dryKey：写真の合う相手が見つからなかった時の条件（同じ条件・同じ残り素材では探し直さない） */
  search: { results: string[]; generatedDay: Day; exhaustedSeen: number; dryKey?: string };
  likesLeft: number;
  /** その日のスキップ残り（古いセーブには無い） */
  skipsLeft?: number;
  boostUntil?: Day;
  monthSpend: Yen;
  ledger: LifeEntry[];
  money: MoneyEntry[];
  recovery: {
    restsUsed: number;
    firstConversation: boolean;
    firstMutualDate: boolean;
    firstRelationship: boolean;
    milestone30: boolean;
    milestone60: boolean;
  };
  week: WeekTracker;
  pending: PendingEvent[];
  feed: FeedItem[];
  stats: Stats;
  restingUntil?: Day;
  /** 現在、交際中（表示上）の相手 */
  partnerId?: string;
  eventLog: { day: Day; eventId: string; npcId?: string; note: string }[];
  flags: Record<string, number | boolean | string>;
  uidCounter: number;
  result?: ResultSummary;
  /** その日の時刻（0時からの分）。古いセーブには無い（19:00 として扱う。2026-11-13） */
  clock?: number;
  /** 表示中の画面：アプリ／ロック画面 */
  screen?: 'app' | 'lock';
  /** ロック画面の通知 */
  notices?: Notice[];
  /** 通知の設定（オフにした種類はロック画面に出さない。既定はどちらもオン。2026-11-14） */
  notify?: { likes?: boolean; talk?: boolean };
  /** トークに集中するモード（2026-11-15）：いいね・マッチの通知を出さず、ロック画面はメッセージか場面が来るまで早送り */
  focusMode?: boolean;
}

export interface FeedbackItem {
  type: string;
  title: string;
  facts: string[];
}

export interface ResultSummary {
  outcome: 'cleared' | 'gameover';
  day: Day;
  partnerId?: string;
  totalSpend: Yen;
  specialLoss: Yen;
  lossByCategory: Record<string, number>;
  lossByEvent: Record<string, number>;
  primary?: FeedbackItem;
  secondary: FeedbackItem[];
  playerChoices: string[];
  externalFactors: string[];
  suggestions: string[];
  headline: string;
}
