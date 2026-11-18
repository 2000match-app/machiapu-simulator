// 時間の進行。1日を「開始（出来事の発生）」と「締め（週末・月末の精算と勝敗判定）」に分け、
// その日に選択が必要な場面がある場合は、選択が終わってから締める（同日の精算後にライフ0なら失敗を優先）。
import { maybeSuggestFacePhoto, processRepliesDaily } from './chat';
import { endContact } from './contact';
import { venueDaily, dayCancel, processDatingDaily, startDate, maybeWorkCall } from './dates';
import { monthlySettlement, recover, weeklySettlement } from './life';
import { receiveLikesDaily, resolveLikes } from './matching';
import { processRelationshipDaily } from './relationship';
import { buildResult } from './feedback';
import { stockDaily, cancelDatesUntil, isTiredDay, likesForToday, privateEventsDaily, tiredNightDaily, unavailableReason } from './privateEvents';
import { DAYS_PER_MONTH, DAYS_PER_YEAR, SPEC_CLEAR_REL_DATES, SPEC_LOSS, SPEC_REST_MAX, SPEC_REST_RECOVERY, TUNE_LIKES_PER_DAY, TUNE_SKIPS_PER_DAY } from './data/rules';
import { addFeed, character, isInRelationship, pushPending, withRng } from './state';
import type { GameState } from './types';

export function isResting(state: GameState): boolean {
  return state.restingUntil !== undefined && state.day <= state.restingUntil;
}

export function openDay(state: GameState): void {
  if (state.status !== 'playing') return;
  state.day += 1;
  if (state.day % DAYS_PER_YEAR === 0) {
    state.player.age += 1;
    addFeed(state, `誕生日を迎え、${state.player.age}歳になった。相手の希望年齢との一致も変わる。`, 'neutral');
  }
  if (!isInRelationship(state)) {
    state.player.appHistoryDays += 1;
    if (!isResting(state)) {
      if (Number(state.flags.lastStrictRatio ?? 1) < 0.05) state.stats.strictFilterDays += 1;
      if (Number(state.flags.lastEstimateRaw ?? 9999) - state.search.exhaustedSeen < 30) state.stats.candidateShortageDays += 1;
    }
  }
  if (isResting(state)) state.week.wasResting = true;
  tiredNightDaily(state);
  state.likesLeft = likesForToday(state, TUNE_LIKES_PER_DAY[state.gender]);
  state.skipsLeft = unavailableReason(state) ? 0 : TUNE_SKIPS_PER_DAY;
  // アプリを使えない日がある週は停滞を数えない（疲れて寝てしまう日は毎週あるので除く）
  if (unavailableReason(state) && !isTiredDay(state)) state.week.wasResting = true;

  receiveLikesDaily(state);
  resolveLikes(state);
  processRepliesDaily(state);
  processDatingDaily(state);
  venueDaily(state); // 男性：デートの1〜3日前に場所を決める（2026-11-18）
  preDateCancellations(state);
  // 体調不良・看病・アプリを閉じている日は会いに行けない（念のため。出来事の時点でキャンセルしている）
  if (unavailableReason(state) && !isTiredDay(state)) cancelDatesUntil(state, state.day, 'ごめんなさい、体調が悪くて…今日は行けなくなってしまいました。');
  for (const c of Object.values(state.contacts)) {
    if (c.stage === 'scheduled' && c.nextDate?.day === state.day && !dayCancel(state, c) && !maybeWorkCall(state, c)) startDate(state, c);
  }
  processRelationshipDaily(state);
  characterMoments(state);
  privateEventsDaily(state);
  stockDaily(state); // 健人・大輔の持ち株（2026-11-18）
  maybeSuggestFacePhoto(state);

  // 締めは呼び出し側が行う（場面があれば選択の後に closeDay）
  state.flags.dayOpen = true;
}

/** 1日進める。選択が必要な場面がなければその日のうちに締める */
export function stepDay(state: GameState): void {
  openDay(state);
  if (state.pending.length === 0) closeDay(state);
}

export function closeDay(state: GameState): void {
  if (!state.flags.dayOpen) return;
  state.flags.dayOpen = false;
  if (state.day % 7 === 0) weeklySettlement(state);
  if (state.day % DAYS_PER_MONTH === 0) monthlySettlement(state);
  if (state.restingUntil === state.day) {
    if (state.recovery.restsUsed < SPEC_REST_MAX) {
      state.recovery.restsUsed += 1;
      recover(state, SPEC_REST_RECOVERY, `7日間アプリを休んだ（${state.recovery.restsUsed}/${SPEC_REST_MAX}回目）`);
    } else {
      state.ledger.push({ day: state.day, delta: 0, category: 'recovery', note: '7日間休んだ（休息による回復は使い切っている）' });
    }
    state.stats.restWeeks += 1;
    state.restingUntil = undefined;
  }
  checkEnd(state);
}

