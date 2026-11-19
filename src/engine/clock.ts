// ゲーム内の時刻と生活リズム（2026-11-13 時間進行・ロック画面）。時間の進み方はここで一元管理する。
//
// ・1日の中の時刻 state.clock（0時からの分）。日付（state.day）と1日ごとの処理（openDay/closeDay）は今までどおり。
//   24:00 を過ぎたら、その日を締めて（closeDay）次の日を始める（openDay）。
// ・アプリを開いている間は時刻が止まる。閉じてロック画面にいる間、自由時間は現実約13秒＝1日の速さで進む（画面側のタイマー。2026-11-14 に30秒→20秒→約13秒）。
// ・睡眠・勤務・予定（飲み会など）の時間帯に入ったら、約2秒の表示のあと終わりの時刻まで一気に進める（skipBlock）。
// ・デートは自分で場面を進める。デートの時刻になったら時刻を止め、場面が終わったらデートの終わりの時刻まで進める。
// ・1日の始まり（0時）に届いたメッセージ・出来事には、その日のうちの届く時刻を付ける。時刻が来るまで画面に出さない。
// ・通知（state.notices）は実際に起きたこと（メッセージ・いいね・マッチ・出来事）と、人物の生活リズムの仕事の通知、
//   ほかのアプリ（X・Instagram・LINE・YouTube など。表示だけ）の通知。ロックを解除すると消える（2026-11-14）。
import { closeDay, checkEnd, openDay } from './advance';
import { deliverRepliesUntil } from './chat';
import { EVENT_WINDOWS, lifestyleOf, type Lifestyle } from './data/lifestyles';
import { COMMON_OTHER, OTHER_APPS, OTHER_BY_CHAR, OTHER_FALLBACK, type OtherAppKey, type OtherLine } from './data/otherApps';
import { TUNE_VENUES } from './data/rules';
import { nightShift, privateEventOn, weekendPlan, workFromHome } from './dates';
import { isTiredDay, unavailableReason } from './privateEvents';
import { Rng } from './rng';
import { character, isInRelationship } from './state';
import type { Contact, GameState, Notice, NoticeKind, PendingEvent, VenueTier } from './types';
export type { Notice };

export const DAY_MIN = 1440;
/** ゲームを始める時刻（月曜の夜） */
export const START_CLOCK = 19 * 60;
/** ロック画面の速さ：現実1秒＝ゲーム内108分（約13.3秒で1日。2026-11-14 に30秒→20秒→さらに1.5倍） */
export const GAME_MIN_PER_REAL_SEC = (DAY_MIN / 20) * 1.5;
/** 通知は新しいものから最大この件数を残す */
const NOTICE_CAP = 300;

export type BlockKind = 'sleep' | 'work' | 'remote' | 'event' | 'date';
export interface Block { start: number; end: number; kind: BlockKind; label: string; icon: string; npcId?: string }


export function clockOf(state: GameState): number {
  return state.clock ?? START_CLOCK;
}

