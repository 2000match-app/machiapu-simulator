// プレイ可能キャラクター20人（仕様v0.3 §4・§5・§6・§11・§12）。
// v0.1/v0.2 の同IDの設定は使わない。金額は円、期間は月。
// 舞台は首都圏（東京都・埼玉県・千葉県）に限定（2026-10-22 ユーザー指示）。居住地・喫煙・飲酒・結婚歴・休日・見た目の好みは
// この変更に合わせて追加した設定で、仕様v0.3には記載がない（docs/仮置き値.md）。年齢・職業・学歴・年収・身長・容姿・写真・
// 予算・マッチ率表など仕様の値は変えていない。
import type { PlayableCharacter, Prefecture, Preference } from '../types';
import { getArea } from './areas';

const man = 10_000;

/** 初期の検索条件：年齢±5、居住地は自分の都県（埼玉・千葉の人は東京都も含める）、他の絞り込みはなし */
function prefFor(age: number, areaId: string, extra: Partial<Preference> = {}): Preference {
  const own = getArea(areaId).pref;
  const prefectures: Prefecture[] = own === '東京都' ? ['東京都'] : [own, '東京都'];
  return {
    ageMin: Math.max(18, age - 5),
    ageMax: age + 5,
    prefectures,
    heightMin: 0,
    heightMax: 0,
    minIncomeYen: 0,
    universityOnly: false,
    neverMarriedOnly: false,
    noChildrenOnly: false,
    nonSmokerOnly: false,
    drinking: 'any',
    holiday: 'any',
    photoOnly: false,
    ...extra,
  };
}

