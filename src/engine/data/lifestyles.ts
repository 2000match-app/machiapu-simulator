// 人物ごとの生活リズム（2026-11-13 時間進行・ロック画面）。勤務の形と職業を分けて持つ（例：コンサル×在宅）。
// 時刻は0時からの分（9:00 = 540）。曜日は 0=月 … 6=日（ゲームの1日目は月曜）。
// 勤務・睡眠・予定の時間帯はアプリを開けない（ロック画面で約2秒のスキップ）。在宅勤務とパートの空き時間は開ける。

export type WorkKind = 'office' | 'remote' | 'shift' | 'part' | 'none';

export interface WorkPattern {
  kind: WorkKind;
  start: number;
  end: number;
  /** 働く曜日（0=月…6=日） */
  days: number[];
  /** シフト勤務：働く曜日のうち、週に何日を別に休むか（週ごとにシードで決める） */
  rotatingOff?: number;
  /** ロック画面に出す状態の名前（「仕事中」など） */
  label: string;
}

export interface Lifestyle {
  /** 仕事の内容（通知の言い回しの元。職業とは別の属性） */
  occupation: string;
  work: WorkPattern;
  /** 起きる時刻と寝る時刻（寝る時刻が 1440 なら 24:00） */
  wake: number;
  sleep: number;
  /** 残業：平日の夜に会えない日の理由。退勤がこの時刻まで延びる */
  overtime?: { until: number; notices: string[] };
  /** 平日の夜の予定（カレンダーの私用）の候補と出やすさ。なければ共通の候補 */
  weekdayPool?: [string, number][];
  weekdayChance?: number;
  /** 休日の予定の候補と出やすさ */
  weekendPool?: [string, number][];
  weekendChance?: number;
  /** 予定に合わせて届く仕事関係の通知（予定の名前 → 通知の文と時刻） */
  eventNotices?: Record<string, { text: string; at: number; from: string; daysBefore?: number }>;
  /** ときどき届く仕事の通知 */
  notices: string[];
  noticeFrom: string;
  noticeChance: number;
}

const h = (hh: number, mm = 0) => hh * 60 + mm;
const WEEKDAYS = [0, 1, 2, 3, 4];

const office = (start = h(9), end = h(18), label = '仕事中'): WorkPattern => ({ kind: 'office', start, end, days: WEEKDAYS, label });

