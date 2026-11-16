// 仕様v0.3の数値（§2・§7・§8・§9）と、仕様にない仮置き値。
// SPEC_ が付くものは仕様の値。TUNE_ が付くものは仮置き（docs/仮置き値.md に記録）。
import type { Purpose, VenueTier } from '../types';

export const DATA_VERSION = 'spec-v0.3/data-1';

// ── 時間 ──
export const DAYS_PER_MONTH = 30;
export const DAYS_PER_YEAR = 360;
export const DAYS_PER_WEEK = 7;
export const SPEC_CLEAR_DAYS = 60; // 仕様v0.3は90日。2026-11-03 指示で60日
export const SPEC_PHOTO_PUBLISH_MIN_DAY = 14;
export const SPEC_LIKE_WAIT_DAYS = 7;
export const SPEC_E02_WAIT_DAYS = 7;

// ── ライフ ──
/**
 * ライフの減り方の倍率（2026-11-03 指示「全体的にライフはもっと減りやすく」）。
 * 仕様v0.3の各損失値（週次・月末・出来事）にこの倍率をかけて丸めた値を使う。回復はなし。
 */
export const LOSS_SCALE = 1.1;
export const scaled = (n: number): number => Math.round(n * LOSS_SCALE);
export const SPEC_LIFE_START = 100;
export const SPEC_LIFE_MAX = 100;

// 男性：週次の成果不足（§7）
export const SPEC_MALE_WEEKLY_NO_MATCH = scaled(8); // 反応待ち終了の送信20件以上で成立0
export const SPEC_MALE_WEEKLY_NO_CONVERSATION = scaled(5); // マッチはあったが双方向の会話0
export const SPEC_FEMALE_WEEKLY_NO_MATCH = scaled(4); // E01：女性は同条件で−4
export const SPEC_WEEKLY_NO_MATCH_MIN_SENDS = 20;
export const SPEC_SHALLOW_WEEKLY_CAP = scaled(12); // E01・E02の浅い無反応は合計週−12まで
export const SPEC_E02_LOSS = scaled(3);
/**
 * 停滞（2026-11-01 ユーザー指示「ライフはもっと減りやすく」）：探索中で休んでいない週に、
 * マッチ・相手からのメッセージ・対面がどれも0なら減る。いいねを控えても消耗が進むようにする。
 * E01・E02の週次と同じ「浅い無反応」として扱い、大きい方だけを採る（週の上限も共通）。
 */
export const TUNE_STAGNATION = { M: scaled(8), F: scaled(5) };

// 月末
export const SPEC_MALE_MONTHLY_SEARCH_FATIGUE = scaled(4); // 仕様v0.3は2。2026-11-01「ライフはもっと減りやすく」の指示で4
export const SPEC_RELATIONSHIP_MONTHLY_FATIGUE = scaled(1);
/**
 * 予算超過：その月の支出が予算の1倍・1.5倍・2倍を超えた時点ですぐ減る（2026-11-03 指示。以前は月末にまとめて、女性は2倍超だけ）。
 * 値は「その段階までの合計」。段階を上がるごとに差分だけ減る。
 */
export const SPEC_MALE_BUDGET_TIERS: { over: number; loss: number }[] = [
  { over: 2.0, loss: scaled(20) },
  { over: 1.5, loss: scaled(12) },
  { over: 1.0, loss: scaled(6) },
];
export const SPEC_FEMALE_BUDGET_TIERS: { over: number; loss: number }[] = [
  { over: 2.0, loss: scaled(10) },
  { over: 1.5, loss: scaled(6) },
  { over: 1.0, loss: scaled(3) },
];
/** 女性：月末時点の累計アプリ歴（月）による探索中の月次ダメージ */
export function specFemaleAppHistoryLoss(months: number): number {
  if (months < 12) return scaled(1);
  if (months < 36) return scaled(3);
  if (months < 60) return scaled(5);
  return scaled(7);
}
/** 女性：本人の交際開始希望期限による追加ダメージ（残り月） */
export function specDeadlineLoss(remainingMonths: number): number {
  if (remainingMonths > 6) return 0;
  if (remainingMonths >= 0) return scaled(2);
  return scaled(5);
}
export const SPEC_MALE_DEADLINE_MONTHS = 12;
export const SPEC_MALE_DEADLINE_OVER_LOSS = scaled(3);
export const SPEC_DEADLINE_EXTENSION_MAX_MONTHS = 6;