/** 選べる10人の月の予算は、2026-11-09 指示で約半分に下げた（大輔 6万→3万円の感覚。仕様v0.3の値から変更） */
export const CHARACTERS: PlayableCharacter[] = [
  // ───────────── 男性 ─────────────
  {
    id: 'M01', gender: 'M', name: '健人', age: 30, job: '総合商社',
    education: { kind: 'university', group: '早慶', school: '早稲田大学' },
    incomeYen: 1500 * man, heightCm: 177, looks: 4, photoInitiallyVisible: true, // 身長 183→177cm（2026-11-21 指示）
    datingExperience: 'あり', children: 0,
    areaId: 'minato', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: { busy: true, weekendWorkCalls: true },
    monthlyBudgetYen: 8 * man, appHistoryMonths: 3, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(30, 'minato'),
    tagline: 'ハイスペ。年収・身長・容姿のどれをとっても文句なし',
    lifeNote: '東京都港区在住。総合商社勤務で、海外との会議や接待が多く、会える日が限られる。',
    freeSlotsPerMonth: 4, weekendLimited: false,
    tiredNights: { perWeek: 2, reasons: ['残業で疲れて、アプリを開かずに寝てしまった', '飲み会で遅くなり、アプリを開かずに寝てしまった'] },
    prologue: ['学生時代から、女性に困ったことはなかった。告白されるのも、いつもこちらだった。', '就職したのは、誰もが名前を知っている総合商社。30歳になった今、そろそろ結婚を考えてマッチングアプリを入れてみた。', 'プロフィールを公開すると、いいねは次々に届く。……でも、この中で本当に納得できるパートナーは見つけられるだろうか。'],
    rates: { receivedPer30: [200, 600], sendSuccess: 0.40, postDateRejection: 0.20 },
    route: {
      hardship: '大量の誘いの中に高額店・贈り物要求。本人も比較を続け、交際後にアプリ継続を指摘される',
      choices: '金額ではなく関係への行動を見る／比較を続ける／交際後の使い方を合意',
      clearPath: '誘いや予定を双方で担う相手と交際。多忙でも連絡・会う頻度を合意して60日',
    },
  },
  {
    id: 'M02', gender: 'M', name: '圭', age: 34, job: '弁護士',
    education: { kind: 'university', group: '早慶', school: '慶應義塾大学', detail: '卒・同大学法科大学院修了' },
    incomeYen: 1200 * man, heightCm: 178, looks: 4, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'chuo', smoking: 'none', drinking: 'yes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: { busy: true },
    monthlyBudgetYen: 12 * man, appHistoryMonths: 6, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(34, 'chuo'),
    tagline: '入口は強いが、会話が議論調になりやすい',
    lifeNote: '東京都中央区在住。仕事優先で、平日は終電近くまで働く。',
    freeSlotsPerMonth: 5, weekendLimited: false,
    rates: { receivedPer30: [100, 300], sendSuccess: 0.30, postDateRejection: 0.25 },
    route: {
      hardship: '相手を面接のように質問し、初回後に既読無視。「正しいことを言ったのに」が通用しない',
      choices: '相手の話を聞く／条件確認だけを続ける／相性違いとして区切る',
      clearPath: '議論より感情の共有ができる相手と継続。仕事の予定を一方的に押しつけない',
    },
  },
  {
    id: 'M03', gender: 'M', name: '亮', age: 36, job: 'フリーター',
    education: { kind: 'highschool' },
    incomeYen: 240 * man, heightCm: 176, looks: 2, photoInitiallyVisible: true,
    datingExperience: '少ない', children: 0,
    areaId: 'matsudo', smoking: 'sometimes', drinking: 'sometimes', marital: 'never', holiday: 'irregular',
    baseDistanceMin: 60, lookPreference: 1,
    constraints: { livesWithParents: true },
    monthlyBudgetYen: 1 * man, appHistoryMonths: 12, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(36, 'matsudo'),
    tagline: '収入・雇用の話から先へ進みにくい',
    lifeNote: '千葉県松戸市の実家暮らし。シフト制のアルバイト。交際経験が少ない。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [0, 4], sendSuccess: 0.015, postDateRejection: 0.45 },
    route: {
      hardship: '雇用や収入の話で会話が止まる。やっと会えた相手の店選びに合わせ、月予算を大きく超える',
      choices: '予算を伝える／就業状況を隠さず話す／年収条件が合わない相手に固執するか区切る',
      clearPath: '今の条件を知った上で会う相手と、低予算でも無理なく続く関係をつくる',
    },
  },
  {
    // 2026-11-21：職業を美容師から不動産営業（賃貸仲介）に。休みは火曜・水曜で、土日は出勤（平日休みのまま）
    id: 'M04', gender: 'M', name: '蓮', age: 22, job: '不動産営業',
    education: { kind: 'vocational' },
    incomeYen: 400 * man, heightCm: 183, looks: 4.5, photoInitiallyVisible: true, // 容姿 5→4.5・身長 181→183cm（2026-11-21 指示）
    datingExperience: '豊富', children: 0,
    areaId: 'nakano', smoking: 'sometimes', drinking: 'yes', marital: 'never', holiday: 'weekday',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: {},
    monthlyBudgetYen: 1.5 * man, appHistoryMonths: 6, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(22, 'nakano'),
    tagline: 'レモンサワー君。爽やかだが中身が薄く、低収入', // 2026-11-21 指示
    lifeNote: '東京都中野区で一人暮らし。不動産の営業（賃貸仲介）で、休みは火曜・水曜。土日は内見で忙しい。恋愛経験豊富。',
    freeSlotsPerMonth: 7, weekendLimited: true,
    prologue: ['不動産の営業になって3年目。内見のお客さんには、見た目のおかげか受けがいい。', 'でも休みは火曜と水曜だけで、手取りは25万円ほど。前の彼女とは、休みが合わないまま終わった。', '今度は、ちゃんと続く相手を見つけたい。'],
    rates: { receivedPer30: [80, 250], sendSuccess: 0.28, postDateRejection: 0.30 },
    futureConcern: 0.4,
    route: {
      hardship: '最初は好感触だが結婚の話で切られる。交際後も相手の生活水準に合わせて予算超過',
      choices: '収入と予算を話す／無理な支出を続ける／関係の目的を確認',
      clearPath: '費用感覚の近い相手と交際し、背伸びをせず継続',
    },
  },
  {
    // 2026-11-13：年収1,300万・京都大学卒に（以前は1,200万・慶應義塾大学卒）
    id: 'M05', gender: 'M', name: '悠斗', age: 33, job: '弁護士',
    education: { kind: 'university', group: '旧帝大', school: '京都大学' },
    incomeYen: 1300 * man, heightCm: 170, looks: 2, photoInitiallyVisible: false,
    datingExperience: 'なし', children: 0,
    areaId: 'kawaguchi', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 2,
    constraints: { busy: true },
    monthlyBudgetYen: 3 * man, appHistoryMonths: 24, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(33, 'kawaguchi'),
    tagline: '弁護士で年収には自信があるが、容姿に自信がなくプロフィールは猫の写真',
    lifeNote: '埼玉県川口市で一人暮らし、都内の法律事務所に勤務。仕事は忙しい。彼女いない歴＝年齢。アプリ歴2年。',
    freeSlotsPerMonth: 6, weekendLimited: false,
    // 猫の写真のまま：年収で入口の反応はあるが、会うと見た目で断られやすい
    prologue: ['事務所では頼られる弁護士。年収には、それなりに自信がある。', 'でも鏡を見ると、その自信はしぼんでしまう。33年間、彼女ができたことはない。', 'アプリを始めて2年。プロフィールの写真は、飼い猫のむぎ。顔を出す勇気は、まだない。'],
    rates: { receivedPer30: [8, 30], sendSuccess: 0.06, postDateRejection: 0.6 },
    ratesPhotoPublic: { receivedPer30: [20, 70], sendSuccess: 0.1, postDateRejection: 0.45 },
    route: {
      hardship: '年収目当ての相手に高額店をねだられる。猫の写真のまま会うと、見た目で断られやすい',
      choices: '顔写真を公開する／年収を前面に出しすぎない／予算と会う頻度を決める',
      clearPath: '条件ではなく人柄で再会を望む相手と、忙しさを共有しながら60日',
    },
  },
  {
    id: 'M06', gender: 'M', name: '和也', age: 38, job: '事務職',
    education: { kind: 'university', group: '大東亜帝国', school: '帝京大学' },
    incomeYen: 400 * man, heightCm: 165, looks: 2, photoInitiallyVisible: false,
    datingExperience: 'なし', children: 0,
    areaId: 'adachi', smoking: 'none', drinking: 'none', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 1,
    constraints: {},
    monthlyBudgetYen: 2 * man, appHistoryMonths: 60, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(38, 'adachi'),
    tagline: '顔に自信がなく、会うまで見せない',
    lifeNote: '東京都足立区在住。彼女いない歴＝年齢。アプリ歴5年。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [0, 4], sendSuccess: 0.015, postDateRejection: 0.65 },
    ratesPhotoPublic: { receivedPer30: [0, 4], sendSuccess: 0.01, postDateRejection: 0.40 },
    route: {
      hardship: '顔を見せずに会話は続いたが、初対面後に返事が途絶える。次の優しい相手がサクラサイトへ誘導する経路もある',
      choices: '写真なしで次へ進む／14日経過後に公開へ切り替える／外部の課金誘導を断る',
      clearPath: '公開後の少ない反応を相手の意思として確かめるか、非公開でも対面で互いに惹かれる相手と継続',
    },
  },
  {
    id: 'M07', gender: 'M', name: '大輔', age: 27, job: 'コンサルタント',
    education: { kind: 'university', group: '旧帝大', school: '東京大学' },
    incomeYen: 900 * man, heightCm: 169, looks: 3, photoInitiallyVisible: true, // 身長 171→169cm・年収 800→900万円（2026-11-21 指示）
    datingExperience: '少ない', children: 0,
    areaId: 'shinagawa', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: { busy: true, weekendWorkCalls: true },
    homeWorkPerWeek: 2, // 週2日は在宅勤務（2026-11-14 指示。勤務中もアプリを開ける。化粧の手間は女性だけ）
    monthlyBudgetYen: 3 * man, appHistoryMonths: 12, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(27, 'shinagawa'),
    tagline: 'エナドリ君。学歴とキャリアはあるが、容姿に魅力はない', // 2026-11-21 指示
    lifeNote: '東京都品川区で一人暮らし。外資系コンサルで深夜まで働くことが多い。交際経験が少ない。',
    freeSlotsPerMonth: 5, weekendLimited: false,
    tiredNights: { perWeek: 2, reasons: ['残業で疲れて、アプリを開かずに寝てしまった'] },
    prologue: ['東大を出て外資系のコンサルに入り、毎晩終電まで資料と向き合う日々。', '年収は上がったけれど、恋愛は学生時代で止まったまま。週末にも仕事の連絡が来る。', '限られた時間で、本当に合う人を見つけられるだろうか。'],
    rates: { receivedPer30: [40, 150], sendSuccess: 0.2, postDateRejection: 0.3 },
    route: {
      hardship: '条件目当ての相手やメシ目に当たりやすい。仕事が忙しく、デートの日程が合わず関係が進まない',
      choices: '会える日を先に伝える／条件で寄ってくる相手を見極める／予算の上限を決める',
      clearPath: '忙しさを理解してくれる相手と、少ない会う機会を大事にして60日',
    },
  },
  {
    id: 'M08', gender: 'M', name: '直人', age: 30, job: '派遣ITサポート',
    education: { kind: 'university', group: '日東駒専', school: '日本大学' },
    incomeYen: 320 * man, heightCm: 172, looks: 1, photoInitiallyVisible: false,
    datingExperience: 'なし', children: 0,
    areaId: 'ota', smoking: 'none', drinking: 'none', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 1,
    constraints: {},
    monthlyBudgetYen: 1.5 * man, appHistoryMonths: 6, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(30, 'ota'),
    tagline: '文章では話せるが、外見で断られるのが怖い',
    lifeNote: '東京都大田区（蒲田）で一人暮らし。交際経験なし。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [0, 3], sendSuccess: 0.01, postDateRejection: 0.80 },
    ratesPhotoPublic: { receivedPer30: [0, 2], sendSuccess: 0.005, postDateRejection: 0.50 },
    route: {
      hardship: '文面では盛り上がったのに、会うと早く切り上げられ、再会の誘いを既読無視される',
      choices: '非公開を続けて対面に賭ける／途中公開で入口の反応減を受け入れる／休む',
      clearPath: '写真を見て会いたいと答えた相手、または実際に会って互いに惹かれた相手と継続',
    },
  },
  {
    id: 'M09', gender: 'M', name: '太郎', age: 35, job: '中小企業会社員',
    education: { kind: 'university', group: '産近甲龍', school: '龍谷大学' },
    incomeYen: 500 * man, heightCm: 167, looks: 1, photoInitiallyVisible: true,
    datingExperience: 'なし', children: 0,
    areaId: 'tokorozawa', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 1,
    constraints: {},
    monthlyBudgetYen: 1 * man, appHistoryMonths: 12, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(35, 'tokorozawa'),
    tagline: '。。。', // 2026-11-26 指示
    lifeNote: '埼玉県所沢市で一人暮らし。中小企業の会社員。交際経験はなく、女性と二人で出かけたこともほとんどない。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    prologue: ['35歳。中小企業で、真面目に働いてきた。女性と2人で出かけたことは、ほとんどない。', '実家の母に「いい人はいないの？」と聞かれるたび、話をそらしてきた。', '今年こそ変わりたい。勇気を出して、マッチングアプリに登録した。'],
    rates: { receivedPer30: [0, 3], sendSuccess: 0.01, postDateRejection: 0.6 },
    route: {
      hardship: 'いいねを送っても反応がない日が続く。やっと会えた相手にも見た目や慣れなさで断られる',
      choices: '送る相手の幅を広げる／会話で無理をしない／お金と時間の使い方を決める',
      clearPath: '見た目より人柄で向き合ってくれる相手と、少しずつ関係を育てて60日',
    },
  },
  {
    id: 'M10', gender: 'M', name: '誠', age: 44, job: '非正規の清掃職',
    education: { kind: 'highschool' },
    incomeYen: 260 * man, heightCm: 171, looks: 2, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'chiba', smoking: 'yes', drinking: 'yes', marital: 'divorced', holiday: 'irregular',
    baseDistanceMin: 60, lookPreference: 4,
    constraints: {},
    monthlyBudgetYen: 1 * man, appHistoryMonths: 24, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(44, 'chiba', { ageMin: 25, ageMax: 32 }),
    tagline: '初期の希望は25〜32歳・見た目重視（容姿4以上）',
    lifeNote: '千葉県千葉市在住。離婚歴あり・子どもなし。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [0, 4], sendSuccess: 0.01, postDateRejection: 0.50 },
    route: {
      hardship: '若い人気層に送り続けて無反応。見栄を張ったデートで予算も削られる',
      choices: '年齢・容姿条件の一部を変える／支出上限を決める／同じ選び方を続ける',
      clearPath: '相手も自分を望む条件が重なる層と、無理のない予定と費用で60日',
    },
  },
  // ───────────── 女性 ─────────────
  // 和樹（2026-11-13 追加）：メーカー勤務・年収750万（2026-11-18）。写真は p1154（NPCの素材から外した。以前は p1080）
  {
    id: 'M11', gender: 'M', name: '和樹', age: 33, job: 'メーカー勤務',
    education: { kind: 'university', group: 'MARCH', school: '横浜国立大学' }, // 国立だが大学群はMARCH扱い（2026-11-18）
    incomeYen: 750 * man, heightCm: 170, looks: 3.5, photoInitiallyVisible: true, // 容姿3.5（2026-11-18 指示）
    datingExperience: 'あり', children: 0,
    areaId: 'nerima', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: {},
    monthlyBudgetYen: 2.5 * man, appHistoryMonths: 6, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(33, 'nerima'),
    tagline: '安定くん。スペックは物足りないが、清潔感のある容姿',
    lifeNote: '東京都練馬区で一人暮らし。都内のメーカーに勤める（年収750万円）。土日休みで、残業はほどほど。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    prologue: ['33歳。横浜の大学を出て、メーカーに勤めて10年。仕事も生活も、特に不満はない。', 'ただ、気づけば周りはほとんど結婚していた。前の彼女と別れてから、もう3年がたつ。', '年収はそこそこ、身長は平均くらい。目立つところのない自分でも、ちゃんと出会えるだろうか。'],
    rates: { receivedPer30: [8, 30], sendSuccess: 0.07, postDateRejection: 0.35 },
    route: {
      hardship: '強みも弱みもないので、プロフィールで埋もれやすい。マッチしても比べられて、返信が途切れがち',
      choices: '送る相手の幅を決める／会話で人柄を出す／会う回数を重ねる',
      clearPath: '条件より会って話した感覚を大事にする相手と、少しずつ関係を育てて60日',
    },
  },
  {
    id: 'F01', gender: 'F', name: '麻衣', age: 27, job: '大手企業勤務',
    education: { kind: 'university', group: '早慶', school: '慶應義塾大学' },
    incomeYen: 700 * man, heightCm: 164, looks: 5, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'chuo', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 4,
    constraints: {},
    monthlyBudgetYen: 3 * man, appHistoryMonths: 12, relationshipDeadlineMonths: 18,
    initialPreference: prefFor(27, 'chuo', { ageMin: 25, ageMax: 33, minIncomeYen: 800 * man }),
    tagline: '美人バリキャリ。容姿もよく、かつキャリアも高い', // 2026-11-21 指示
    lifeNote: '東京都中央区在住。アプリ歴1年。交際開始の希望まで18か月。', // 住まいは 2026-11-14 指示で中央区に（以前は世田谷区）
    freeSlotsPerMonth: 8, weekendLimited: false,
    homeWorkPerWeek: 2, weekendPlans: ['ピラティス', '友達とお出かけ'],
    prologue: ['大手企業で働いて5年目。仕事も見た目も、自分なりに磨いてきた。', 'だからこそ、相手にも妥協したくない。同年代で、年収800万円以上で、見た目も素敵な人。', 'アプリを開けば、いいねは毎日のように届く。……なのに、どうして「この人」という相手に出会えないのだろう。'],
    rates: { receivedPer30: [400, 1000], sendSuccess: 0.60, postDateRejection: 0.20 },
    route: {
      hardship: '受信1,000でも条件一致は少ない。条件の揃う男性との曖昧な関係を続け、別の本命を選ばれる',
      choices: '外形条件を保つ／一つ緩める／相手の交際意思と行動を確認',
      clearPath: '自分の条件と相手の希望が重なる人と交際し、比較を切り上げて60日',
    },
  },
  {
    id: 'F02', gender: 'F', name: '莉奈', age: 23, job: '販売職',
    education: { kind: 'vocational' },
    incomeYen: 300 * man, heightCm: 160, looks: 5, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'edogawa', smoking: 'none', drinking: 'yes', marital: 'never', holiday: 'irregular',
    baseDistanceMin: 60, lookPreference: 3,
    constraints: {},
    monthlyBudgetYen: 2 * man, appHistoryMonths: 6, relationshipDeadlineMonths: 24,
    initialPreference: prefFor(23, 'edogawa', { ageMin: 21, ageMax: 30 }),
    tagline: '受信は非常に多い。強い好意表現を信じやすい',
    lifeNote: '東京都江戸川区在住。休みはシフト制。アプリ歴6か月。交際開始の希望まで24か月。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [600, 1500], sendSuccess: 0.65, postDateRejection: 0.25 },
    route: {
      hardship: '強い好意と交際の言葉を信じ、親密になった後にLINEブロック。誘いは多いのに残る関係がない',
      choices: '自分のペースを伝える／関係を確認／曖昧なまま進む',
      clearPath: '言葉と行動が一致し、ペースを尊重する相手と継続',
    },
  },
  {
    id: 'F03', gender: 'F', name: '美咲', age: 33, job: '公務員',
    education: { kind: 'university', group: 'MARCH', school: '中央大学' },
    incomeYen: 600 * man, heightCm: 161, looks: 3, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'suginami', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 2,
    constraints: {},
    monthlyBudgetYen: 1.5 * man, appHistoryMonths: 24, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(33, 'suginami'),
    tagline: '食パン女子。真面目・勤勉で学歴もあるが、容姿は普通', // 2026-11-21 指示。写真は p0725
    lifeNote: '東京都杉並区在住。アプリ歴2年。交際開始の希望まで12か月。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    homeWorkPerWeek: 2, weekendPlans: ['ピラティス', '友達とお出かけ'],
    prologue: ['区役所で働いて10年。30歳を過ぎてから、友人の結婚式が続いている。', '式のたびにご祝儀を包み、二次会で「次は美咲だね」と言われて笑ってみせる。', 'アプリを始めて2年。いいなと思う人には既読無視され、来る人にはときめかない。「今年こそ」という気持ちが、少しずつ焦りに変わっていく。'],
    rates: { receivedPer30: [80, 250], sendSuccess: 0.35, postDateRejection: 0.35 },
    route: {
      hardship: '何人も会うが好きになれない。気になった人には既読無視。周囲の結婚報告で焦る',
      choices: '会う人数を絞る／判断を急ぐ／合わない関係を切る',
      clearPath: '相互に好意のある相手と再会し、生活と連絡の頻度をすり合わせる',
    },
  },
  {
    id: 'F04', gender: 'F', name: '沙織', age: 34, job: 'パート事務',
    education: { kind: 'vocational' },
    incomeYen: 180 * man, heightCm: 160, looks: 3, photoInitiallyVisible: false,
    datingExperience: 'あり', children: 1,
    areaId: 'funabashi', smoking: 'none', drinking: 'none', marital: 'divorced', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 1,
    constraints: { childcare: true },
    monthlyBudgetYen: 0.8 * man, appHistoryMonths: 36, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(34, 'funabashi'),
    tagline: 'シングルマザー（5歳の子と同居）。写真に自信がなく非公開',
    // 選べる人物にしたので、開始時のプロローグを足した（2026-11-13）
    prologue: ['34歳。離婚して3年、5歳の娘と船橋で二人で暮らしている。平日はパートの事務、夕方からは保育園のお迎えと夕食とお風呂で一日が終わる。', '「ママ、また一人でご飯食べてるの？」と娘に言われて、もう一度だれかと暮らすことを考えるようになった。', 'アプリは3年前から入れたまま。顔の写真は、まだ載せる勇気がない。子どもがいると書いても、会ってくれる人はいるだろうか。'],
    lifeNote: '千葉県船橋市在住。離婚歴あり。アプリ歴3年。交際開始の希望まで12か月。月に会える日が少ない。',
    freeSlotsPerMonth: 2, weekendLimited: false,
    rates: { receivedPer30: [10, 40], sendSuccess: 0.12, postDateRejection: 0.50 },
    ratesPhotoPublic: { receivedPer30: [20, 70], sendSuccess: 0.18, postDateRejection: 0.35 },
    route: {
      hardship: '子どもの予定を調整して会った後、外見の相性で断られる。別の相手は夜・自宅への誘いばかり',
      choices: '途中で顔写真を公開する／育児と予算に合う予定だけ受ける／関係を区切る',
      clearPath: '自分の顔と子どもの事情の両方を受け入れ、行動でも配慮する相手と60日続ける',
    },
  },
  {
    // 2026-11-13 選べる人物に：36歳・容姿3（以前は39歳・容姿4）。高収入の管理職だが、男性からの需要はあまり高くない
    id: 'F05', gender: 'F', name: '真由', age: 36, job: '大手企業管理職',
    education: { kind: 'university', group: '早慶', school: '早稲田大学' },
    incomeYen: 900 * man, heightCm: 162, looks: 3, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'shinagawa', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 4,
    constraints: { busy: true },
    monthlyBudgetYen: 8 * man, appHistoryMonths: 84, relationshipDeadlineMonths: 6,
    initialPreference: prefFor(36, 'shinagawa', { minIncomeYen: 1200 * man }),
    tagline: 'バリキャリ。男性からの需要は低い',
    lifeNote: '東京都品川区在住。大手企業で管理職として働き、平日は遅くまで仕事。アプリ歴7年。交際開始の希望まで6か月。',
    prologue: ['36歳。大手企業で、課をまとめる管理職になって2年。仕事は順調で、年収も同年代の男性よりずっと高い。', 'けれどアプリでは、いいねがなかなか来ない。届くのは、ずっと年上か、こちらの年収を聞いて黙ってしまう人ばかり。', '「仕事ができる人ほど結婚が遠い」なんて、言われたくはない。自分にふさわしい相手は、きっとどこかにいるはずだ。'],
    freeSlotsPerMonth: 6, weekendLimited: false,
    // 男性からの需要は低め（年齢・高収入・管理職が引かれやすい）。以前は 40〜120件・25%・30%
    rates: { receivedPer30: [15, 45], sendSuccess: 0.12, postDateRejection: 0.40 },
    route: {
      hardship: 'いいねは少なく、来るのは年上や条件の合わない相手。同等以上の男性を選ぶと返事が来ず、会えても仕事や年収の話で距離を置かれる',
      choices: '条件を再確認／関係を決めない相手を待つ／区切る',
      clearPath: '高条件を保って成立する経路も、一部を見直して相性を優先する経路も用意',
    },
  },
  {
    // 2026-11-13：専門卒・医療事務に（以前は東洋大学卒・公務員）。2026-11-18：看護師・年収500万円に（看護専門学校卒）
    // 2026-11-19：病院勤め（日勤のシフト＋月4回ほどの夜勤。土日も出勤があり、休みは週2日の不定休）
    id: 'F06', gender: 'F', name: '葵', age: 24, job: '看護師',
    education: { kind: 'vocational' },
    incomeYen: 500 * man, heightCm: 167, looks: 2, photoInitiallyVisible: false,
    datingExperience: '少ない', children: 0,
    areaId: 'koshigaya', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'irregular',
    baseDistanceMin: 60, lookPreference: 2,
    constraints: { shiftWork: true },
    monthlyBudgetYen: 0.8 * man, appHistoryMonths: 24, relationshipDeadlineMonths: 24,
    initialPreference: prefFor(24, 'koshigaya', { ageMin: 21, ageMax: 30 }),
    tagline: 'プロフィールは後頭部の写真だけ。それでも若い女性なのでいいねはたくさん来る',
    lifeNote: '埼玉県越谷市の実家暮らし。看護専門学校を出て、病院で看護師をしている（年収500万円）。シフト勤務で月に4回ほど夜勤があり、休みは週2日の不定休。アプリ歴2年。交際開始の希望まで24か月。',
    freeSlotsPerMonth: 8, weekendLimited: true,
    // 顔が分からなくてもいいねは多い。会ってから断られやすい
    prologue: ['看護専門学校を出て、病院の看護師になって4年目。夜勤にも慣れてきたけど、職場に出会いはほとんどない。', '顔に自信がなくて、プロフィールは後ろ姿の写真。それでも、いいねはたくさん届く。', '……みんな、私の何を見ていいねしてくれているんだろう。'],
    rates: { receivedPer30: [60, 200], sendSuccess: 0.25, postDateRejection: 0.6 },
    ratesPhotoPublic: { receivedPer30: [20, 70], sendSuccess: 0.15, postDateRejection: 0.45 },
    route: {
      hardship: '顔の分からないまま届く大量のいいねに期待するが、会った後に断られる。身体目的の相手も混ざる',
      choices: '顔写真を公開する／後頭部のまま続ける／いいねの数に期待しすぎない',
      clearPath: '実際に会ってなお再会を望む相手と、ゆっくり関係を育てて60日',
    },
  },
  {
    id: 'F07', gender: 'F', name: '千尋', age: 29, job: '派遣事務',
    education: { kind: 'university', group: '大東亜帝国', school: '亜細亜大学' },
    incomeYen: 280 * man, heightCm: 162, looks: 2, photoInitiallyVisible: false,
    datingExperience: 'あり', children: 0,
    areaId: 'tachikawa', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 2,
    constraints: {},
    monthlyBudgetYen: 1.5 * man, appHistoryMonths: 36, relationshipDeadlineMonths: 18,
    initialPreference: prefFor(29, 'tachikawa'),
    tagline: '容姿への不安が強い。文章の会話は続くが、会った後に断られやすい',
    lifeNote: '東京都立川市在住。アプリ歴3年。交際開始の希望まで18か月。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    rates: { receivedPer30: [10, 40], sendSuccess: 0.14, postDateRejection: 0.65 },
    ratesPhotoPublic: { receivedPer30: [10, 35], sendSuccess: 0.10, postDateRejection: 0.40 },
    route: {
      hardship: '会う前は好意的な文章が続いたのに、初対面後にLINEブロック。期待と現実の差が残る',
      choices: '非公開で続ける／途中公開で会う前に相性を確かめる／休息',
      clearPath: '会話と見た目の両方で相互に惹かれる相手と、少ない候補から継続',
    },
  },
  {
    // 2026-11-14：跡見学園女子大学卒に（11/13 は日本女子大学、以前は専門卒）。学歴の段階は 大東亜帝国 相当として扱う（画面には大学群を出さない）
    id: 'F08', gender: 'F', name: '結衣', age: 28, job: '事務職',
    education: { kind: 'university', group: '大東亜帝国', school: '跡見学園女子大学' },
    incomeYen: 260 * man, incomeLabel: '400万円以下', heightCm: 155, looks: 3.5, photoInitiallyVisible: true, // 容姿3.5・写真は p0749（2026-11-18 指示）→ 2026-11-26 ユーザー提供の画像に差し替え
    datingExperience: 'あり', children: 0,
    areaId: 'itabashi', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 4,
    constraints: {},
    monthlyBudgetYen: 1 * man, appHistoryMonths: 12, relationshipDeadlineMonths: 18,
    // 高望み：年収700万円以上・身長172cm以上・大卒以上・同年代〜少し上
    initialPreference: prefFor(28, 'itabashi', { ageMin: 27, ageMax: 35, minIncomeYen: 600 * man, heightMin: 172, universityOnly: true }),
    tagline: 'フラッペ女子。低キャリアの実家暮らし。容姿は平均以上', // 2026-11-21 指示
    lifeNote: '東京都板橋区の実家暮らし。跡見学園女子大学を出て事務職。手取りは美容と旅行で使い切っている。いいねは多く届くが、自分の希望に合う相手は少ない。', // 板橋区の実家暮らしは 2026-11-14 指示
    freeSlotsPerMonth: 8, weekendLimited: false,
    prologue: ['跡見学園女子大学を出て、都内の会社で事務をしている。手取りは18万円。実家暮らしだけど、美容院とネイルと旅行で毎月きれいに消えていく。', '友達がインスタに載せるホテルのアフタヌーンティーが、遠い世界に見える。', '見た目には少し自信がある。お金に余裕のある人と出会えたら、この生活も変わるかもしれない。'],
    rates: { receivedPer30: [120, 350], sendSuccess: 0.4, postDateRejection: 0.3 },
    route: {
      hardship: '高い条件の相手にばかり送り、ハイスペ狙いの業者・既婚者・ヤリモクに当たりやすい。条件に合う人ほど競争が激しい',
      choices: '条件を緩める／届いたいいねにも目を向ける／見た目や年収だけで決めない',
      clearPath: '条件より一緒にいて楽な相手と、無理のない関係を育てて60日',
    },
  },
  {
    id: 'F09', gender: 'F', name: '遥', age: 32, job: '医療事務',
    education: { kind: 'vocational' },
    incomeYen: 260 * man, heightCm: 163, looks: 2, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'kawagoe', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'irregular',
    baseDistanceMin: 60, lookPreference: 2,
    constraints: { shiftWork: true },
    monthlyBudgetYen: 1.5 * man, appHistoryMonths: 48, relationshipDeadlineMonths: 12,
    initialPreference: prefFor(32, 'kawagoe'),
    tagline: '土日出勤のあるシフト勤務。日程調整でも止まりやすい',
    lifeNote: '埼玉県川越市在住。アプリ歴4年。交際開始の希望まで12か月。',
    freeSlotsPerMonth: 5, weekendLimited: true,
    rates: { receivedPer30: [20, 70], sendSuccess: 0.18, postDateRejection: 0.40 },
    route: {
      hardship: '少ないマッチと勤務日の不一致が重なる。やっと交際した相手が2か月後に既婚と分かる経路もある',
      choices: '会える時間と予算を伝える／相手の矛盾を確認／曖昧な状態を区切る',
      clearPath: '顔、仕事、会える頻度を知った上で、互いに関係を続けたい相手と継続',
    },
  },
  {
    id: 'F10', gender: 'F', name: '奈緒', age: 42, job: 'パート勤務',
    education: { kind: 'highschool' },
    incomeYen: 180 * man, heightCm: 159, looks: 1, photoInitiallyVisible: true,
    datingExperience: 'あり', children: 0,
    areaId: 'hachioji', smoking: 'none', drinking: 'sometimes', marital: 'never', holiday: 'weekend',
    baseDistanceMin: 60, lookPreference: 4,
    constraints: {},
    monthlyBudgetYen: 0.8 * man, appHistoryMonths: 96, relationshipDeadlineMonths: 6,
    initialPreference: prefFor(42, 'hachioji', { ageMin: 30, ageMax: 39 }),
    tagline: '。。。', // 2026-11-26 指示
    lifeNote: '東京都八王子市在住。パート勤務。アプリ歴8年。交際開始の希望まで6か月。',
    freeSlotsPerMonth: 8, weekendLimited: false,
    prologue: ['42歳。パートで働きながら、アプリを続けて8年になる。何人とも会ったけれど、誰とも続かなかった。', 'それでも理想は下げられない。30代で、見た目のいい人。友人には「そろそろ現実を見なよ」と言われる。', 'あと半年。これで最後にしようと決めている。'],
    rates: { receivedPer30: [3, 12], sendSuccess: 0.04, postDateRejection: 0.6 },
    route: {
      hardship: '年下の人気層を待ち続け、アプリ歴の消耗が進む。届くいいねは少なく、条件目当てや既婚者が混ざる',
      choices: '相手の希望範囲を確認／条件を見直す／予算を越える誘いを断る',
      clearPath: '相互の希望と誠実な行動が揃い、現在の収入でも無理なく付き合える相手と60日',
    },
  },
];

