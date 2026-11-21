// ライフと金銭の精算（仕様v0.3 §7・§9「同じ出来事を何度も引かない」）。
import {
  DAYS_PER_MONTH, SPEC_DEPTH_MEETINGS3, SPEC_DEPTH_RELATIONSHIP30, SPEC_E02_LOSS, SPEC_E20_10PLUS, SPEC_E20_6TO9,
  SPEC_FEMALE_BUDGET_TIERS, SPEC_FEMALE_WEEKLY_NO_MATCH, SPEC_MALE_BUDGET_TIERS,
  SPEC_MALE_DEADLINE_OVER_LOSS, SPEC_MALE_MONTHLY_SEARCH_FATIGUE, SPEC_MALE_SERVICE_FEE_PER_30,
  SPEC_MALE_WEEKLY_NO_CONVERSATION, SPEC_MALE_WEEKLY_NO_MATCH, SPEC_RELATIONSHIP_MONTHLY_FATIGUE,
  SPEC_SHALLOW_WEEKLY_CAP, SPEC_WEEKLY_NO_MATCH_MIN_SENDS, TUNE_STAGNATION, specDeadlineLoss,
  specFemaleAppHistoryLoss, TUNE_RECEIVED_SCALE } from './data/rules';
import { addFeed, character, freshWeek, isInRelationship, monthIndex, withRng } from './state';
import type { Contact, GameState, LifeCategory, MoneyCategory } from './types';

/** 今月の活動予算（ボーナスなどプライベートの出来事で増減する） */
export function monthBudget(state: GameState): number {
  const adj = state.player.budgetAdjust;
  return character(state).monthlyBudgetYen + (adj && adj.month === monthIndex(state.day) ? adj.yen : 0);
}

/** 男性の有料会員の料金（料金改定の出来事で上がる） */
export function memberFee(state: GameState): number {
  return state.player.feeYen ?? SPEC_MALE_SERVICE_FEE_PER_30;
}

/**
 * 人物ごとのダメージ倍率は 2026-11-13 にやめた（Gemini の指摘「ハイスペは心が強いという隠し補正になっている」をユーザーが採用）。
 * 全員同じ損失を受ける。呼び出し側を変えずに済むよう関数は残す
 */
export function charScaled(_state: GameState, amount: number): number {
  return amount;
}

export function applyLoss(
  state: GameState,
  amount: number,
  category: LifeCategory,
  note: string,
  opts: { eventId?: string; npcId?: string; detail?: string } = {},
): number {
  // ライフは整数（2026-11-21 指示：「また会いたい」の本気度・旅行の倍率などで 4.55 のような小数になっていた）
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  // 友人の婚約などで焦っている間は、断られたり途切れたりした時のダメージが大きい
  if (category === 'event' && opts.eventId && state.day <= (state.player.effects?.anxiousUntil ?? -1)) amount += 3;
  amount = charScaled(state, amount);
  const before = state.life;
  // 古いセーブに小数のライフが残っていても、ここで整数に戻す
  state.life = Math.max(0, Math.round(state.life) - amount);
  state.ledger.push({ day: state.day, delta: -amount, category, note, ...opts });
  // ライフが減ると相手の容姿・偏差値が見える機能は、実際のアプリにないので 2026-11-13 にやめた
  if (before >= 50 && state.life < 50 && state.life > 0) addFeed(state, 'ライフが50を切った。絞り込みを広げてみよう。', 'bad');
  return amount;
}

/**
 * 同じ相手との一連の出来事（既読無視→ヤリ捨て→ブロック等）は1本の系列。
 * 系列中の最大損失を採用し、既に差し引いた分との差額だけを追加する。
 */