// 費用
export const SPEC_MALE_SERVICE_FEE_PER_30 = 4000;
export const SPEC_FEMALE_SERVICE_FEE_PER_30 = 0;

// 回復（§7）
export const SPEC_REST_RECOVERY = 10;
export const SPEC_REST_MAX = 3;
export const SPEC_FIRST_CONVERSATION_RECOVERY = 3;
export const SPEC_FIRST_MUTUAL_DATE_RECOVERY = 5;
export const SPEC_FIRST_RELATIONSHIP_RECOVERY = 10;
export const SPEC_MILESTONE_RECOVERY = 5; // 交際30日・60日

// 関係の深さによる加算（大きい方のみ、系列で1回）
export const SPEC_DEPTH_MEETINGS3 = scaled(5);
export const SPEC_DEPTH_RELATIONSHIP30 = scaled(10);

// 比較疲れ（E20）
export const SPEC_E20_6TO9 = scaled(4);
export const SPEC_E20_10PLUS = scaled(8);

// ── 相手の主目的の配合（§8）。分母は候補NPC数 ──
export const SPEC_PURPOSE_MIX: Record<'forMalePlayer' | 'forFemalePlayer', [Purpose, number][]> = {
  // 男性プレイの相手候補（女性NPC）
  forMalePlayer: [
    ['sincere', 55],
    ['ambiguous', 25],
    ['body', 3],
    ['profit', 7],
    ['married', 3],
    ['business', 2], // 業者・勧誘・投資詐欺 4% を E11/E12 で半分ずつ（仮置き）
    ['scam', 2],
    ['sakura', 2.5],
    ['bijin', 0.5],
  ],
  // 女性プレイの相手候補（男性NPC）
  forFemalePlayer: [
    ['sincere', 50],
    ['ambiguous', 20],
    ['body', 15],
    ['profit', 1],
    ['married', 6],
    ['business', 2.5], // 5% を半分ずつ（仮置き）
    ['scam', 2.5],
    ['sakura', 2.8],
    ['bijin', 0.2],
  ],
};

export const PURPOSE_LABEL: Record<Purpose, string> = {
  sincere: '誠実に交際相手を探していた',
  ambiguous: '比較中で気持ちが決まっていなかった',
  body: '恋人探しを装った身体目的だった',
  profit: '食事・贈り物などの利益目的だった',
  married: '既婚・本命ありを隠していた',
  business: '業者・勧誘目的だった',
  scam: '投資話を持ちかける詐欺目的だった',
  sakura: '外部の有料サイトへ誘導するサクラだった',
  bijin: '第三者と組んだ恐喝目的だった',
};

/** 恋愛目的の通常NPC（対面後お断り率の母集団） */
export function isNormalPurpose(p: Purpose): boolean {
  return p === 'sincere' || p === 'ambiguous';
}
/** 恋人を装う詐欺・目的偽装（クリア対象外） */
export function isDeceptivePurpose(p: Purpose): boolean {
  return !isNormalPurpose(p);
}

// ── イベントの基準損失（§9） ──
export const SPEC_LOSS = {
  E01_MALE: scaled(8),
  E01_FEMALE: scaled(4),
  E02: scaled(3),
  E03: scaled(10),
  E04_EARLY: scaled(6),
  E04_AFTER_DATE: scaled(15),
  E04_RELATIONSHIP: scaled(25),
  E05: scaled(15),
  /** 当日ドタキャン（連絡あり）。待ちぼうけより軽い（仮置き） */
  E05_NOTICE: scaled(7),
  E06: scaled(12),
  E07: scaled(12),
  E08: scaled(18),
  /** 断れない流れのメシ目（ふつうの店でおごらせて消える。2026-11-13） */
  E08_SNEAKY: scaled(12),
  /** ぼったくりバーで高額を請求された（夜職の相手。2026-11-09） */
  E08_BAR: scaled(30),
  E09: scaled(35),
  E10: scaled(45),
  /** 不同意性交だったと訴えられる（2026-11-09。男性プレイヤー・体の関係を持った相手の2%） */
  E25_LAWYER: scaled(40),
  E25_SETTLE: scaled(45),
  E25_IGNORE: scaled(60),
  E11_EARLY: scaled(3),
  E11_AFTER: scaled(15),
  E12_SENT: scaled(40),
  E12_CLOSED: scaled(8),
  E13_FOUND: scaled(20),
  E13_DECLINED: scaled(3),
  E14: scaled(30),
  E15_PER30: scaled(8),
  /** キープ：関係を決めてもらえないまま14日ごと（2026-11-13 指示で30日ごと−8から変更） */
  E15_PER14: scaled(6),
  E16: scaled(18),
  E17: scaled(8),
  E18_PER2W: scaled(6),
  E19: scaled(12),
  E21: scaled(15),
  E22_WEEK: scaled(5),
  E23: scaled(25),
} as const;

