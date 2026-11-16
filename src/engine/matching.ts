// 検索・いいね送信・受信いいね（仕様v0.3 §6）。
// 受信いいね・送信成立・相互マッチ・会話成立は別指標として数え、同じ相手を送受信で二重計上しない。
import { calibrationFor, estimateCandidates, passesNpcPrefs, passesPlayerPrefs, popularTop10, rawSendMultiplier } from './npc';
import { recoverOnce } from './life';
import { playerPopularity } from './appeal';
import { SPEC_LIKE_WAIT_DAYS, TUNE_BOOST, TUNE_FIRST_REPLY, TUNE_FUNNEL, TUNE_MALE_EMPTY, isNormalPurpose } from './data/rules';
import { initialInterest } from './appeal';
import { freePhotoCount } from './photos';
import { addFeed, character, createNpc, currentRates, ensureContact, storeNpc, withRng } from './state';
import type { Contact, GameState, Npc, Preference } from './types';
import { pushMsg } from './contact';
import { PREFECTURES } from './data/areas';

const SEARCH_PAGE = 12;

/** 1件のいいねが相互マッチになる確率（表の送信成立率×較正済みの相手ごとの倍率） */
export function sendProbability(state: GameState, npc: Npc): number {
  const ch = character(state);
  const p0 = currentRates(state).sendSuccess;
  const calib = calibrationFor(ch, state.player.age, p0);
  return Math.min(0.95, p0 * calib * rawSendMultiplier(npc, ch, state.player.age));
}

export function candidateEstimate(state: GameState): number {
  const ch = character(state);
  const seen = state.search.exhaustedSeen;
  return Math.max(0, estimateCandidates(ch, state.player.age, state.player.prefs) - seen);
}

/** 絞り込みをすべて外した検索条件（年齢は自分の±5歳、居住地は首都圏すべて） */
export function openPreference(age: number): Preference {
  return {
    ageMin: age - 5, ageMax: age + 5, prefectures: [...PREFECTURES], heightMin: 0, heightMax: 0, minIncomeYen: 0,
    universityOnly: false, neverMarriedOnly: false, noChildrenOnly: false, nonSmokerOnly: false, drinking: 'any', holiday: 'any', photoOnly: false,
  };
}

/** 条件を1つ緩めた時に候補が何人増えるか（§6） */
export function relaxDeltas(state: GameState, prefs: Preference = state.player.prefs): { key: string; label: string; delta: number }[] {
  const ch = character(state);
  const p = prefs;
  const base = estimateCandidates(ch, state.player.age, p);
  const out: { key: string; label: string; delta: number }[] = [];
  const tryPref = (key: string, label: string, np: Preference) => {
    const n = estimateCandidates(ch, state.player.age, np);
    if (n > base) out.push({ key, label, delta: n - base });
  };
  tryPref('age', '年齢を上下2歳広げる', { ...p, ageMin: p.ageMin - 2, ageMax: p.ageMax + 2 });
  if (p.prefectures.length > 0 && p.prefectures.length < PREFECTURES.length) tryPref('pref', '居住地を首都圏すべてにする', { ...p, prefectures: [...PREFECTURES] });
  if (p.heightMin > 0 || p.heightMax > 0) tryPref('height', '身長の条件を外す', { ...p, heightMin: 0, heightMax: 0 });
  if (p.minIncomeYen > 0) tryPref('income', '年収の条件を外す', { ...p, minIncomeYen: 0 });
  if (p.universityOnly) tryPref('univ', '学歴の条件を外す', { ...p, universityOnly: false });
  if (p.neverMarriedOnly) tryPref('marital', '結婚歴の条件を外す', { ...p, neverMarriedOnly: false });
  if (p.noChildrenOnly) tryPref('children', '子どもの条件を外す', { ...p, noChildrenOnly: false });
  if (p.nonSmokerOnly) tryPref('smoking', '喫煙の条件を外す', { ...p, nonSmokerOnly: false });
  if (p.drinking !== 'any') tryPref('drinking', 'お酒の条件を外す', { ...p, drinking: 'any' });
  if (p.holiday !== 'any') tryPref('holiday', '休日の条件を外す', { ...p, holiday: 'any' });
  return out;
}

/**
 * 検索結果を追加で読み込む（無限スクロール）。条件に合う未接触の相手だけを生成する。
 * reset なら一覧を作り直す。条件に合う人数（推定）を超えては出さない。
 */