export function seriesLoss(state: GameState, contact: Contact, base: number, eventId: string, note: string): number {
  base = Math.round(base); // 倍率をかけた損失も整数で数える（2026-11-21）
  const prev = Math.round(contact.series.maxLoss);
  const add = Math.max(0, base - prev);
  contact.series.maxLoss = Math.max(prev, base);
  const detail = prev > 0
    ? `同じ相手の系列：基準${base}、既に${prev}を精算済みのため差額${add}`
    : undefined;
  if (add > 0) {
    applyLoss(state, add, 'event', note, { eventId, npcId: contact.npcId, detail });
  } else {
    state.ledger.push({ day: state.day, delta: 0, category: 'event', note: `${note}（同じ系列で精算済み）`, eventId, npcId: contact.npcId, detail });
  }
  return add;
}

/** 関係の深さによる加算：3回以上会っていた＋5、交際30日以上＋10。大きい方のみ、系列で1回 */
export function applyDepthBonus(state: GameState, contact: Contact): number {
  if (contact.series.depthBonusApplied) return 0;
  const relDays = contact.relationship ? state.day - contact.relationship.startDay : 0;
  let bonus = 0;
  let why = '';
  if (relDays >= 30) {
    bonus = SPEC_DEPTH_RELATIONSHIP30;
    why = `交際${relDays}日の関係の終了`;
  } else if (contact.meetings >= 3) {
    bonus = SPEC_DEPTH_MEETINGS3;
    why = `${contact.meetings}回会っていた関係の終了`;
  }
  if (bonus > 0) {
    contact.series.depthBonusApplied = true;
    applyLoss(state, bonus, 'depth', `関係の深さによる追加損失（${why}）`, { npcId: contact.npcId });
  }
  return bonus;
}

type RecoveryKey = 'firstConversation' | 'firstMutualDate' | 'firstRelationship' | 'milestone30' | 'milestone60';

export function recoverOnce(state: GameState, key: RecoveryKey, amount: number, note: string): number {
  if (state.recovery[key]) return 0;
  state.recovery[key] = true;
  return recover(state, amount, note);
}

/** ライフは回復しない（2026-11-03 指示）。呼び出し元は残すが、何も起きない */
export function recover(state: GameState, amount: number, note: string): number {
  void state;
  void amount;
  void note;
  return 0;
}

export function spend(
  state: GameState,
  yen: number,
  category: MoneyCategory,
  note: string,
  opts: { npcId?: string; special?: boolean; playerChosenHigh?: boolean } = {},
): void {
  if (yen <= 0) return;
  const special = !!opts.special;
  state.money.push({ day: state.day, yen, category, note, special, npcId: opts.npcId, playerChosenHigh: opts.playerChosenHigh });
  if (!special) {
    const before = state.monthSpend;
    state.monthSpend += yen;
    budgetCrossing(state, before, state.monthSpend);
  }
  if (opts.npcId && state.contacts[opts.npcId]) state.contacts[opts.npcId].spentYen += yen;
}

/** 予算の段階（1倍・1.5倍・2倍）を超えた瞬間に、その段階までの合計との差分だけライフが減る */
function budgetCrossing(state: GameState, before: number, after: number): void {
  const budget = monthBudget(state);
  if (budget <= 0) return;
  const tiers = state.gender === 'M' ? SPEC_MALE_BUDGET_TIERS : SPEC_FEMALE_BUDGET_TIERS;
  const lossAt = (spent: number) => tiers.find((t) => spent / budget > t.over)?.loss ?? 0;
  const add = lossAt(after) - lossAt(before);
  if (add <= 0) return;
  const ratio = after / budget;
  applyLoss(state, add, 'budget', `今月の支出が予算の${ratio.toFixed(2)}倍を超えた（${yenLabel(after)}／予算${yenLabel(budget)}）`);
  addFeed(state, `今月の支出が予算（${yenLabel(budget)}）の${ratio >= 2 ? '2倍' : ratio >= 1.5 ? '1.5倍' : ''}を超えた。お金の不安でライフが減った。`, 'bad');
}

/**
 * 男性の有料会員（30日4,000円）。いいねは無料だが、アプリ内でメッセージを送るには加入が必要。
 * 自動更新はせず、期限が切れた後にメッセージを送ろうとした時に改めて加入する（お金がかかることを毎回意識させる）。
 * LINEや外部サイトへ移った後のやり取りには不要。
 */