// ── 仮置き：会場と費用（円） ──
export const TUNE_VENUES: Record<VenueTier, { label: string; perPerson: [number, number]; desc: string }> = {
  cafe: { label: 'カフェ', perPerson: [1200, 1800], desc: '昼のカフェで1〜2時間' },
  casual: { label: 'カジュアルな店', perPerson: [3000, 4500], desc: '居酒屋・ビストロ' },
  dinner: { label: '落ち着いたレストラン', perPerson: [6000, 9000], desc: '予約制のディナー' },
  luxury: { label: '高級店', perPerson: [9000, 15000], desc: '相手が指定しがちな有名店' },
};
/** 片道の所要時間から往復交通費（円）。地方は遠い候補が多い */
export function tuneTransportYen(distanceMin: number): number {
  // 遠い相手ほど交通費がかさむ（2026-11-03 指示で90分超を引き上げ。終電を気にして早めに切り上げる分の割高さも含む）
  if (distanceMin <= 30) return 500;
  if (distanceMin <= 60) return 1000;
  if (distanceMin <= 90) return 2500;
  if (distanceMin <= 120) return 4500;
  return 7000;
}
export const TUNE_PREP_YEN = { M: 1000, F: 2500 }; // 身支度（1回あたり）
export const TUNE_EXTRA_LIKES = { count: 10, yen: 1200 }; // 追加の露出機能（任意）
export const TUNE_BOOST = { yen: 3000, days: 7, receivedMultiplier: 1.6 };
/** いいねは1日 男性5回・女性3回まで（2026-11-03 指示）。使い切るとその日は終わり、次の日へ進む */
export const TUNE_LIKES_PER_DAY = { M: 5, F: 3 };
/** さがすのスキップも1日5回まで。使い切ると次の日へ */
export const TUNE_SKIPS_PER_DAY = 5;

// ── 仮置き：会話・対面の段階 ──
/**
 * 魅力度（appeal.ts）：人物のマッチ率（仕様の表）を男女別の幅で0..1に直し、相手の好み・人気で揺らした値。
 * 返信の来やすさ・最初の興味・そっけない返事の出やすさに使う（マッチ率そのものは変えない）。
 */
export const TUNE_APPEAL = {
  /** マッチ率をこの幅の対数で0..1にする（男性 0.4%〜45%、女性 4%〜70%） */
  rateRange: { M: { lo: 0.004, hi: 0.45 }, F: { lo: 0.04, hi: 0.7 } },
  tasteWeight: 0.4, // 相手個人の好み（taste、平均1）
  popularityWeight: 0.4, // 人気の高い相手ほど自分が霞む
  receivedBonus: 0.12, // 相手からいいねをくれた
  /** マッチした時点の興味＝base＋span×魅力度 */
  interestBase: 28,
  interestSpan: 40,
};
/** そっけない返事（「はい」「そうなんですね」）になる確率。男性プレイヤーへの返事ほど多い */
export const TUNE_CURT = {
  toMale: { base: 0.3, lowAppeal: 0.4 },
  toFemale: { base: 0.12, lowAppeal: 0.25 },
  coldBonus: 0.2, // もともと温度の低い相手
  lowInterestBonus: 0.2, // 興味40未満
  highInterestCut: 0.2, // 興味70以上
  deceptiveFactor: 0.3, // 目的偽装の相手は愛想がいい
};
/** LINE交換：断られる・会ってから交換する */
export const TUNE_LINE = {
  /** 「LINEは会ってから」という相手の割合（女性の相手に多い） */
  afterMeetingOnly: { toMale: 0.35, toFemale: 0.15 },
  /** 恋愛目的の相手が受ける確率＝(興味−offset)/span */
  acceptOffset: 30,
  acceptSpan: 45,
  /** 目的偽装の相手が受ける確率（既婚者は避ける、メシ目は半々） */
  purposeAccept: { married: 0.15, profit: 0.5, body: 0.95, business: 1, bijin: 0.95, scam: 1, sakura: 0 } as Record<string, number>,
  /** 会話中に相手から提案してくる確率（興味65以上・2往復以上） */
  themPropose: { toMale: 0.15, toFemale: 0.3 },
  /** 初デートの別れ際、また会いたい相手が自分から交換を持ちかける確率 */
  atDateOffer: { toMale: 0.4, toFemale: 0.6 },
  /** 別れ際にこちらから聞いた時に受ける確率（相手の継続意思で変わる） */
  atDateAccept: { continue: 0.9, reject: 0.35 },
};
/** 会話中の返信率（恋愛目的の相手）＝(興味−offset)/55。上限0.9 */
export const TUNE_REPLY = { offsetToMale: 18, offsetToFemale: 10, max: 0.9, min: 0.08 };

