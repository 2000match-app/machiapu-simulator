// ゲーム状態の生成と共通ヘルパー。
import { Rng } from './rng';
import { aspirationalPreference, getCharacter } from './data/characters';
import { DATA_VERSION, DAYS_PER_MONTH, SPEC_LIFE_START, SPEC_MALE_DEADLINE_MONTHS, TUNE_LIKES_PER_DAY, TUNE_SKIPS_PER_DAY } from './data/rules';
import type { Contact, FeedItem, GameState, MatchRates, Npc, PendingEvent, PlayableCharacter } from './types';
import { generateNpc, type NpcContext } from './npc';
import { assignPhoto } from './photos';

export const SCHEMA_VERSION = 1;

export function newGame(characterId: string, seed: string): GameState {
  const ch = getCharacter(characterId);
  const rng = Rng.fromSeed(seed, 'main');
  const state: GameState = {
    schema: SCHEMA_VERSION,
    dataVersion: DATA_VERSION,
    seed,
    rng: rng.state(),
    characterId,
    gender: ch.gender,
    day: 0,
    life: SPEC_LIFE_START,
    status: 'playing',
    player: {
      age: ch.age,
      photoVisible: ch.photoInitiallyVisible,
      prefs: aspirationalPreference(ch),
      appHistoryDays: ch.appHistoryMonths * DAYS_PER_MONTH,
      deadlineMonths: ch.gender === 'M' ? SPEC_MALE_DEADLINE_MONTHS : ch.relationshipDeadlineMonths,
      deadlineExtended: false,
    },
    npcs: {},
    npcCounter: 0,
    contacts: {},
    received: { total: 0, unseen: 0, queue: [], monthLambda: 0 },
    search: { results: [], generatedDay: -1, exhaustedSeen: 0 },
    likesLeft: TUNE_LIKES_PER_DAY[ch.gender],
    skipsLeft: TUNE_SKIPS_PER_DAY,
    monthSpend: 0,
    ledger: [],
    money: [],
    recovery: {
      restsUsed: 0, firstConversation: false, firstMutualDate: false, firstRelationship: false,
      milestone30: false, milestone60: false,
    },
    week: freshWeek(0),
    pending: [],
    feed: [],
    stats: {
      likesSent: 0, likesSentTopPopular: 0, likesSentMatched: 0,
      receivedTotal: 0, receivedReviewed: 0, receivedAccepted: 0,
      matches: 0, conversations: 0, dates: 0, firstDates: 0, firstDateRejections: 0, relationships: 0,
      photoRequestDrops: 0, photoJudgeLeft: 0, faceUnknownFirstDates: 0, appearanceEndings: 0,
      candidateShortageDays: 0, strictFilterDays: 0, monthlySpend: [], maxActiveConversations: 0, restWeeks: 0,
    },
    eventLog: [],
    flags: {},
    uidCounter: 0,
    // 時間進行（2026-11-13）：月曜の夜から始める。アプリを開いた画面から
    clock: 19 * 60,
    screen: 'app',
    notices: [],
  };
  return state;
}

export function freshWeek(weekIndex: number): GameState['week'] {
  return {
    weekIndex,
    sendsConcluded: 0,
    matchesFromConcluded: 0,
    matchesThisWeek: 0,
    firstMessagesSent: 0,
    twoWayStarted: 0,
    e02: [],
    activeConversationIds: [],
    wasResting: false,
    repliesReceived: 0,
    meetings: 0,
  };
}

export function character(state: GameState): PlayableCharacter {
  return getCharacter(state.characterId);
}

/** 現在の写真公開状態に対応するマッチ率表 */
export function currentRates(state: GameState): MatchRates {
  const ch = character(state);
  if (state.player.photoVisible && !ch.photoInitiallyVisible && ch.ratesPhotoPublic) return ch.ratesPhotoPublic;
  return ch.rates;
}

export function npcContext(state: GameState): NpcContext {
  return { seed: state.seed, character: character(state), playerAge: state.player.age };
}

export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rng);
  const out = fn(rng);
  state.rng = rng.state();
  return out;
}

export function nextUid(state: GameState, prefix: string): string {
  state.uidCounter += 1;
  return `${prefix}-${state.uidCounter}`;
}

export function createNpc(state: GameState, source: 'search' | 'received'): Npc {
  const npc = generateNpc(npcContext(state), state.npcCounter, source, state.day);
  state.npcCounter += 1;
  return npc;
}

/**
 * 一覧に出す相手にだけ写真素材を割り当てて保存する（絞り込みで捨てた相手に素材を使わない）。
 * 写真を割り当てられなかった相手は出さない（2026-11-09 指示）。その場合は null。開発用の再現ケースは requirePhoto=false
 */
export function storeNpc(state: GameState, npc: Npc, requirePhoto = true): Npc | null {
  assignPhoto(state, npc);
  if (requirePhoto && !npc.photo) return null;
  state.npcs[npc.id] = npc;
  return npc;
}

export function ensureContact(state: GameState, npcId: string, fromReceived: boolean): Contact {
  let c = state.contacts[npcId];
  if (!c) {
    c = {
      npcId,
      stage: 'like_sent',
      createdDay: state.day,
      fromReceived,
      messages: [],
      awaitingMe: false,
      twoWay: false,
      exchanges: 0,
      lineExchanged: false,
      faceKnown: state.player.photoVisible,
      faceKnownVia: state.player.photoVisible ? 'photo' : undefined,
      interest: 50,
      dates: [],
      meetings: 0,
      series: { maxLoss: 0, depthBonusApplied: false },
      followUps: [],
      spentYen: 0,
      flags: {},
    };
    state.contacts[npcId] = c;
  }
  return c;
}

export function addFeed(state: GameState, text: string, tone: FeedItem['tone'] = 'neutral', npcId?: string): void {
  state.feed.push({ day: state.day, text, tone, npcId });
  if (state.feed.length > 400) state.feed.splice(0, state.feed.length - 400);
}

export function pushPending(state: GameState, ev: Omit<PendingEvent, 'uid' | 'day'>): PendingEvent {
  const full: PendingEvent = { ...ev, uid: nextUid(state, 'ev'), day: state.day };
  state.pending.push(full);
  return full;
}

export function logEvent(state: GameState, eventId: string, note: string, npcId?: string): void {
  state.eventLog.push({ day: state.day, eventId, npcId, note });
}

export function activeContacts(state: GameState): Contact[] {
  return Object.values(state.contacts).filter((c) => c.stage !== 'ended' && c.stage !== 'like_failed');
}

export function isInRelationship(state: GameState): boolean {
  return !!state.partnerId && state.contacts[state.partnerId]?.stage === 'relationship';
}

export function monthIndex(day: number): number {
  return Math.floor(day / DAYS_PER_MONTH);
}

export function dayLabel(day: number): string {
  const m = Math.floor(day / DAYS_PER_MONTH);
  const d = day % DAYS_PER_MONTH;
  return `${m + 1}か月目 ${d + 1}日`;
}

/**
 * 開発用の分岐固定（1回で消費）。通常プレイでは設定されない。
 * イベントE01〜E24の再現ケースで、確率分岐を指定するためだけに使う。
 */
export function devForce(state: GameState, key: string): string | undefined {
  const k = `dev:${key}`;
  const v = state.flags[k];
  if (v === undefined) return undefined;
  delete state.flags[k];
  return String(v);
}

export function npcName(state: GameState, npcId: string): string {
  return state.npcs[npcId]?.name ?? '相手';
}
