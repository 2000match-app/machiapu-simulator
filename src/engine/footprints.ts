// あしあと（2026-11-28 指示）：自分のプロフィールを見た相手の一覧。
// ・こちらがいいねを送った相手は、高い確率で0〜2日のうちに見に来る（いいねを確かめるため）
// ・いいねをくれた相手も、その前にプロフィールを見ている
// ・見ただけでいいねはしない人も来る（受信いいねの0.6倍くらい）。プロフィールは一覧を開いたときに作る（写真素材を使いすぎない）
// ・あしあとの相手には、こちらからいいねを送れる。見に来た相手は少しマッチしやすい
// 抽選は別の乱数列で、ほかの抽選・会話の流れはずらさない。
import { Rng } from './rng';
import { passesNpcPrefs } from './npc';
import { freePhotoCount } from './photos';
import { character, createNpc, storeNpc } from './state';
import type { GameState } from './types';

export const TUNE_FOOTPRINT = {
  /** いいねを送った相手が見に来る確率 */
  fromLiked: 0.85,
  /** いいねをくれた相手のあしあとが残る確率 */
  fromLiker: 0.8,
  /** 見ただけの人（受信いいねの何倍か） */
  visitorsPerLike: 0.6,
  /** あしあとを付けた相手にこちらからいいねしたとき、マッチしやすくなる倍率 */
  likeBackBoost: 1.5,
  /** 一覧に残す件数 */
  keep: 300,
} as const;

export interface Footprint {
  npcId: string;
  day: number;
  /** 0時からの分 */
  minute: number;
  /** いいねはせずに見ただけの人 */
  visitor?: boolean;
}

const at = (f: { day: number; minute: number }) => f.day * 1440 + f.minute;
const nowOf = (state: GameState) => state.day * 1440 + (state.clock ?? 20 * 60);
/** 登録した時刻（0日目の19時）より前のあしあとは付けない */
const REGISTERED = 19 * 60;

function add(state: GameState, f: Footprint): void {
  const list = (state.footprints ??= []);
  const i = list.findIndex((x) => x.npcId === f.npcId);
  // 同じ相手は新しい方だけ残す
  if (i >= 0) {
    if (at(list[i]) >= at(f)) return;
    list.splice(i, 1);
  }
  list.push(f);
  if (list.length > TUNE_FOOTPRINT.keep * 2) {
    list.sort((a, b) => at(b) - at(a));
    list.length = TUNE_FOOTPRINT.keep;
  }
}

/** いいねを送ったとき：相手が見に来る時刻を決めておく（その時刻になると一覧に出る） */
export function footprintAfterLike(state: GameState, npcId: string): void {
  const r = Rng.fromSeed(state.seed, 'fp-like', npcId);
  if (!r.chance(TUNE_FOOTPRINT.fromLiked)) return;
  let t = nowOf(state) + r.int(20, 60 * 48);
  // 夜中（2〜7時）は見に来ない：朝に回す
  const m = t % 1440;
  if (m >= 120 && m < 420) t += 420 - m + r.int(0, 120);
  add(state, { npcId, day: Math.floor(t / 1440), minute: t % 1440 });
}

/** いいねをくれた相手のあしあと（受信いいねのプロフィールを作ったとき） */
export function footprintFromLiker(state: GameState, npcId: string): void {
  const r = Rng.fromSeed(state.seed, 'fp-liker', npcId);
  if (!r.chance(TUNE_FOOTPRINT.fromLiker)) return;
  const t = Math.max(REGISTERED, nowOf(state) - r.int(5, 60 * 24));
  add(state, { npcId, day: Math.floor(t / 1440), minute: t % 1440 });
}

/** 毎日：見ただけの人の数を足す（プロフィールは一覧を開いたときに作る） */
export function addVisitorsDaily(state: GameState, likesPerDay: number): void {
  const n = Rng.fromSeed(state.seed, 'fp-visitors', state.day).poisson(likesPerDay * TUNE_FOOTPRINT.visitorsPerLike);
  if (n > 0) state.footprintVisitors = (state.footprintVisitors ?? 0) + n;
}

/** 見ただけの人のプロフィールを作って一覧に並べる（受信いいねと同じく、相手の条件を満たす人だけ） */
export function loadVisitors(state: GameState, count: number): number {
  const ch = character(state);
  let made = 0;
  let misses = 0;
  while (made < count && (state.footprintVisitors ?? 0) > 0) {
    if (misses >= 3 || freePhotoCount(state) === 0) { state.footprintVisitors = 0; break; }
    state.footprintVisitors = (state.footprintVisitors ?? 0) - 1;
    let id: string | null = null;
    for (let i = 0; i < 150 && !id; i++) {
      const cand = createNpc(state, 'received');
      if (!passesNpcPrefs(cand, ch, state.player.age)) continue;
      if (cand.distanceMin > 120 && i % 3 !== 0) continue;
      if (storeNpc(state, cand)) id = cand.id;
    }
    if (!id) { misses++; continue; }
    misses = 0;
    const r = Rng.fromSeed(state.seed, 'fp-visit', id);
    const t = Math.max(REGISTERED, nowOf(state) - r.int(5, 60 * 24 * 3));
    add(state, { npcId: id, day: Math.floor(t / 1440), minute: t % 1440, visitor: true });
    made++;
  }
  return made;
}

/** 今見えているあしあと（新しい順） */
export function visibleFootprints(state: GameState): Footprint[] {
  const now = nowOf(state);
  return (state.footprints ?? []).filter((f) => at(f) <= now && state.npcs[f.npcId]).sort((a, b) => at(b) - at(a));
}

/** まだ見ていない新しいあしあとの数 */
export function newFootprintCount(state: GameState): number {
  const seen = state.footprintsSeenAt ?? -1;
  return visibleFootprints(state).filter((f) => at(f) > seen).length + (state.footprintVisitors ?? 0);
}

export function markFootprintsSeen(state: GameState): void {
  state.footprintsSeenAt = nowOf(state);
}

/** こちらがいいねする前に、相手があしあとを付けていたか（見に来た相手は少しマッチしやすい） */
export function visitedBeforeLike(state: GameState, npcId: string): boolean {
  const now = nowOf(state);
  return (state.footprints ?? []).some((f) => f.npcId === npcId && at(f) <= now);
}

/** 「◯分前」「◯時間前」「◯日前」 */
export function agoLabel(state: GameState, f: Footprint): string {
  const d = nowOf(state) - at(f);
  if (d < 60) return `${Math.max(1, d)}分前`;
  if (d < 1440) return `${Math.floor(d / 60)}時間前`;
  return `${Math.floor(d / 1440)}日前`;
}