export const TUNE_FIRST_REPLY = {
  /** 初回メッセージへの返信率。男性プレイヤー（女性の相手）ほど低い */
  toMale: { fromReceived: 0.6, fromSentLike: 0.42 },
  toFemale: { fromReceived: 0.8, fromSentLike: 0.62 },
  /** 魅力度による倍率＝1−slope/2＋slope×魅力度（恋愛目的の相手だけ） */
  appealSlope: { M: 1.0, F: 0.5 },
  /** 相手から先にメッセージが来る率（マッチ直後。キーはプレイヤーの性別）。2026-11-14 指示：男性NPCから約7割、女性NPCから約2割 */
  openerFromThem: { M: 0.2, F: 0.7 },
  quality: { good: 1.1, intro: 0.95, template: 0.8, heavy: 0.85 } as Record<string, number>, // heavy は古いセーブ用
  purpose: {
    sincere: 1.0, ambiguous: 0.85, body: 1.2, profit: 1.1, married: 0.9,
    business: 1.35, scam: 1.35, sakura: 1.4, bijin: 1.2,
  } as Record<Purpose, number>,
  popularPenalty: 0.85, // 人気上位は対応できる余裕が少ない
};
export const TUNE_DATE_ACCEPT_BASE = 0.6;
/**
 * 受信いいねの件数の倍率（2026-11-08 指示：いいねが来る数が多すぎる）。仕様v0.3の表の値（人物の receivedPer30）にかける。
 * 男性プレイヤーは約1/3、女性プレイヤーは約1/2（例：健人（旧・綾人） 月200〜600件→約67〜200件、彩 月400〜1000件→約200〜500件）
 * 2026-11-14 指示：女性プレイヤーは全体的に1.5倍（1/2→3/4）。古いセーブは始めたときの件数のまま
 */
export const TUNE_RECEIVED_SCALE = { M: 1 / 3, F: 0.75 };
/**
 * 男性プレイヤーの会う前のトークの虚無感（2026-11-08 指示：マッチしても返ってこない・返信が遅い・相槌しか返ってこない・急にブロックされる）
 * silentShare：会話にならない相手のうち、最初から一度も返信しない割合／extraDelay：返信までの日数の上乗せ（最大）／
 * curtTalking：会話は続くが約束にならない相手の、そっけない返事の割合の下限／blockPerReply：その相手が返信のたびに突然ブロックする確率
 */
export const TUNE_MALE_EMPTY = { silentShare: 0.5, extraDelay: 3, curtTalking: 0.55, blockPerReply: 0.12 };
/**
 * マッチした後の進み方（2026-11-06 指示）：マッチした相手のうち、会話が続く70%・会う約束30%・実際に会える20%を基本に、
 * 自分の容姿レベルで倍率をかける。マッチした時点で相手ごとに「どこまで進むか」の上限（reach）を決める（恋愛目的の相手だけ）。
 * reach 0：返信が来ない・相槌だけで続かない／1：会話は続くが会う約束にならない／2：約束するが当日キャンセル・待ちぼうけ／3：会える
 */
