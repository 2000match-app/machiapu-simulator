// ゲーム内の日付（2026-11-09 指示）：毎回11月1日スタート（クリスマス・年末年始をはさむ）。
// 曜日はこれまでどおり開始日を月曜とするので、11月1日が月曜の年（2027年）の暦で数える（年は表示しない）。
const START_UTC = Date.UTC(2027, 10, 1);
const WD = ['月', '火', '水', '木', '金', '土', '日'];

export function calendarParts(day: number): { m: number; d: number } {
  const dt = new Date(START_UTC + day * 86_400_000);
  return { m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function dateLabel(day: number): string {
  const { m, d } = calendarParts(day);
  return `${m}月${d}日`;
}

/** 「11月3日（水）」 */
export function dateWithWeekday(day: number): string {
  return `${dateLabel(day)}（${WD[day % 7]}）`;
}