export function timeLabel(minute: number): string {
  const m = ((minute % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const isWeekend = (day: number) => day % 7 >= 5;

/** シフト勤務の人が、その日に働くか（週ごとの休みはシードで決まる） */
function worksOn(state: GameState, day: number, ls: Lifestyle): boolean {
  const w = ls.work;
  if (w.kind === 'part' || w.kind === 'none') return false;
  if (!w.days.includes(day % 7)) return false;
  // 夜勤の日・夜勤明けの日は日勤に出ない（看護師。2026-11-19）
  if (nightShift(state, day)) return false;
  if (w.rotatingOff) {
    const off = Rng.fromSeed(state.seed, 'shift-off', Math.floor(day / 7)).shuffle([...w.days]).slice(0, w.rotatingOff);
    if (off.includes(day % 7)) return false;
  }
  return true;
}

/** デートの時間帯（平日は仕事のあと、休日は昼か夜） */
export function dateWindow(day: number, tier: VenueTier): [number, number] {
  if (!isWeekend(day)) return tier === 'cafe' ? [19 * 60, 20 * 60 + 30] : tier === 'casual' ? [19 * 60, 21 * 60] : [19 * 60, 22 * 60];
  if (tier === 'cafe') return [14 * 60, 16 * 60];
  if (tier === 'casual') return [12 * 60, 15 * 60];
  if (tier === 'dinner') return [18 * 60, 21 * 60];
  return [19 * 60, 22 * 60];
}

/** 今日のデート（まだ終わっていないもの） */
function datesToday(state: GameState): Contact[] {
  return Object.values(state.contacts).filter((c) => c.stage !== 'ended'
    && (c.nextDate?.day === state.day || state.pending.some((p) => p.npcId === c.npcId && p.kind.startsWith('date_') && p.day === state.day)));
}

/**
 * その日の生活の時間帯（毎回、今の状態から作り直す。セーブには持たない）。
 * 優先：デート＞予定（飲み会・体調不良・寝落ちなど）＞睡眠＞勤務
 */
export function scheduleOf(state: GameState): Block[] {
  const day = state.day;
  const ch = character(state);
  const ls = lifestyleOf(ch.id);
  const blocks: Block[] = [{ start: 0, end: ls.wake, kind: 'sleep', label: '睡眠中', icon: '🌙' }];
  if (ls.sleep < DAY_MIN) blocks.push({ start: ls.sleep, end: DAY_MIN, kind: 'sleep', label: '睡眠中', icon: '🌙' });
  const dates = datesToday(state);
  // 体調不良・子どもの看病・アプリを閉じている日：起きている間ずっと
  const why = unavailableReason(state);
  if (why) blocks.push({ start: ls.wake, end: ls.sleep, kind: 'event', label: why.includes('看病') ? '子どもの看病中' : why.includes('体調') ? '体調不良で寝込んでいる' : 'アプリを閉じている', icon: why.includes('体調') ? '🤒' : '🏠' });
  // 勤務（シフトの人はデートの日を休みにする）
  let workEnd = 18 * 60;
  const cal = privateEventOn(state, day);
  if (worksOn(state, day, ls) && !(ls.work.kind === 'shift' && dates.length > 0)) {
    let end = ls.work.end;
    if (cal === '残業') end = Math.max(end, ls.overtime?.until ?? EVENT_WINDOWS['残業'].end);
    if (day <= Number(state.player.effects?.busyUntil ?? -1)) end = Math.max(end, 21 * 60 + 30);
    workEnd = end;
    const remote = ls.work.kind === 'remote' || workFromHome(state, day);
    pushWork(blocks, { start: ls.work.start, end, kind: remote ? 'remote' : 'work', label: remote ? '在宅勤務中' : end > ls.work.end ? '残業中' : ls.work.label, icon: remote ? '🏠' : '💼' }, ls.work.label);
  }
  // 寝落ち（健人・大輔）：帰りが遅く、そのまま寝てしまう
  if (isTiredDay(state)) {
    const drinks = String(state.player.effects?.tiredWhy ?? '').includes('飲み会');
    blocks.push({ start: Math.max(19 * 60, workEnd), end: DAY_MIN, kind: 'event', label: drinks ? '飲み会（帰って寝落ち）' : '残業（帰って寝落ち）', icon: drinks ? '🍻' : '💼' });
  }
  // カレンダーの私用（飲み会・会食・休日の予定など）
  for (const label of [cal, weekendPlan(state, day)]) {
    if (!label || label === '残業') continue;
    const w = EVENT_WINDOWS[label] ?? { start: 19 * 60, end: 21 * 60, icon: '📅', state: label };
    pushWork(blocks, { start: w.start, end: w.end, kind: label === 'シフト勤務' ? 'work' : 'event', label: w.state, icon: w.icon });
  }
  // 子どもがいる人は、夕方から寝かしつけまで
  if (ch.constraints.childcare) blocks.push({ start: 18 * 60, end: 20 * 60 + 30, kind: 'event', label: '子どもの世話（夕食・お風呂・寝かしつけ）', icon: '🧒' });
  // 交際相手とのデート（自動で進む）
  for (const c of Object.values(state.contacts)) {
    const rec = c.stage === 'relationship' ? c.dates.find((d) => d.day === day && d.outcome === 'met') : undefined;
    if (rec) {
      const [s, e] = dateWindow(day, rec.tier);
      blocks.push({ start: s, end: e, kind: 'event', label: `${state.npcs[c.npcId]?.name ?? '恋人'}とデート中`, icon: '💕', npcId: c.npcId });
    }
  }
  // 交際前のデート（自分で場面を進める）
  for (const c of dates) {
    const tier = c.nextDate?.tier ?? 'cafe';
    const [s, e] = dateWindow(day, tier);
    blocks.push({ start: s, end: e, kind: 'date', label: `${state.npcs[c.npcId]?.name ?? '相手'}とデート（${TUNE_VENUES[tier].label}）`, icon: '💕', npcId: c.npcId });
  }
  return blocks;
}

/** 勤務の時間帯を入れる（2026-11-14 に昼休み12:00〜13:00を開けたが、同じ日の指示でやめた） */
function pushWork(blocks: Block[], b: Block, morningLabel = b.label): void {
  void morningLabel;
  blocks.push(b);
}

const PRIORITY: Record<BlockKind, number> = { date: 0, event: 1, sleep: 2, work: 3, remote: 4 };

export function blockAt(state: GameState, minute = clockOf(state), blocks = scheduleOf(state)): Block | undefined {
  return blocks.filter((b) => b.start <= minute && minute < b.end).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])[0];
}

const LOCKED: BlockKind[] = ['sleep', 'work', 'event'];

/** 場面（選択が必要な出来事）が今見えるか。届く時刻のないものはすぐ見える */
export function pendingVisible(state: GameState, ev: PendingEvent): boolean {
  return ev.at === undefined || ev.day < state.day || ev.at <= clockOf(state);
}
export function visiblePending(state: GameState): PendingEvent[] {
  return state.pending.filter((p) => pendingVisible(state, p));
}

/** メッセージが今見えるか（届く時刻が来ていないものは見せない） */
export function messageVisible(state: GameState, m: { day: number; minute?: number }): boolean {
  return !(m.day === state.day && (m.minute ?? 0) > clockOf(state));
}
export function visibleMessages<T extends { day: number; minute?: number }>(state: GameState, c: { messages: T[] }): T[] {
  return c.messages.filter((m) => messageVisible(state, m));
}
/** いま自分が返事をする番か（相手のメッセージがまだ届いていなければ、まだ） */
export function awaitingNow(state: GameState, c: Contact): boolean {
  return c.awaitingMe && c.messages.every((m) => messageVisible(state, m));
}

/**
 * ロック画面の状態。
 * pending：確認が必要な出来事がある（時刻を止める。開ける）／block：睡眠・勤務・予定中（2秒の表示で終わりまで進める）／free：自由時間（在宅勤務を含む）
 */
export function lockMode(state: GameState): 'over' | 'pending' | 'block' | 'free' {
  if (state.status !== 'playing') return 'over';
  if (visiblePending(state).length > 0) return 'pending';
  const b = blockAt(state);
  if (b && (LOCKED.includes(b.kind) || b.kind === 'date')) return 'block';
  return 'free';
}

/** いま操作できるか（自由時間・在宅勤務中、または確認が必要な出来事があるとき） */
export function canOpenApp(state: GameState): boolean {
  const m = lockMode(state);
  return m === 'free' || m === 'pending' || m === 'over';
}

/** いまの生活の状態（ロック画面・上部の表示用） */
export function lifeNow(state: GameState): { state: 'FREE' | 'WORKING' | 'SLEEPING' | 'EVENT' | 'REMOTE' | 'DATE'; label: string; icon: string; until?: number; untilLabel?: string } {
  const b = blockAt(state);
  if (!b) {
    const m = clockOf(state);
    return { state: 'FREE', label: '自由時間', icon: m < 12 * 60 ? '☀️' : m < 18 * 60 ? '🌤️' : '🌙' };
  }
  const st = b.kind === 'sleep' ? 'SLEEPING' : b.kind === 'work' ? 'WORKING' : b.kind === 'remote' ? 'REMOTE' : b.kind === 'date' ? 'DATE' : 'EVENT';
  // 寝る時刻が24時より前の人は、翌朝まで
  const wake = lifestyleOf(state.characterId).wake;
  const untilLabel = b.kind === 'sleep' && b.end >= DAY_MIN ? `翌朝${timeLabel(wake)}` : b.end >= DAY_MIN ? '24:00' : timeLabel(b.end);
  return { state: st, label: b.label, icon: b.icon, until: b.end, untilLabel };
}

/** 次に何かが起きる時刻（予定の始まり・場面が見える時刻・日付が変わる時刻） */
export function nextStop(state: GameState): number {
  const now = clockOf(state);
  let next = DAY_MIN;
  for (const b of scheduleOf(state)) if (b.kind !== 'remote' && b.start > now && b.start < next) next = b.start;
  for (const p of state.pending) if (p.at !== undefined && p.day === state.day && p.at > now && p.at < next) next = p.at;
  // 相手の返信が届く時刻（2026-11-14：送った時刻から予約した返信）
  for (const c of Object.values(state.contacts)) {
    const pr = c.pendingReply;
    if (pr && pr.minute !== undefined && pr.day === state.day && pr.minute > now && pr.minute < next) next = pr.minute;
  }
  return next;
}

/** 届く時刻が来た返信を届け、メッセージに時刻を付けて通知する（2026-11-14） */
export function deliverDue(state: GameState): void {
  if (state.status !== 'playing') return;
  for (const d of deliverRepliesUntil(state, clockOf(state))) {
    const c = state.contacts[d.npcId];
    const fresh = c.messages.slice(d.from);
    fresh.forEach((m, i) => { if (m.day === state.day) m.minute = Math.min(DAY_MIN - 1, d.minute + i); });
    const first = fresh.find((m) => m.from === 'them');
    if (!first || c.stage === 'ended') continue;
    const npc = state.npcs[c.npcId];
    const line = c.lineExchanged;
    pushNotice(state, {
      id: `${state.day}:msg:${c.npcId}:${d.minute}`, day: state.day, minute: d.minute, app: line ? 'LINE' : 'マチアプ', icon: line ? '💬' : '💌',
      from: npc?.name ?? '相手', text: first.text.length > 40 ? `${first.text.slice(0, 40)}…` : first.text, npcId: c.npcId, target: 'talk', kind: 'msg',
    });
  }
  checkEnd(state);
}

/**
 * アプリを開いている間の操作で時間を使う（2026-11-14 指示：操作ごとにゲーム内時間）。予定・場面・返信の時刻で止まり、
 * 睡眠・勤務・予定の時刻になったらアプリを閉じる（ロック画面へ）。日付はまたがない
 */
export function useAppTime(state: GameState, minutes: number): void {
  if (state.clock === undefined || state.status !== 'playing' || minutes <= 0) return;
  let left = Number(state.flags.appTimeCarry ?? 0) + minutes;
  const whole = Math.floor(left);
  state.flags.appTimeCarry = left - whole;
  left = whole;
  while (left > 0 && state.status === 'playing') {
    const now = clockOf(state);
    const stop = Math.min(nextStop(state), DAY_MIN - 1);
    if (stop <= now) break;
    const step = Math.min(left, stop - now);
    state.clock = now + step;
    left -= step;
    deliverDue(state);
    const b = blockAt(state);
    if (b && LOCKED.includes(b.kind)) {
      state.screen = 'lock';
      state.flags.lockReason = `${timeLabel(clockOf(state))}になった。${b.label.replace(/中$/, '')}の時間なので、アプリを閉じた`;
      break;
    }
    if (visiblePending(state).length > 0) break;
  }
  if (clockOf(state) >= DAY_MIN - 1 && state.screen !== 'lock') {
    state.screen = 'lock';
    state.flags.lockReason = '日付が変わるので、アプリを閉じた';
  }
}

/** 自由時間に時刻を進める（ロック画面のタイマー）。予定・場面・日付変更の手前で止まる */
export function advanceFree(state: GameState, minutes: number): void {
  let left = Math.max(0, Math.floor(minutes));
  while (left > 0 && lockMode(state) === 'free') {
    const now = clockOf(state);
    const step = Math.min(left, nextStop(state) - now);
    state.clock = now + step;
    left -= step;
    if (state.clock >= DAY_MIN) dayTransition(state);
    else deliverDue(state);
  }
  checkEnd(state);
}

/** 睡眠・勤務・予定の時間帯を、終わりの時刻まで一気に進める（ロック画面の約2秒の表示のあと） */
export function skipBlock(state: GameState): void {
  if (lockMode(state) !== 'block') return;
  const b = blockAt(state);
  if (!b) return;
  if (b.end >= DAY_MIN) {
    state.clock = DAY_MIN;
    dayTransition(state);
    // 24時より前に寝る人は、日付が変わってもそのまま朝まで
    if (b.kind === 'sleep' && state.status === 'playing') {
      const b2 = blockAt(state, 0);
      if (b2?.kind === 'sleep' && visiblePending(state).length === 0) state.clock = b2.end;
    }
  } else {
    state.clock = b.end;
  }
  deliverDue(state);
  checkEnd(state);
}

/**
 * ロック画面の早送り（2026-11-14 壁打ちの指摘）：次の大事な通知（メッセージ・いいね・マッチ・出来事）か、
 * 確認が必要な場面が来るまで進める。睡眠・勤務・予定は飛ばす。最大で2日分
 */
/** 集中モードで待つものがあるか：返事が届く予定の相手か、デートの予定がある（なければ早送りしない） */
export function focusWaiting(state: GameState): boolean {
  return Object.values(state.contacts).some((c) => c.stage !== 'ended' && ((c.pendingReply && c.pendingReply.willReply) || c.nextDate));
}

export function fastForward(state: GameState): 'notice' | 'pending' | 'limit' | 'over' | 'idle' {
  const sm = skipMode(state);
  if (sm === 'focus' && !focusWaiting(state)) return 'idle';
  // 集中モードはメッセージだけ、交際中は恋人からのメッセージだけで止まる（仕事・睡眠・プライベートの出来事は飛ばす）
  const counts = (n: Notice) => {
    const k = noticeKind(n);
    if (sm === 'focus') return k === 'msg';
    if (sm === 'partner') return k === 'msg' && n.npcId === state.partnerId;
    return k !== 'sns' && k !== 'work';
  };
  const important = () => visibleNotices(state).filter(counts).length;
  const start = important();
  const limit = state.day * DAY_MIN + clockOf(state) + 2 * DAY_MIN;
  for (let guard = 0; guard < 400 && state.status === 'playing'; guard++) {
    const mode = lockMode(state);
    if (mode === 'pending') return 'pending';
    if (mode === 'over') return 'over';
    if (mode === 'block') skipBlock(state);
    else advanceFree(state, Math.max(1, nextStop(state) - clockOf(state)));
    if (important() > start) return 'notice';
    if (state.day * DAY_MIN + clockOf(state) >= limit) return 'limit';
  }
  return state.status === 'playing' ? 'limit' : 'over';
}

/** アプリを開いている間に時間を使う行動（電話など）。日付はまたがない */
export function spendMinutes(state: GameState, minutes: number): void {
  useAppTime(state, minutes);
}

/** デートの場面がすべて終わったら、デートの終わりの時刻まで進める */
export function afterDateScene(state: GameState, npcId: string | undefined): void {
  if (!npcId || state.clock === undefined) return;
  if (state.pending.some((p) => p.npcId === npcId && p.kind.startsWith('date_'))) return;
  const c = state.contacts[npcId];
  const rec = c?.dates.find((d) => d.day === state.day);
  if (!rec) return;
  const [s, e] = dateWindow(state.day, rec.tier);
  if (state.clock >= s && state.clock < e) state.clock = e;
}

/** 開いている時間帯の、最初の時刻（場面を見せる時刻を、操作できない時間帯から外す） */
export function nextFreeMinute(state: GameState, minute: number): number {
  const blocks = scheduleOf(state);
  let m = minute;
  for (let i = 0; i < 6; i++) {
    const b = blockAt(state, m, blocks);
    if (!b || !LOCKED.includes(b.kind)) return m;
    if (b.end >= DAY_MIN) return minute; // その日のうちに空かなければ、元の時刻のまま（場面が来たら開ける）
    m = b.end;
  }
  return m;
}

/** 通知の種類（古いセーブの通知は kind が無いので、アプリ名から決める） */
export function noticeKind(n: Notice): NoticeKind {
  if (n.kind) return n.kind;
  if (n.app === '仕事') return 'work';
  if (n.target === 'likes') return 'like';
  if (n.id.includes(':match:')) return 'match';
  if (n.id.includes(':msg:')) return 'msg';
  return 'event';
}
/** ロック画面のどの欄に出すか：マチアプ（相手・予定）／ほかのアプリ／プライベートの出来事 */
export function noticeSection(n: Notice): 'app' | 'other' | 'life' {
  const k = noticeKind(n);
  return k === 'life' ? 'life' : k === 'work' || k === 'sns' ? 'other' : 'app';
}
/**
 * ロック画面の進め方（2026-11-15 指示）：
 * normal＝ふつう／focus＝トークに集中（いいね・マッチの通知なし。メッセージか場面が来るまで早送り）／
 * partner＝交際中（いいね・マッチの通知なし。恋人からのメッセージか場面が来るまで早送り）
 */
export function skipMode(state: GameState): 'normal' | 'focus' | 'partner' {
  if (state.partnerId && isInRelationship(state)) return 'partner';
  return state.focusMode && focusUnlocked(state) ? 'focus' : 'normal';
}

/** トークに集中するモードは、3人以上とマッチしてから使える（それまでは表示しない。2026-11-15 指示） */
export const FOCUS_UNLOCK_MATCHES = 3;
export function focusUnlocked(state: GameState): boolean {
  return state.stats.matches >= FOCUS_UNLOCK_MATCHES;
}

/** 通知の設定でオフにした種類か（いいね・マッチ／トーク。集中モード・交際中はいいね・マッチを出さない。集中モードはほかのアプリの通知も出さない） */
function noticeMuted(state: GameState, n: Notice): boolean {
  const k = noticeKind(n);
  if ((k === 'like' || k === 'match') && skipMode(state) !== 'normal') return true;
  // トークに集中モードでは、ほかのアプリ（SNS・仕事・証券）の通知も出さない（2026-11-18 指示）
  if ((k === 'sns' || k === 'work') && skipMode(state) === 'focus') return true;
  if ((k === 'like' || k === 'match') && state.notify?.likes === false) return true;
  if (k === 'msg' && state.notify?.talk === false) return true;
  return false;
}

function pushNotice(state: GameState, n: Notice): void {
  const list = (state.notices ??= []);
  if (list.some((x) => x.id === n.id)) return;
  if (noticeMuted(state, n)) return;
  list.push(n);
  if (list.length > NOTICE_CAP) list.splice(0, list.length - NOTICE_CAP);
}

/** 通知が今見えるか */
export function noticeVisible(state: GameState, n: Notice): boolean {
  return n.day < state.day || (n.day === state.day && n.minute <= clockOf(state));
}
/** ロック画面に出ている通知（ロック解除で消したもの・オフにした種類は除く）。新しい順 */
export function visibleNotices(state: GameState): Notice[] {
  return (state.notices ?? []).filter((n) => !n.cleared && !noticeMuted(state, n) && noticeVisible(state, n)).sort((a, b) => b.day - a.day || b.minute - a.minute);
}

/** プライベートの出来事のうち、選ぶ必要がないもの（結婚式の招待状など）。ポップアップではなくロック画面の通知で受け取る（2026-11-14） */
export function isLifeNotice(p: PendingEvent): boolean {
  return p.kind.startsWith('pe_') && p.choices.length === 1;
}
const LIFE_ICON: Record<string, string> = {
  pe_wedding: '💌', pe_busy: '💼', pe_sick: '🤒', pe_kid_fever: '🏥', pe_parents: '📞', pe_friend_engaged: '💍',
  pe_expense: '🧺', pe_bonus: '💴', pe_birthday: '🎂', pe_season: '🎄', pe_ex_married: '📱', pe_fee_up: '📢',
};
/** プライベートの出来事をロック画面の通知にする（本文は場面の文、変化の行も付ける） */
export function pushLifeNotice(state: GameState, p: PendingEvent): void {
  const text = p.lines.map((l) => l.text).join('\n');
  pushNotice(state, {
    id: `${state.day}:life:${p.uid}`, day: state.day, minute: clockOf(state), app: 'できごと', icon: LIFE_ICON[p.kind] ?? '📅',
    from: p.title, text, kind: 'life', target: 'app',
  });
}

/**
 * 24時を過ぎたときの日付の変わり目。その日を締め、次の日を始め、届いたものに時刻と通知を付ける。
 * 1日に1回だけ呼ばれる（日付が進むので同じ通知・出来事が二重にできない）
 */
export function dayTransition(state: GameState): void {
  if (state.flags.dayOpen) closeDay(state);
  if (state.status !== 'playing') return;
  const before = {
    received: state.received.total,
    msgLen: Object.fromEntries(Object.values(state.contacts).map((c) => [c.npcId, c.messages.length])),
    stage: Object.fromEntries(Object.values(state.contacts).map((c) => [c.npcId, c.stage])),
    pending: new Set(state.pending.map((p) => p.uid)),
  };
  state.flags.clockOpen = true; // 時刻つきの返信は、openDay では届けず時刻が来てから（2026-11-14）
  openDay(state);
  delete state.flags.clockOpen;
  state.clock = 0;
  if (state.status !== 'playing') return;
  const day = state.day;
  const ls = lifestyleOf(state.characterId);
  const rngFor = (...k: (string | number)[]) => Rng.fromSeed(state.seed, 'clock', day, ...k);
  const msgMinute: Record<string, number> = {};

  // 相手から届いたメッセージ：その日のうちの届く時刻を付ける（7:30〜23:30）。
  // 夜のうちにマッチして相手から先に届くメッセージは、マッチの通知の少しあと（2026-11-14）
  const isNewMatch = (c: Contact) => {
    const was = before.stage[c.npcId];
    return (was === undefined || was === 'like_sent') && c.stage !== 'like_sent' && c.stage !== 'like_failed' && c.stage !== 'ended';
  };
  const matchMinute = (id: string) => rngFor('match', id).int(0, 6 * 60 + 59);
  for (const c of Object.values(state.contacts)) {
    const from = before.msgLen[c.npcId] ?? 0;
    const fresh = c.messages.slice(from).filter((m) => m.day === day);
    if (!fresh.some((m) => m.from === 'them')) continue;
    const m0 = isNewMatch(c) ? matchMinute(c.npcId) + rngFor('opener', c.npcId).int(5, 90) : rngFor('msg', c.npcId).int(7 * 60 + 30, 23 * 60 + 30);
    fresh.forEach((m, i) => { m.minute = Math.min(DAY_MIN - 1, m0 + i); });
    msgMinute[c.npcId] = m0;
    const npc = state.npcs[c.npcId];
    const first = fresh.find((m) => m.from === 'them')!;
    const line = c.lineExchanged;
    pushNotice(state, {
      id: `${day}:msg:${c.npcId}`, day, minute: m0, app: line ? 'LINE' : 'マチアプ', icon: line ? '💬' : '💌',
      from: npc?.name ?? '相手', text: first.text.length > 40 ? `${first.text.slice(0, 40)}…` : first.text, npcId: c.npcId, target: 'talk', kind: 'msg',
    });
  }
  // いいね・マッチ：夜のうちに届いていた
  const likes = state.received.total - before.received;
  if (likes > 0) {
    pushNotice(state, { id: `${day}:likes`, day, minute: rngFor('likes').int(0, 6 * 60 + 59), app: 'マチアプ', icon: '♡', from: 'マチアプ', text: `${likes}人からいいねが届きました`, target: 'likes', kind: 'like' });
  }
  for (const c of Object.values(state.contacts)) {
    const was = before.stage[c.npcId];
    if ((was === undefined || was === 'like_sent') && (c.stage === 'matched' || c.stage === 'talking')) {
      pushNotice(state, { id: `${day}:match:${c.npcId}`, day, minute: matchMinute(c.npcId), app: 'マチアプ', icon: '🎉', from: 'マチアプ', text: `${state.npcs[c.npcId]?.name ?? '相手'}さんとマッチしました！`, npcId: c.npcId, target: 'talk', kind: 'match' });
    }
  }
  // 選択が必要な出来事：デートはデートの時刻（身支度は1時間前）、メッセージに続くものはそのメッセージの時刻、ほかは朝
  const dateBlocks = scheduleOf(state).filter((b) => b.kind === 'date');
  for (const p of state.pending) {
    if (before.pending.has(p.uid) || p.at !== undefined) continue;
    const db = dateBlocks.find((b) => b.npcId === p.npcId);
    let at: number;
    if (db && p.kind.startsWith('date_') && p.kind !== 'date_pick' && p.kind !== 'date_nomatch') at = p.kind === 'date_makeup' ? Math.max(ls.wake, db.start - 60) : db.start;
    else if (p.npcId && msgMinute[p.npcId] !== undefined) at = nextFreeMinute(state, msgMinute[p.npcId] + 1);
    else at = nextFreeMinute(state, ls.wake);
    p.at = Math.min(DAY_MIN - 1, at);
    if (isLifeNotice(p)) continue; // 届いた時刻に、ロック画面の「できごと」として出す（actions の autoLifeEvents）
    const npc = p.npcId ? state.npcs[p.npcId] : undefined;
    pushNotice(state, {
      id: `${day}:ev:${p.uid}`, day, minute: p.at, app: db && p.npcId === db.npcId ? 'カレンダー' : 'お知らせ', icon: db && p.npcId === db.npcId ? '💕' : '📌',
      from: npc ? npc.name : 'お知らせ',
      text: db && p.npcId === db.npcId ? (p.kind === 'date_makeup' ? 'そろそろデートの準備をする時間です' : `${npc?.name ?? '相手'}さんとの約束の時間です（${db.label.replace(/^.*（|）$/g, '')}）`) : p.title,
      npcId: p.npcId, target: 'app', kind: 'event',
    });
  }
  // 仕事・予定の通知（人物の生活リズム。実際の予定に合わせたものと、ときどき届くもの）
  workNotices(state, ls);
  // ほかのアプリの通知（表示だけ）
  otherAppNotices(state);
  // 持ち株の値動き（健人・大輔。予算が増減する。2026-11-18）
  const sn = String(state.flags.stockNote ?? '').split('|');
  if (Number(sn[0]) === day && sn.length === 3) {
    const up = sn[1].startsWith('+');
    pushNotice(state, { id: `${day}:stock`, day, minute: 15 * 60 + 5, app: '証券', icon: up ? '📈' : '📉', from: '保有株の値動き', text: `保有株が${sn[1]}（評価額 ${sn[2]}）。今月のデートの予算が${up ? '増えました' : '減りました'}`, kind: 'work' });
  }
}

/** ほかのアプリの通知：1日3〜6件。人物ごとの文面を多めに、誰にでも届く文面を混ぜる（2026-11-14） */
function otherAppNotices(state: GameState): void {
  const day = state.day;
  const r = Rng.fromSeed(state.seed, 'clock', day, 'other');
  const own = OTHER_BY_CHAR[state.characterId] ?? OTHER_FALLBACK[state.gender];
  const pool: { key: OtherAppKey; line: OtherLine; w: number }[] = [];
  for (const [key, lines] of Object.entries(own) as [OtherAppKey, OtherLine[]][]) for (const line of lines) pool.push({ key, line, w: 3 });
  for (const [key, lines] of Object.entries(COMMON_OTHER) as [OtherAppKey, OtherLine[]][]) for (const line of lines) pool.push({ key, line, w: 1 });
  const n = r.int(3, 6);
  const used = new Set<string>();
  for (let k = 0; k < n; k++) {
    const total = pool.reduce((a, x) => a + (used.has(x.line.text) ? 0 : x.w), 0);
    if (total <= 0) break;
    let roll = r.next() * total;
    const pick = pool.find((x) => !used.has(x.line.text) && (roll -= x.w) < 0) ?? pool.find((x) => !used.has(x.line.text))!;
    used.add(pick.line.text);
    const app = OTHER_APPS[pick.key];
    const minute = pick.key === 'weather' ? r.int(6 * 60 + 30, 7 * 60 + 30) : pick.key === 'news' ? r.int(7 * 60, 22 * 60) : r.int(7 * 60, 23 * 60 + 50);
    pushNotice(state, { id: `${day}:sns:${k}`, day, minute, app: app.app, icon: app.icon, from: pick.line.from, text: pick.line.text, kind: 'sns' });
  }
}

function workNotices(state: GameState, ls: Lifestyle): void {
  const day = state.day;
  const r = Rng.fromSeed(state.seed, 'clock', day, 'work');
  const blocks = scheduleOf(state);
  const work = blocks.find((b) => b.kind === 'work' || b.kind === 'remote');
  const cal = privateEventOn(state, day);
  // 残業の日：夕方に残業の依頼
  if (cal === '残業' && ls.overtime && work) {
    pushNotice(state, { id: `${day}:overtime`, day, minute: Math.max(work.start, 16 * 60 + 30), kind: 'work', app: '仕事', icon: '💼', from: ls.noticeFrom, text: r.pick(ls.overtime.notices) });
  }
  if (isTiredDay(state)) {
    const drinks = String(state.player.effects?.tiredWhy ?? '').includes('飲み会');
    const text = drinks ? (ls.eventNotices?.会社の飲み会?.text ?? '今日飲み行かない？') : (ls.overtime ? r.pick(ls.overtime.notices) : '今日少し残業できる？');
    pushNotice(state, { id: `${day}:tired`, day, minute: 16 * 60 + 15, kind: 'work', app: '仕事', icon: drinks ? '🍻' : '💼', from: drinks ? '先輩' : ls.noticeFrom, text });
  }
  // 予定に合わせた通知（当日、または何日か前）
  for (let k = 0; k <= 3; k++) {
    const label = privateEventOn(state, day + k);
    const n = label ? ls.eventNotices?.[label] : undefined;
    if (!label || !n || (n.daysBefore ?? 0) !== k) continue;
    pushNotice(state, { id: `${day}:plan:${label}:${k}`, day, minute: n.at, kind: 'work', app: '仕事', icon: EVENT_WINDOWS[label]?.icon ?? '📅', from: n.from, text: n.text });
  }
  // ときどき届く仕事の通知（勤務の日は勤務中、パートは昼）
  if (ls.notices.length > 0 && r.chance(ls.noticeChance) && (work || ls.work.kind === 'part')) {
    const minute = work ? r.int(work.start + 30, Math.max(work.start + 31, work.end - 30)) : r.int(11 * 60, 20 * 60);
    pushNotice(state, { id: `${day}:work`, day, minute, kind: 'work', app: '仕事', icon: ls.work.kind === 'part' || ls.work.kind === 'shift' ? '🗓️' : '💼', from: ls.noticeFrom, text: r.pick(ls.notices) });
  }
}