export function checkEnd(state: GameState): void {
  if (state.status !== 'playing') return;
  if (state.life <= 0) {
    state.status = 'gameover';
    state.pending = [];
    state.result = buildResult(state);
    return;
  }
  const pid = state.partnerId;
  const c = pid ? state.contacts[pid] : undefined;
  if (c && c.stage === 'relationship' && c.relationship?.genuine && Number(c.flags.relDates ?? 0) >= SPEC_CLEAR_REL_DATES) {
    state.status = 'cleared';
    state.pending = [];
    state.result = buildResult(state);
  }
}

/** 1週間（週末まで）進める。途中で選択が必要な場面があれば止まる */
export function advanceWeek(state: GameState): void {
  if (state.status !== 'playing' || state.pending.length > 0) return;
  if (state.flags.dayOpen) {
    closeDay(state);
    if (state.status !== 'playing') return;
  }
  do {
    stepDay(state);
  } while (state.status === 'playing' && state.pending.length === 0 && state.day % 7 !== 0);
}

/**
 * 指定日数だけ進める（画面上部の「1日すすめる」「1週間すすめる」）。
 * 途中で選択が必要な場面があれば止まり、選択後に continueAdvance で残りを進める。
 */
export function advanceDays(state: GameState, n: number): void {
  if (state.status !== 'playing' || state.pending.length > 0) return;
  state.flags.advanceUntil = state.day + n;
  continueAdvance(state);
}

export function continueAdvance(state: GameState): void {
  if (state.flags.dayOpen && state.pending.length === 0) closeDay(state);
  const until = Number(state.flags.advanceUntil ?? state.day);
  while (state.status === 'playing' && state.pending.length === 0 && state.day < until) {
    stepDay(state);
  }
  if (state.status !== 'playing' || (state.pending.length === 0 && state.day >= until)) state.flags.advanceUntil = 0;
}

export function isAdvancing(state: GameState): boolean {
  return Number(state.flags.advanceUntil ?? 0) > state.day;
}

/** 7日間アプリを休む。休息中は新しい接触が止まり、時間は進む */
export function canRest(state: GameState): { ok: boolean; reason?: string } {
  // ライフは回復しない（2026-11-03 指示）ので、休息の機能はなくした
  void state;
  return { ok: false, reason: 'ライフは回復しません' };
}

export function startRest(state: GameState): void {
  if (!canRest(state).ok) return;
  state.restingUntil = state.day + 7;
  state.week.wasResting = true;
  addFeed(state, '7日間アプリを閉じることにした。', 'neutral');
  continueRest(state);
}

export function continueRest(state: GameState): void {
  if (state.flags.dayOpen && state.pending.length === 0) closeDay(state);
  while (state.status === 'playing' && state.pending.length === 0 && isResting(state)) {
    stepDay(state);
  }
}

/** 予定の直前に連絡が途絶える（E04：予定前） */
function preDateCancellations(state: GameState): void {
  for (const c of Object.values(state.contacts)) {
    if (c.stage !== 'scheduled' || c.nextDate?.day !== state.day + 1) continue;
    const npc = state.npcs[c.npcId];
    const risky = (npc.purpose === 'ambiguous' && c.interest < 45) || (npc.purpose === 'body' && c.interest < 30);
    if (risky && withRng(state, (r) => r.chance(0.3))) {
      endContact(state, c, {
        by: 'them', cause: '予定の前日に連絡が途絶えた', eventId: 'E04', base: SPEC_LOSS.E04_EARLY,
        visible: `明日の待ち合わせを確認しようとしたら、${npc.name}とのトークが開けなくなっていた。`,
      });
    }
  }
}

/** 人物ごとの節目（固有ルートの場面） */
function characterMoments(state: GameState): void {
  const ch = character(state);
  if (ch.id === 'F03' && state.day === 20 && !state.flags.f03Wedding) {
    state.flags.f03Wedding = true;
    pushPending(state, {
      kind: 'f03_wedding', title: '友人の結婚式の招待状',
      lines: [
        { who: 'narration', text: '大学の友人から、今年3通目の結婚式の招待状が届いた。グループLINEには「次は美咲の番だね！」のスタンプ。' },
      ],
      choices: [
        { id: 'rush', label: '焦って会う人数を増やす' },
        { id: 'pace', label: '自分のペースを保つ' },
      ],
    });
  }
  const remaining = state.player.deadlineMonths - state.day / DAYS_PER_MONTH;
  if (!state.player.deadlineExtended && !state.flags.valueReviewOffered && remaining <= 1 && !isInRelationship(state)) {
    state.flags.valueReviewOffered = true;
    pushPending(state, {
      kind: 'value_review', title: '価値観の見直し（1周に1度）',
      lines: [
        { who: 'narration', text: `自分で決めた「${state.player.deadlineMonths}か月以内に恋人を」という期限が近づいている。` },
        { who: 'narration', text: '期限を見直すことはできる。ただし過去のアプリ歴は戻らない。' },
      ],
      choices: [
        { id: '6', label: '期限を6か月延ばす' },
        { id: '3', label: '期限を3か月延ばす' },
        { id: 'keep', label: '期限は変えない' },
      ],
    });
  }
}