export const NO_PHOTO_IDS = ['M05', 'M06', 'M08', 'F04', 'F06', 'F07'] as const;

export function getCharacter(id: string): PlayableCharacter {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}

export function educationLabel(e: PlayableCharacter['education']): string {
  if (e.kind === 'vocational') return e.label ?? '専門卒';
  if (e.kind === 'highschool') return '高卒';
  // 大学群（早慶・旧帝大など）は出さない（2026-11-13 指示）
  return `${e.school}${e.detail ?? '卒'}`;
}

/** MARCH未満の大学（日東駒専・大東亜帝国・産近甲龍）。ゲームの中では大学名を出さず「大卒」にする（2026-11-21 指示） */
export function belowMarch(e: PlayableCharacter['education']): boolean {
  return e.kind === 'university' && !['旧帝大', '早慶', 'MARCH'].includes(e.group);
}

/** ゲームの中（マイページなど）での自分の学歴。MARCH未満は「大卒」。キャラ選択画面は educationLabel で大学名まで出す */
export function educationInGame(e: PlayableCharacter['education']): string {
  if (belowMarch(e) && e.kind === 'university') return e.detail === '在学中' ? '大学在学中' : e.detail ?? '大卒';
  return educationLabel(e);
}

export function educationShort(e: PlayableCharacter['education']): string {
  if (e.kind === 'vocational') return e.label ?? '専門卒';
  if (e.kind === 'highschool') return '高卒';
  return `${e.school}${e.detail ?? '卒'}`;
}