export const TUNE_FUNNEL = {
  talk: 0.7,
  promise: 0.3,
  meet: 0.2,
  // 自分の容姿による倍率（2026-11-14 指示：容姿2を1倍・3を1.5倍・4を2倍・5を3倍。1は0.5倍のまま）。上限 cap は0.95
  looksMult: { 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3 } as Record<number, number>,
  cap: 0.95,
  /** 会話が続く相手の、会うまでの返信率の下限 */
  talkingReply: 0.92,
  /** 約束まで進む相手が誘いを受ける確率の下限・相手から誘ってくる確率 */
  promiseAccept: 0.9,
  promiseInviteThem: 0.3,
  /** 会う約束まで進まない相手の親密度の上限（70に届かない＝男性プレイヤーの「必ず受けてもらえる」に入らない） */
  noPromiseInterestCap: 65,
  /** 約束までの相手が、連絡なしで来ない（待ちぼうけ）割合。残りは当日朝のキャンセル */
  noshowShare: 0.35,
};
/** （廃止）トークで減るライフ。2026-11-08 指示で、誘いに失敗したらライフではなくブロックされる形にした */
export const TUNE_TALK_LIFE = { meetWish: 0 };
/** 親密度（相手の興味）がこれ以上なら、男性プレイヤーのデートの誘いは必ず受けてもらえる */
export const TUNE_INTIMACY_SURE = 70;
/** 容姿4・5の男性NPCのうち、誠実・曖昧と決まった人を身体目的（ヤリ捨て）に置き換える割合。男性NPC全体の身体目的は約8%（以前は15%） */
export const TUNE_BODY_HANDSOME = 0.3;
/** 当日ドタキャン（連絡あり）の確率（目的別）。興味が低いと1.5倍。2回目以降も起きる */
export const TUNE_DAY_CANCEL: Record<string, number> = { sincere: 0.04, ambiguous: 0.1, body: 0.1, profit: 0.08, married: 0.14, business: 0.05, scam: 0, sakura: 0, bijin: 0 };
/** 無言キャンセル（待ちぼうけ）の確率（目的別）。2回目以降は0.4倍 */
export const TUNE_NOSHOW: Record<string, number> = { sincere: 0.03, ambiguous: 0.08, body: 0.07, profit: 0.05, married: 0.06, business: 0.03, scam: 0.5, sakura: 1, bijin: 0 };
export const TUNE_REQUIRES_FACE_RATE = 0.35; // 顔写真なしの相手とは会わないNPCの割合
export const TUNE_EXCHANGES_BEFORE_DATE = 2;

// 写真公開時、既にやり取りしている相手が離脱する率は表から導出する：
// d = 1 − (1 − 写真なし時のお断り率) / (1 − 公開後のお断り率)
export function derivedPhotoLeaveRate(rHidden: number, rPublic: number): number {
  if (rPublic >= 1) return 0;
  return Math.max(0, 1 - (1 - rHidden) / (1 - rPublic));
}

// 対面後お断りの伝え方（仮置き）：丁寧なお断り(E17)・既読無視(E03)・連絡不能(E04)
export const TUNE_REJECT_DELIVERY: Record<'polite' | 'ghost' | 'block', [string, number][]> = {
  polite: [['E17', 75], ['E03', 20], ['E04', 5]],
  ghost: [['E17', 20], ['E03', 65], ['E04', 15]],
  block: [['E17', 15], ['E03', 35], ['E04', 50]],
};

// 人気層を狙った場合の倍率（§6：0.25〜0.6倍）。基準候補群の平均で1に較正する
export function tunePopularityMultiplier(popularity: number): number {
  if (popularity >= 0.9) return 0.4;
  if (popularity >= 0.7) return 0.8;
  if (popularity >= 0.2) return 1.1;
  return 1.25;
}

/**
 * 電話（2026-11-14 指示、壁打ちのあと改訂）：3往復以上やり取りした相手にだけ申し込める。
 * 効果は、電話から14日の間のこちらの誘いの受諾率 +20%（上限85%。もともと85%以上ならそのまま）。
 * （同じ日の朝の版は「80%が会える相手になる・相手から70%で誘ってくる・95%受ける」だったが、電話を押せば会える状態になったのでやめた）
 */
export const TUNE_AFTER_CALL = { minExchanges: 3, acceptBonus: 0.2, acceptCap: 0.85, days: 14 };