export function loadSearch(state: GameState, count: number, reset: boolean): string[] {
  if (reset) state.search.results = [];
  dropFromSearch(state);
  const est = candidateEstimate(state);
  const added: string[] = [];
  let attempts = 0;
  // 同じ条件・同じ残り素材で前回見つからなかったら、探し直さない（写真素材が尽きた後に重くならないように）
  const dryKey = `${JSON.stringify(state.player.prefs)}|${freePhotoCount(state)}`;
  if (state.search.dryKey === dryKey) return added;
  // 写真素材を使い切ると、それ以上の相手は出てこない
  while (added.length < count && state.search.results.length + added.length < est && attempts < 1500 && freePhotoCount(state) > 0) {
    attempts++;
    const npc = createNpc(state, 'search');
    if (!passesPlayerPrefs(npc, state.player.prefs)) continue;
    if (!storeNpc(state, npc)) continue; // 写真のない相手は出さない
    added.push(npc.id);
  }
  if (added.length === 0) state.search.dryKey = dryKey;
  state.search.results = [...state.search.results, ...added];
  state.search.generatedDay = state.day;
  updateStrictness(state);
  return added;
}

/** いいね済み（接触済み）の相手を検索一覧から外す */
export function dropFromSearch(state: GameState): void {
  state.search.results = state.search.results.filter((id) => !state.contacts[id]);
}

/** 検索で見送る（左スワイプ）。一覧から外し、もう出さない。見た人数として数える */
export function skipSearch(state: GameState, npcId: string): void {
  if (!state.search.results.includes(npcId)) return;
  // スキップの回数に上限はない（2026-11-13：時間はロック画面で進むので、日送りの仕組みはやめた）
  state.search.results = state.search.results.filter((id) => id !== npcId);
  state.search.exhaustedSeen += 1;
}

/** 互換用：一覧を作り直して1ページ分を読み込む */
export function runSearch(state: GameState): string[] {
  return loadSearch(state, SEARCH_PAGE, true);
}

/** 条件の厳しさの記録（「条件を重ねすぎ」判定用）。探索対象＝年齢±5・首都圏の全員 */
export function updateStrictness(state: GameState): void {
  const ch = character(state);
  const loose = estimateCandidates(ch, state.player.age, openPreference(state.player.age));
  const strict = estimateCandidates(ch, state.player.age, state.player.prefs);
  state.flags.lastStrictRatio = loose > 0 ? strict / loose : 1;
  state.flags.lastEstimateRaw = strict;
}

export function sendLike(state: GameState, npcId: string): boolean {
  const npc = state.npcs[npcId];
  if (!npc) return false; // いいねの回数制限はなし（2026-11-13）
  if (state.contacts[npcId]) return false; // 同じ相手へ二重に送らない
  const c = ensureContact(state, npcId, false);
  c.stage = 'like_sent';
  c.sentLikeDay = state.day;
  const p = sendProbability(state, npc);
  const willMatch = withRng(state, (rng) => rng.chance(p));
  c.likeWillMatch = willMatch;
  c.likeResolveDay = willMatch
    ? state.day + withRng(state, (rng) => rng.int(1, SPEC_LIKE_WAIT_DAYS))
    : state.day + SPEC_LIKE_WAIT_DAYS;
  c.flags.sendP = Math.round(p * 1000) / 1000;
  state.stats.likesSent += 1;
  if (popularTop10(npc)) state.stats.likesSentTopPopular += 1;
  state.search.exhaustedSeen += 1;
  if (!passesNpcPrefs(npc, character(state), state.player.age)) c.flags.prefMismatch = true;
  return true;
}

/** 毎日：反応待ちが終わったいいねを確定させる */
export function resolveLikes(state: GameState): void {
  for (const c of Object.values(state.contacts)) {
    if (c.stage !== 'like_sent' || c.likeResolveDay !== state.day) continue;
    state.week.sendsConcluded += 1;
    if (c.likeWillMatch) {
      state.week.matchesFromConcluded += 1;
      becomeMatched(state, c);
      state.stats.likesSentMatched += 1;
    } else {
      c.stage = 'like_failed';
    }
  }
}

export function rollReach(state: GameState): number {
  // 偏差値が高い男性プレイヤー（健人など）は、会話が続く・約束まで進む相手が多い（2026-11-09）
  const k = (TUNE_FUNNEL.looksMult[character(state).looks] ?? 1) * (state.gender === 'M' ? 1 + 0.3 * playerPopularity(state) : 1);
  const p = (x: number) => Math.min(TUNE_FUNNEL.cap, x * k);
  const u = withRng(state, (r) => r.next());
  return u < p(TUNE_FUNNEL.meet) ? 3 : u < p(TUNE_FUNNEL.promise) ? 2 : u < p(TUNE_FUNNEL.talk) ? 1 : 0;
}