export const SMOKING_LABEL = { none: '吸わない', sometimes: 'ときどき吸う', yes: '吸う' } as const;
export const DRINKING_LABEL = { none: '飲まない', sometimes: 'ときどき飲む', yes: '飲む' } as const;
/**
 * 選択画面で選べる人物（2026-11-03 指示で男女5人ずつ。一時8人にしていた）。条件の幅（高条件・平均・最難関・顔写真なし／年齢）が残るように選んだ。
 * ほかの10人のデータはテスト・自動プレイ用に残す。
 */
// 2026-11-13：和樹（M11）を追加し、蓮（M04）も残して男性6人。女性は真由（F05：管理職・バリキャリ・男性からの需要は低め）を足して6人（計12人）
/**
 * 一時的に選択画面から外している人物（2026-11-21 指示：和樹・真由）。データ・写真・トークはそのまま残してある。
 * 復活させるときは、この配列から消すだけでよい（前回の続きのセーブも、そのまま遊べる）
 */
export const PAUSED_IDS = ['M11', 'F05'];
const ALL_SELECTABLE_IDS = ['M01', 'M04', 'M05', 'M09', 'M07', 'M11', 'F01', 'F03', 'F05', 'F06', 'F08', 'F10'];
export const SELECTABLE_IDS = ALL_SELECTABLE_IDS.filter((id) => !PAUSED_IDS.includes(id));

