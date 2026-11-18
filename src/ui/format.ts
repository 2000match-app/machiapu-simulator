// 表示用の整形。内部はすべて円・ゲーム日で持ち、ここでだけ万円・か月に変換する。
import { awaitingNow, visibleMessages } from '../engine/clock';
import type { Contact, GameState, Npc, Preference, Stage } from '../engine/types';
import { DAYS_PER_MONTH } from '../engine/data/rules';

export function yen(n: number): string {
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

export function man(n: number): string {
  const v = n / 10_000;
  return `${Number.isInteger(v) ? v.toLocaleString('ja-JP') : v.toFixed(1)}万円`;
}

export function elapsedLabel(day: number): string {
  const m = Math.floor(day / DAYS_PER_MONTH);
  const d = day % DAYS_PER_MONTH;
  if (m === 0) return `${d}日経過`;
  return `${m}か月${d}日経過`;
}

export function dayInMonth(day: number): string {
  return `${Math.floor(day / DAYS_PER_MONTH) + 1}か月目・${(day % DAYS_PER_MONTH) + 1}日`;
}

export function inDays(n: number): string {
  if (n <= 0) return '今日';
  if (n === 1) return '明日';
  return `${n}日後`;
}

export { calendarParts, dateLabel } from '../engine/calendar';

/**
 * プロフィールの年収表示（2026-11-12 指示：実際のアプリと同じく幅で出す）。
 * 秘密／未記載／400万円以下／400万〜600万円／600万〜800万円／800万〜1000万円／1000万円以上
 */
export function incomeOf(npc: { incomeYen: number; incomeHidden?: string }): string {
  if (npc.incomeHidden) return npc.incomeHidden === '秘密' ? '秘密' : '未記載';
  const m = npc.incomeYen / 10_000;
  if (m <= 400) return '400万円以下';
  if (m <= 600) return '400万〜600万円';
  if (m <= 800) return '600万〜800万円';
  if (m < 1000) return '800万〜1000万円';
  return '1000万円以上';
}

export function weekdayLabel(day: number): string {
  // 開始日を月曜とした曜日（5,6が土日）
  return ['月', '火', '水', '木', '金', '土', '日'][day % 7];
}

export const STAGE_LABEL: Record<Stage, string> = {
  like_sent: 'いいね済み',
  like_failed: '不成立',
  matched: 'マッチ',
  talking: 'やり取り中',
  scheduled: '予定あり',
  dating: '会っている',
  relationship: '交際中',
  ended: '終了',
};

export function contactStatus(state: GameState, c: Contact): { label: string; tone: 'me' | 'wait' | 'plan' | 'rel' | 'end' | 'new' } {
  if (c.stage === 'ended') return { label: '終了', tone: 'end' };
  if (c.stage === 'relationship') return { label: `交際${state.day - (c.relationship?.startDay ?? state.day)}日目`, tone: 'rel' };
  if (awaitingNow(state, c)) return { label: 'あなたの返信待ち', tone: 'me' };
  if (c.stage === 'matched' && c.firstMessageSentDay === undefined) return { label: 'マッチ・メッセージ未送信', tone: 'new' };
  if (c.nextDate) return { label: `予定：${inDays(c.nextDate.day - state.day)}`, tone: 'plan' };
  const lastMe = [...visibleMessages(state, c)].reverse().find((m) => m.from !== 'system');
  if (lastMe?.from === 'me') {
    // 未読・既読は出さず、送ってから何日たったかだけ（2026-11-14 指示）
    const ago = state.day - lastMe.day;
    return { label: `${ago <= 0 ? '今日' : `${ago}日前に`}送信`, tone: 'wait' };
  }
  return { label: STAGE_LABEL[c.stage], tone: 'wait' };
}

export function educationOf(npc: Npc): string {
  const e = npc.education;
  if (e.kind === 'vocational') return e.label ?? '専門卒';
  if (e.kind === 'highschool') return '高卒';
  // 大学群（MARCHなど）の説明は出さない（2026-11-08 指示）。医学部・大学院は書く
  if (e.detail === '在学中') return `${e.school}在学中`;
  return e.detail ? `${e.school}${e.detail}` : `${e.school}卒`;
}

export function looksStars(n: number): string {
  // 3.5 のような半分は「⯪」（半分の星）で表す
  const full = Math.floor(n);
  const half = n - full >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '⯪' : '') + '☆'.repeat(5 - full - half);
}

export function distanceLabel(min: number): string {
  return min < 60 ? `片道${min}分` : `片道${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`;
}

/** 検索条件の要約（ヘッダー表示用） */
export function prefsSummary(p: Preference): string[] {
  const out: string[] = [`${p.ageMin}〜${p.ageMax}歳`];
  out.push(p.prefectures.length === 0 || p.prefectures.length === 3 ? '首都圏すべて' : p.prefectures.join('・'));
  if (p.heightMin > 0 || p.heightMax > 0) out.push(`身長${p.heightMin || ''}〜${p.heightMax || ''}cm`);
  if (p.minIncomeYen > 0) out.push(`年収${p.minIncomeYen / 10000}万円以上`);
  if (p.universityOnly) out.push('大卒');
  if (p.neverMarriedOnly) out.push('未婚');
  if (p.noChildrenOnly) out.push('子どもなし');
  if (p.nonSmokerOnly) out.push('吸わない');
  if (p.drinking === 'none') out.push('飲まない');
  if (p.drinking === 'noneOrSometimes') out.push('お酒はときどきまで');
  if (p.holiday === 'weekend') out.push('休日：土日');
  if (p.holiday === 'weekday') out.push('休日：平日');
  return out;
}