export function isMember(state: GameState): boolean {
  if (state.gender !== 'M') return true;
  return state.player.memberUntil !== undefined && state.day < state.player.memberUntil;
}

export function subscribe(state: GameState): boolean {
  if (state.gender !== 'M' || isMember(state)) return false;
  spend(state, memberFee(state), 'fee', '有料会員（30日・アプリでのメッセージに必要）');
  state.player.memberUntil = state.day + 30;
  addFeed(state, `有料会員になった（4,000円・${state.day + 29}日目まで）。`, 'neutral');
  return true;
}


/** E02：内容のある初回メッセージ後7日間会話にならなかった相手。週末にまとめて精算する */
export function noteE02(state: GameState, contact: Contact): void {
  state.week.e02.push({ npcId: contact.npcId, day: state.day });
}

/** 週末の精算：E20（比較疲れ）と、浅い無反応（E01・E02・週次−8/−5、合計12上限） */
export function weeklySettlement(state: GameState): void {
  const w = state.week;
  const male = state.gender === 'M';

  // 週末の時点でまだ続いているやり取りだけを数える（人数を絞れば止まる）
  const active = w.activeConversationIds.filter((id) => {
    const c = state.contacts[id];
    return c && c.stage !== 'ended' && c.stage !== 'relationship';
  }).length;
  state.stats.maxActiveConversations = Math.max(state.stats.maxActiveConversations, active);
  if (active >= 10) {
    applyLoss(state, SPEC_E20_10PLUS, 'fatigue', `比較疲れ：今週やり取りした相手が${active}人`, { eventId: 'E20' });
    addFeed(state, `今週は${active}人と並行してやり取りし、返信だけで夜が終わった。`, 'bad');
  } else if (active >= 6) {
    applyLoss(state, SPEC_E20_6TO9, 'fatigue', `比較疲れ：今週やり取りした相手が${active}人`, { eventId: 'E20' });
    addFeed(state, `${active}人と並行してやり取り。誰に何を話したか混ざりはじめた。`, 'bad');
  }

  let weekly = 0;
  let weeklyNote = '';
  let weeklyEvent = '';
  if (!w.wasResting) {
    if (w.sendsConcluded >= SPEC_WEEKLY_NO_MATCH_MIN_SENDS && w.matchesFromConcluded === 0) {
      weekly = male ? SPEC_MALE_WEEKLY_NO_MATCH : SPEC_FEMALE_WEEKLY_NO_MATCH;
      weeklyNote = `反応待ちの終わったいいね${w.sendsConcluded}件が、すべて不成立`;
      weeklyEvent = 'E01';
    } else if (male && w.matchesThisWeek > 0 && w.firstMessagesSent > 0 && w.twoWayStarted === 0) {
      weekly = SPEC_MALE_WEEKLY_NO_CONVERSATION;
      weeklyNote = `マッチ${w.matchesThisWeek}件、送った初回メッセージから会話が始まらなかった`;
      weeklyEvent = 'E02';
    }
  }
  const e02Sum = w.e02.length * SPEC_E02_LOSS;
  const shallow = Math.min(SPEC_SHALLOW_WEEKLY_CAP, Math.max(weekly, e02Sum));
  if (shallow > 0) {
    if (weekly >= e02Sum) {
      const detail = e02Sum > 0 ? `個別の未返信${w.e02.length}件（−${e02Sum}）より週次判定が大きいため、大きい方を採用` : undefined;
      applyLoss(state, Math.min(SPEC_SHALLOW_WEEKLY_CAP, weekly), 'weekly', `週次：${weeklyNote}`, { eventId: weeklyEvent, detail });
    } else {
      const capped = e02Sum > SPEC_SHALLOW_WEEKLY_CAP;
      for (const e of w.e02) {
        const c = state.contacts[e.npcId];
        if (c) c.series.maxLoss = Math.max(c.series.maxLoss, SPEC_E02_LOSS);
      }
      applyLoss(state, shallow, 'weekly', `マッチ後に会話にならなかった相手${w.e02.length}人`, {
        eventId: 'E02',
        detail: [
          weekly > 0 ? `週次判定（−${weekly}）より個別の合計が大きいため個別を採用` : '',
          capped ? `浅い無反応は週−${SPEC_SHALLOW_WEEKLY_CAP}が上限` : '',
        ].filter(Boolean).join('／') || undefined,
      });
    }
  }

  // 停滞：マッチも返信も対面もない1週間（いいねを控えていても減る）。
  // 上の浅い無反応（E01・E02）と合わせて停滞の値に届くまでを上乗せする（出来事の記録はそのまま残す）
  if (!w.wasResting && !isInRelationship(state) && w.matchesThisWeek === 0 && (w.repliesReceived ?? 0) === 0 && (w.meetings ?? 0) === 0) {
    const season = state.day <= (state.player.effects?.seasonUntil ?? -1) ? 3 : 0; // 年末の焦り
    const extra = Math.min(SPEC_SHALLOW_WEEKLY_CAP, TUNE_STAGNATION[state.gender] + season) - shallow;
    if (extra > 0) applyLoss(state, extra, 'weekly', '週次：この1週間、マッチも返信も会う予定もなかった（停滞）');
  }

  state.week = freshWeek(w.weekIndex + 1);
}