export function becomeMatched(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  c.stage = 'matched';
  c.matchedDay = state.day;
  state.stats.matches += 1;
  state.week.matchesThisWeek += 1;
  pushMsg(c, state.day, 'system', `${npc.name}さんとマッチしました`);
  addFeed(state, `${npc.name}（${npc.age}）とマッチした。`, 'good', c.npcId);
  // 最初の興味は魅力度で決まる（マッチしても温度は人それぞれ）
  c.interest = initialInterest(state, c, npc);
  // どこまで進むかの上限（会話70%・約束30%・対面20%×自分の容姿の倍率）
  if (isNormalPurpose(npc.purpose)) {
    let reach = rollReach(state);
    // 加工写真の相手はドタキャンが多い：会えるはずの相手の半分は約束だけで来ない（2026-11-07）
    if (npc.filteredPhoto && reach === 3 && withRng(state, (r) => r.chance(0.5))) reach = 2;
    c.flags.reach = c.flags.reachRolled = reach;
    // 男性プレイヤー：会話にならない相手の半分は、マッチしても一度も返信しない
    if (state.gender === 'M' && reach === 0) c.flags.silent = withRng(state, (r) => r.chance(TUNE_MALE_EMPTY.silentShare * (1 - 0.7 * playerPopularity(state))));
  }
  // 相手から先にメッセージが来る場合（2026-11-14 指示：男性NPCから約7割、女性NPCから約2割。一度も返信しない相手からは来ない）
  const pOpener = TUNE_FIRST_REPLY.openerFromThem[state.gender];
  const firstFromThem = !c.flags.silent && withRng(state, (rng) => rng.chance(pOpener));
  if (firstFromThem) {
    // マッチしてすぐ送ってくる（夜のうちのマッチはその日のうち、アプリでいいね返ししたときはその場で。2026-11-14）
    c.pendingReply = { day: state.day, kind: 'opener', willReply: true, expireDay: state.day };
  }
}

/** 毎日：受信いいねの到着（休息中は止まる） */
export function receiveLikesDaily(state: GameState): void {
  if (state.restingUntil !== undefined && state.day <= state.restingUntil) return;
  const boost = state.boostUntil !== undefined && state.day <= state.boostUntil ? TUNE_BOOST.receivedMultiplier : 1;
  const n = withRng(state, (rng) => rng.poisson((state.received.monthLambda / 30) * boost));
  if (n > 0) {
    state.received.total += n;
    state.received.unseen += n;
    state.stats.receivedTotal += n;
  }
}

/**
 * 受信いいねのプロフィールを生成して一覧に並べる（無限スクロールで少しずつ読み込む）。
 * 相手はプレイヤーの公開情報（年齢・年収・子ども・学歴・喫煙・結婚歴・身長）で必須条件を満たした上で送ってきている。
 * 実際のアプリと同じく、受信いいねの一覧はこちらの検索条件では絞り込まない。
 * 顔写真なしの間は、相手は顔を見ていない。
 */
export function loadReceived(state: GameState, count: number, onlyMatchingPrefs = false): string[] {
  const ch = character(state);
  const out: string[] = [];
  let misses = 0;
  while (out.length < count && state.received.unseen > 0) {
    // 写真の合う相手が3回続けて見つからなければ、残りは届かなかったことにする
    if (misses >= 3) { state.received.unseen = 0; break; }
    // 写真素材を使い切ったら、それ以上のいいねは届かない（写真のない相手は出さない。2026-11-09）
    if (freePhotoCount(state) === 0) { state.received.unseen = 0; break; }
    let npc: Npc | null = null;
    for (let i = 0; i < 150; i++) {
      const cand = createNpc(state, 'received');
      if (!passesNpcPrefs(cand, ch, state.player.age)) continue;
      // 遠い相手からのいいねは少なめ（片道2時間超は3割だけ）
      if (cand.distanceMin > 120 && !withRng(state, (r) => r.chance(0.3))) continue;
      if (onlyMatchingPrefs && !passesPlayerPrefs(cand, state.player.prefs)) continue;
      if (!storeNpc(state, cand)) continue;
      npc = cand;
      break;
    }
    state.received.unseen -= 1;
    if (!npc) { misses++; continue; }
    misses = 0;
    state.stats.receivedReviewed += 1;
    state.received.queue.push(npc.id);
    out.push(npc.id);
  }
  return out;
}

export function acceptReceived(state: GameState, npcId: string): void {
  if (!state.received.queue.includes(npcId)) return;
  state.received.queue = state.received.queue.filter((id) => id !== npcId);
  if (state.contacts[npcId]) return;
  const c = ensureContact(state, npcId, true);
  state.stats.receivedAccepted += 1;
  becomeMatched(state, c);
}

export function skipReceived(state: GameState, npcIds: string[] | 'all-unseen'): void {
  if (npcIds === 'all-unseen') {
    state.stats.receivedReviewed += state.received.unseen;
    state.received.unseen = 0;
    state.received.queue = [];
    return;
  }
  state.received.queue = state.received.queue.filter((id) => !npcIds.includes(id));
}

export function firstConversationRecovery(state: GameState): void {
  recoverOnce(state, 'firstConversation', 3, '初めて双方向の会話が成立');
}