/** 人物ごとの設定（既存の職業・休日・忙しさ・在宅の日と矛盾しないように） */
export const LIFESTYLES: Record<string, Lifestyle> = {
  // 健人：総合商社。平日夜は会食・飲み会、休日はゴルフ
  M01: {
    occupation: '総合商社', work: office(), wake: h(7), sleep: 1440,
    weekdayPool: [['取引先と会食', 3], ['会社の飲み会', 2], ['同期と飲み', 1]], weekdayChance: 0.75,
    weekendPool: [['ゴルフ', 3], ['友人と外出', 1], ['家の用事', 1]], weekendChance: 0.55,
    eventNotices: {
      取引先と会食: { text: '明日の夜、取引先と会食になった。空けといて', at: h(15), from: '課長', daysBefore: 1 },
      会社の飲み会: { text: '今日飲み行かない？', at: h(16), from: '先輩' },
      同期と飲み: { text: '今日飲み行かない？いつもの店で', at: h(16, 30), from: '同期' },
      ゴルフ: { text: '土曜日ゴルフ行ける？朝7時集合で', at: h(12, 30), from: '部長', daysBefore: 2 },
    },
    notices: ['海外の拠点から連絡きてる。明日の朝イチで確認して', '来週の出張、日程確定しました', '先方の資料、目を通しておいて'], noticeFrom: '課長', noticeChance: 0.3,
  },
  // 圭：弁護士。期日前は遅くまで
  M02: {
    occupation: '弁護士', work: office(h(9, 30), h(19)), wake: h(7), sleep: 1440,
    overtime: { until: h(22), notices: ['明日の期日の書面、今夜中に確認お願いします', '依頼者から追加の相談が来ています'] },
    notices: ['準備書面のドラフト、共有フォルダに入れました', '来週の打ち合わせ、時間変更です'], noticeFrom: '事務所', noticeChance: 0.3,
  },
  // 亮：フリーター（実家暮らし）。固定の勤務ロックなし
  M03: {
    occupation: 'アルバイト', work: { kind: 'part', start: h(17), end: h(22), days: [], label: 'バイト中' }, wake: h(9), sleep: 1440,
    notices: ['明日シフト入れそう？', '今日暇だから早上がりでいいよ！', '来週のシフト希望、今日までに出してね'], noticeFrom: 'バイト先', noticeChance: 0.35,
  },
  // 蓮：美容師。火曜定休＋週1日の休み、土日は出勤
  M04: {
    occupation: '美容師', work: { kind: 'shift', start: h(10), end: h(20), days: [0, 2, 3, 4, 5, 6], rotatingOff: 1, label: 'サロン勤務中' }, wake: h(8), sleep: 1440,
    notices: ['明日の朝イチ、カットの予約入りました', '今月の指名数、店長から連絡あり', '練習会、木曜の閉店後です'], noticeFrom: 'サロン', noticeChance: 0.3,
  },
  // 悠斗：弁護士。期日前は遅くまで
  M05: {
    occupation: '弁護士', work: office(h(9, 30), h(19)), wake: h(7), sleep: 1440,
    overtime: { until: h(22), notices: ['明日の期日の準備、今夜中にお願いします', 'クライアントから急ぎの相談です'] },
    notices: ['契約書のレビュー、明日までにお願いします', '来週の出廷、時間が決まりました'], noticeFrom: '事務所', noticeChance: 0.3,
  },
  // 和也：事務職。定時
  M06: {
    occupation: '事務職', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日の会議資料、印刷お願いします', '経費精算の締め、今週金曜です'], noticeFrom: '上司', noticeChance: 0.2,
  },
  // 大輔：コンサル。残業が多い
  M07: {
    occupation: 'コンサルタント', work: office(), wake: h(7), sleep: 1440,
    overtime: { until: h(22), notices: ['今日少し残業できる？', 'クライアントから修正依頼きた', '今日の資料、追加でお願いできる？'] },
    weekendPool: [['休日出勤', 1], ['家の用事', 1]], weekendChance: 0.4,
    notices: ['明日のクライアント会議、資料の最終版ください', 'プロジェクトの進捗、夕方に共有して'], noticeFrom: 'マネージャー', noticeChance: 0.35,
  },
  // 直人：派遣ITサポート。定時
  M08: {
    occupation: 'ITサポート', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日、PC入れ替えの対応お願いします', '問い合わせの件数、今週多めです'], noticeFrom: '派遣先', noticeChance: 0.2,
  },
  // 太郎：中小企業の会社員。たまに残業
  M09: {
    occupation: '会社員', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日の朝礼、当番お願いします', '取引先から電話あったよ'], noticeFrom: '上司', noticeChance: 0.2,
  },
  // 誠：非正規の清掃職。朝からのシフト
  M10: {
    occupation: '清掃', work: { kind: 'shift', start: h(8), end: h(16), days: [0, 1, 2, 3, 4, 5, 6], rotatingOff: 2, label: '清掃のシフト中' }, wake: h(6, 30), sleep: h(23),
    notices: ['明日、別のビルに入ってもらえる？', '来週のシフト表出ました'], noticeFrom: '現場', noticeChance: 0.25,
  },
  // 和樹：会社員。定時が多く、たまに飲み会
  M11: {
    occupation: 'メーカー勤務', work: office(), wake: h(7), sleep: 1440,
    weekdayPool: [['同期と飲み', 2], ['会社の飲み会', 1], ['ジム', 1]], weekdayChance: 0.25,
    notices: ['明日の会議、資料の確認お願いします', '来週の出張、日程決まりました', '今日の打ち合わせ、10分遅れで始めます'], noticeFrom: '上司', noticeChance: 0.25,
  },
  // 麻衣：大手企業。週2日在宅、土日どちらかはピラティス・友達とお出かけ
  F01: {
    occupation: '大手企業勤務', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日の打ち合わせ、オンラインに変更です', '資料のレビューお願いできますか？'], noticeFrom: '上司', noticeChance: 0.25,
  },
  // 莉奈：販売職。土日も出勤、平日に週2日休み
  F02: {
    occupation: '販売職', work: { kind: 'shift', start: h(10), end: h(19), days: [0, 1, 2, 3, 4, 5, 6], rotatingOff: 2, label: 'お店に出勤中' }, wake: h(8), sleep: 1440,
    notices: ['明日シフト入れそう？', '新作の入荷、明日の朝です', 'セールの準備、早めに来られる？'], noticeFrom: 'お店', noticeChance: 0.3,
  },
  // 美咲：会社員。週2日在宅、土日どちらかは予定
  F03: {
    occupation: '公務員', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日の会議、10時からに変更です', '先方から返事来てました'], noticeFrom: '上司', noticeChance: 0.25,
  },
  // 沙織：パート事務。固定の勤務ロックなし。夕方からは育児
  F04: {
    occupation: 'パート事務', work: { kind: 'part', start: h(9), end: h(15), days: [], label: 'パート中' }, wake: h(6, 30), sleep: 1440,
    notices: ['明日シフト入れそう？', '今日暇だから早上がりでいいよ！'], noticeFrom: 'パート先', noticeChance: 0.3,
  },
  // 真由：管理職。残業が多い
  F05: {
    occupation: '大手企業管理職', work: office(), wake: h(7), sleep: 1440,
    overtime: { until: h(21, 30), notices: ['部下の評価面談、今日中にまとめてもらえますか', '役員報告の資料、追加でお願いします'] },
    notices: ['明日の役員会、資料の確認お願いします', 'チームの予算、来週までに'], noticeFrom: '部長', noticeChance: 0.3,
  },
  // 葵：病院の看護師。日勤のシフト（土日も出る・週2日の不定休）＋月4回ほどの夜勤（dates.ts の nightShift）
  // 2026-11-13 公務員から医療事務、2026-11-18 看護師（クリニック）、2026-11-19 病院勤めに
  F06: {
    occupation: '看護師', work: { kind: 'shift', start: h(8, 30), end: h(17, 30), days: [0, 1, 2, 3, 4, 5, 6], rotatingOff: 2, label: '病棟で勤務中' }, wake: h(6, 45), sleep: 1440,
    eventNotices: {
      夜勤: { text: '明日の夜勤、よろしくお願いします。申し送り多めです', at: h(18), from: '病棟の師長', daysBefore: 1 },
    },
    notices: ['来月の勤務表、出ました', '明日の日勤、1人休みなので少し早めに来られる？', '感染対策の研修、今週中に受けてください'], noticeFrom: '病棟の師長', noticeChance: 0.3,
  },
  // 千尋：派遣事務
  F07: {
    occupation: '派遣事務', work: office(h(9), h(17, 30)), wake: h(7), sleep: 1440,
    notices: ['契約更新の面談、来週です', '明日の入力作業、多めです'], noticeFrom: '派遣会社', noticeChance: 0.2,
  },
  // 結衣：事務職
  F08: {
    occupation: '事務職', work: office(), wake: h(7), sleep: 1440,
    notices: ['明日の来客、お茶出しお願いします', '請求書の発送、今日中です'], noticeFrom: '上司', noticeChance: 0.2,
  },
  // 遥：医療事務。シフト勤務（土日も出ることがある）
  F09: {
    occupation: '医療事務', work: { kind: 'shift', start: h(8, 30), end: h(17, 30), days: [0, 1, 2, 3, 4, 5], rotatingOff: 1, label: '病院で勤務中' }, wake: h(7), sleep: 1440,
    notices: ['明日のシフト、遅番に変更できる？', 'レセプトの締め、今週です'], noticeFrom: '病院', noticeChance: 0.3,
  },
  // 奈緒：パート勤務。固定の勤務ロックなし
  F10: {
    occupation: 'パート', work: { kind: 'part', start: h(10), end: h(15), days: [], label: 'パート中' }, wake: h(7), sleep: 1440,
    notices: ['明日シフト入れそう？', '今日暇だから早上がりでいいよ！'], noticeFrom: 'パート先', noticeChance: 0.3,
  },
};