/** 月末の精算（30日ごと） */
export function monthlySettlement(state: GameState): void {
  const exploring = !isInRelationship(state);
  const month = monthIndex(state.day); // 例：day30 → 1（1か月経過）
  const remaining = state.player.deadlineMonths - state.day / DAYS_PER_MONTH;

  if (state.gender === 'M') {
    if (exploring) {
      applyLoss(state, SPEC_MALE_MONTHLY_SEARCH_FATIGUE, 'monthly', '月末：探索の継続疲れ');
      if (remaining < 0) {
        applyLoss(state, SPEC_MALE_DEADLINE_OVER_LOSS, 'monthly', '月末：本人が望んだ交際開始の期限を過ぎた');
      }
    } else {
      applyLoss(state, SPEC_RELATIONSHIP_MONTHLY_FATIGUE, 'monthly', '月末：交際維持の疲れ');
    }
  } else {
    if (exploring) {
      const months = Math.floor(state.player.appHistoryDays / DAYS_PER_MONTH);
      const a = specFemaleAppHistoryLoss(months);
      applyLoss(state, a, 'monthly', `月末：アプリ歴${Math.floor(months / 12)}年${months % 12}か月の消耗`);
      const d = specDeadlineLoss(remaining);
      if (d > 0) {
        applyLoss(state, d, 'monthly', remaining < 0
          ? '月末：婚期への焦り（本人の交際開始希望期限を超過）'
          : `月末：婚期への焦り（希望期限まで残り${Math.max(0, Math.ceil(remaining))}か月）`);
      }
    } else {
      applyLoss(state, SPEC_RELATIONSHIP_MONTHLY_FATIGUE, 'monthly', '月末：交際維持の疲れ');
    }
  }

  // 予算超過は支出の時点で減らす（budgetCrossing）。ここでは記録だけ
  const budget = monthBudget(state);
  state.stats.monthlySpend.push({ month, spend: state.monthSpend, budget });
  state.monthSpend = 0;

  // 次の30日の受信いいね期待件数を、表の幅の中で決め直す
  rollMonthLambda(state);
}

export function rollMonthLambda(state: GameState): void {
  const ch = character(state);
  const rates = state.player.photoVisible && !ch.photoInitiallyVisible && ch.ratesPhotoPublic ? ch.ratesPhotoPublic : ch.rates;
  const [lo, hi] = rates.receivedPer30;
  const k = TUNE_RECEIVED_SCALE[state.gender];
  state.received.monthLambda = withRng(state, (rng) => rng.range(lo, hi)) * k;
}

export function yenLabel(yen: number): string {
  if (yen >= 10_000) {
    const man = yen / 10_000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}万円`;
  }
  return `${yen.toLocaleString('ja-JP')}円`;
}