/**
 * ゲーム開始時の検索条件：そのまま進めるとゲームオーバーになりやすい「格上狙い」（2026-11-03 指示）。
 * 男性は年下・写真あり・未婚・吸わない人、女性は年収600万円以上・身長175cm以上・大卒以上・未婚の人に絞る。
 * 人物ごとの元の希望（initialPreference）より厳しい方を採る。ライフが減ったら広げるよう促す
 */
export function aspirationalPreference(ch: PlayableCharacter): Preference {
  const base = ch.initialPreference;
  // 年齢は本人の±3歳。下限は23歳（23歳未満は出さない）。22歳の蓮だけは20歳から（2026-11-12 指示）
  const ageMin = ch.id === 'M04' ? Math.max(20, ch.age - 3) : Math.max(23, ch.age - 3);
  const ageMax = Math.max(ageMin + 3, ch.age + 3);
  if (ch.gender === 'M') {
    return { ...base, ageMin, ageMax, photoOnly: false, neverMarriedOnly: true, nonSmokerOnly: true };
  }
  return {
    ...base,
    ageMin,
    ageMax,
    minIncomeYen: Math.max(base.minIncomeYen, 600 * man),
    heightMin: Math.max(base.heightMin, 175),
    universityOnly: true,
    neverMarriedOnly: true,
  };
}

export const MARITAL_LABEL = { never: '未婚', divorced: '離婚歴あり' } as const;
export const HOLIDAY_LABEL = { weekend: '土日', weekday: '平日', irregular: '不定期' } as const;