const FALLBACK: Lifestyle = { occupation: '会社員', work: office(), wake: h(7), sleep: 1440, notices: [], noticeFrom: '会社', noticeChance: 0 };

export function lifestyleOf(characterId: string): Lifestyle {
  return LIFESTYLES[characterId] ?? FALLBACK;
}

/** カレンダーの予定（私用）の時間帯とアイコン。ここにない予定は 19:00〜21:00 */
export const EVENT_WINDOWS: Record<string, { start: number; end: number; icon: string; state: string }> = {
  会社の飲み会: { start: h(19), end: h(22), icon: '🍻', state: '飲み会中' },
  同期と飲み: { start: h(19, 30), end: h(22, 30), icon: '🍻', state: '飲み会中' },
  取引先と会食: { start: h(19), end: h(22), icon: '🍽️', state: '会食中' },
  出張: { start: h(7), end: h(23), icon: '✈️', state: '出張中' },
  // 看護師の夜勤（2026-11-19）：夕方から翌朝まで。翌日は昼過ぎまで寝ている
  夜勤: { start: h(16, 30), end: h(24), icon: '🌙', state: '夜勤中' },
  夜勤明け: { start: 0, end: h(13), icon: '😪', state: '夜勤明けで寝ている' },
  残業: { start: h(18), end: h(21, 30), icon: '💼', state: '残業中' },
  歯医者: { start: h(19), end: h(20), icon: '🦷', state: '歯医者' },
  ジム: { start: h(19), end: h(20, 30), icon: '🏋️', state: 'ジム' },
  保育園の行事: { start: h(17), end: h(19), icon: '🧒', state: '保育園の行事' },
  子どもの習い事: { start: h(10), end: h(12), icon: '🧒', state: '子どもの習い事' },
  シフト勤務: { start: h(10), end: h(19), icon: '💼', state: 'シフト勤務中' },
  友人と外出: { start: h(13), end: h(18), icon: '🚶', state: '友人と外出中' },
  実家に帰る: { start: h(11), end: h(20), icon: '🏠', state: '実家に帰省中' },
  友人の誕生日会: { start: h(18), end: h(22), icon: '🎂', state: '誕生日会' },
  美容院: { start: h(13), end: h(15), icon: '💇', state: '美容院' },
  買い物: { start: h(14), end: h(17), icon: '🛍️', state: '買い物中' },
  大学の友人とランチ: { start: h(12), end: h(14, 30), icon: '🍝', state: 'ランチ中' },
  家の用事: { start: h(10), end: h(12), icon: '🧺', state: '家の用事' },
  ピラティス: { start: h(10), end: h(11, 30), icon: '🧘', state: 'ピラティス中' },
  友達とお出かけ: { start: h(13), end: h(18), icon: '🚶', state: '友達とお出かけ中' },
  ゴルフ: { start: h(7), end: h(16), icon: '⛳', state: 'ゴルフ中' },
  休日出勤: { start: h(10), end: h(17), icon: '💼', state: '休日出勤中' },
};
