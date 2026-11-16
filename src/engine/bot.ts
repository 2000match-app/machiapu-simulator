// 自動プレイ（バランス集計・到達確認用）。通常プレイの難易度評価と、再現ケースでの到達確認は別に扱う。
import { applyAction, newGame } from './actions';
import { canInvite, canPublishPhoto, needsMembership, replyOptions } from './chat';
import { talkMenu } from './conversation';
import { canRest } from './advance';
import { character, currentRates, isInRelationship } from './state';
import { openPreference } from './matching';
import { awaitingNow, canOpenApp, clockOf, lockMode, visiblePending } from './clock';
import type { GameState, PendingEvent } from './types';

export type Strategy = 'narrow' | 'wide' | 'focus' | 'rest';

export interface BotOptions {
  strategy: Strategy;
  /** 危険な誘いにも乗る（被害ルートの再現用） */
  naive?: boolean;
  /** 顔写真なし開始の人物が14日経過後に公開する */
  publishPhoto?: boolean;
  maxWeeks?: number;
  /** プライベートの出来事を起こさない（調整の比較用） */
  noPrivateEvents?: boolean;
}

export function pickPending(state: GameState, ev: PendingEvent, o: BotOptions): string {
  const has = (id: string) => ev.choices.some((c) => c.id === id);
  const first = ev.choices[0].id;
  const ch = character(state);
  switch (ev.kind) {
    case 'date_noshow': return 'leave';
    case 'date_e06': return 'end';
    case 'date_talk':
      if (has('kids')) return 'kids';
      if (has('honest') && o.strategy !== 'narrow') return 'honest';
      if (has('remember')) return 'remember';
      return 'listen';
    case 'date_e07': return 'leave';
    case 'date_e11': return o.naive ? 'listen' : 'refuse';
    case 'date_bar': return o.naive ? 'go' : 'refuse';
    case 'date_role': return 'counter';
    case 'e25': return 'lawyer';
    case 'e11_seminar': return o.naive ? 'pay' : 'refuse';
    case 'date_pay':
      if (state.gender === 'M') return ch.monthlyBudgetYen >= 50_000 ? 'all' : 'more';
      return 'treated';
    case 'date_e10': return 'help';
    case 'night_invite': return o.naive ? 'go' : 'home';
    case 'dumped': return 'ok';
    case 'date_end': return has('propose') ? 'propose' : has('more_line') ? 'more_line' : has('ask_line') ? 'ask_line' : 'more';
    case 'meshi_request': return o.naive ? 'go' : 'alt';
    case 'rel_propose_them': return 'yes';
    case 'e15': return 'confirm';
    case 'married_reveal': return 'leave';
    case 'scam_pitch': return o.naive ? 'send' : 'close';
    case 'rel_others': return 'close';
    case 'rel_phase': return has('pace') ? 'pace' : has('agree') ? 'agree' : has('share') ? 'share' : 'talk';
    case 'rel_week': return has('cheap') && ch.monthlyBudgetYen < 50_000 ? 'cheap' : 'meet';
    case 'rel_app': return 'apologize';
    case 'e18': return 'talk';
    case 'e19': return 'discuss';
    case 'e21': return 'reconfirm';
    case 'e22': return 'adjust';
    case 'f03_wedding': return 'pace';
    case 'photo_suggest': return o.publishPhoto ? 'publish' : 'keep';
    case 'value_review': return '6';
    default: return first;
  }
}

function pickReply(state: GameState, npcId: string, o: BotOptions): string {
  const c = state.contacts[npcId];
  const opts = replyOptions(state, c).map((x) => x.id);
  const has = (id: string) => opts.includes(id);
  const ch = character(state);
  if (c.topic === 'sakura_move') return o.naive ? 'move' : 'decline';
  if (c.topic === 'site') return Number(c.flags.sakuraPaid ?? 0) >= 3000 ? 'site_quit' : 'site_meet';
  if (c.topic === 'business_pitch_hint') return o.naive ? 'go' : 'decline';
  if (c.topic === 'business_line') return o.naive ? 'ok' : 'app';
  if (c.topic === 'line_them') return 'ok';
  if (c.topic === 'line_no') return 'fine';
  if (c.topic === 'photo_ask') return has('publish') && o.publishPhoto ? 'publish' : 'explain';
  if (c.topic === 'invite_them') return ch.monthlyBudgetYen < 20_000 ? 'cheaper' : 'accept';
  if (c.topic === 'body_hint') return o.naive ? 'match' : 'pace';
  if (c.topic === 'profit_hint') return o.naive ? 'impress' : 'budget';
  if (c.topic === 'married_hint') return 'ask';
  if (c.topic === 'scam_love') return o.naive ? 'warm' : 'calm';
  if (c.topic === 'job') return 'honest';
  if (c.topic === 'kids' || c.topic === 'schedule') return 'share';
  if (has('propose')) return 'propose';
  // 会う前は6往復ほど話してから誘う（早く誘うと温度が低いまま断られて終わる。2026-11-14 誘える往復を3〜6に下げたのに合わせる）
  if (canInvite(c) && has('meet_wish') && (c.meetings > 0 || c.exchanges >= 6)) return 'meet_wish';
  // 会う前の会話（2026-11-11）：聞かれたら詳しく答えて聞き返す。それ以外はプロフィールを見て質問する
  // 丁寧な返信は1日2回まで気疲れなし（2026-11-13）。使い切ったら、適当に答える・相槌で流す
  const polite = true; // 丁寧な返信のコストはなくなった（2026-11-14）
  if (has('ans_d')) {
    const back = !talkMenu(state, c, state.npcs[npcId]).askedBack;
    return polite ? (back ? 'ans_d+back' : 'ans_d') : (back ? 'ans_c+back' : 'ans_c');
  }
  if (has('profile_q') && !polite && has('aizuchi')) return 'aizuchi';
  if (has('profile_q')) {
    const q = talkMenu(state, c, state.npcs[npcId]).questions[0];
    if (q) return `q:${q.key}`;
  }
  if (has('zatsudan')) return 'zatsudan'; // 雑談はライフを使わない（2026-11-06）
  if (has('empathize')) return 'empathize';
  return opts[0];
}

/** 1週間分の行動を行い、週を進める */
export function botWeek(state: GameState, o: BotOptions): void {
  resolveVisible(state, o);
  if (state.status !== 'playing') return;
  const ch = character(state);
  const inRel = isInRelationship(state);

  if (o.publishPhoto && canPublishPhoto(state)) applyAction(state, { type: 'publishPhoto' });

  if (o.strategy === 'rest' && !inRel && state.life < 60 && state.recovery.restsUsed < 3 && canRest(state).ok) {
    applyAction(state, { type: 'rest' });
    return;
  }

  let weekWant = 0;
  if (!inRel) {
    if (o.strategy === 'wide' && state.day === 0) {
      const open = openPreference(state.player.age);
      applyAction(state, { type: 'setPrefs', prefs: { ...open, ageMin: state.player.age - 6, ageMax: state.player.age + 6 } });
    }
    // narrow は本人の見た目の好み（容姿◯以上）で送る相手を選ぶ。他の方針は見た目で選ばない
    const looksOk = (id: string) => {
      const n = state.npcs[id];
      return o.strategy !== 'narrow' || ch.lookPreference <= 1 || (n.profilePhotoVisible && n.looks >= ch.lookPreference);
    };
    const maxActive = o.strategy === 'focus' ? 2 : o.strategy === 'wide' ? 6 : 4;
    const active = Object.values(state.contacts).filter((c) => ['matched', 'talking', 'scheduled', 'dating'].includes(c.stage));
    // 受信いいね
    if (state.received.unseen > 0 && active.length < maxActive) {
      applyAction(state, { type: 'loadReceived', count: 10, onlyMatching: o.strategy === 'narrow' });
      const need = maxActive - active.length;
      for (const id of state.received.queue.filter(looksOk).slice(0, need)) applyAction(state, { type: 'acceptReceived', npcId: id });
      applyAction(state, { type: 'skipReceived', npcIds: [...state.received.queue] });
      if (state.received.unseen > 30) applyAction(state, { type: 'skipAllReceived' });
    }
    // 送信：成立率から逆算して、やり取りの人数が上限を超えない程度に送る（1週間の目安）
    const likeBudget = o.strategy === 'focus' ? 8 : o.strategy === 'rest' ? 12 : 25;
    const rate = Math.max(0.02, currentRates(state).sendSuccess);
    const waiting = Object.values(state.contacts).filter((c) => c.stage === 'like_sent').length;
    const nowActive = Object.values(state.contacts).filter((c) => ['matched', 'talking', 'scheduled', 'dating'].includes(c.stage)).length;
    const slots = maxActive - nowActive - waiting * rate;
    weekWant = Math.min(likeBudget, Math.ceil(Math.max(0, slots) / rate));
  }
  // いいねは1日5回まで：1日ずつ送り・返事をして進める。場面が出たらそこで止め、次の呼び出しで続ける
  let sentThisWeek = 0;
  for (let d = 0; d < 7 && state.status === 'playing'; d++) {
    resolveVisible(state, o);
    if (!isInRelationship(state) && sentThisWeek < weekWant) {
      for (let i = 0; i < 3 && sentThisWeek < weekWant && state.likesLeft > 0; i++) {
        applyAction(state, { type: 'search' });
        if (state.search.results.length === 0) break;
        for (const id of state.search.results.filter((x) => !state.contacts[x] && looksOkFor(state, o, x)).slice(0, Math.min(weekWant - sentThisWeek, state.likesLeft))) {
          applyAction(state, { type: 'like', npcId: id });
          sentThisWeek++;
        }
      }
    }
    for (const c of Object.values(state.contacts)) {
      if (c.stage === 'matched' && c.firstMessageSentDay === undefined && !c.awaitingMe) {
        if (needsMembership(state, c)) applyAction(state, { type: 'subscribe' });
        applyAction(state, { type: 'firstMessage', npcId: c.npcId, optionId: 'good' });
      }
    }
    replyAll(state, o);
    void ch;
    runUntilNextMorning(state, o);
  }
}

/** 見えている場面を選ぶ（アプリを開いて） */
function resolveVisible(state: GameState, o: BotOptions): void {
  for (let guard = 0; guard < 50 && state.status === 'playing'; guard++) {
    const ev = visiblePending(state)[0];
    if (!ev) break;
    if (state.screen === 'lock') applyAction(state, { type: 'openApp' });
    applyAction(state, { type: 'resolve', uid: ev.uid, choiceId: pickPending(state, ev, o) });
  }
}

/** 最初のメッセージと、届いている返事に返す */
function replyAll(state: GameState, o: BotOptions): void {
  for (const c of Object.values(state.contacts)) {
    if (state.screen === 'lock' || state.status !== 'playing') return; // 時間が来てアプリが閉じた
    if (c.stage === 'matched' && c.firstMessageSentDay === undefined && !c.awaitingMe) {
      if (needsMembership(state, c)) applyAction(state, { type: 'subscribe' });
      applyAction(state, { type: 'firstMessage', npcId: c.npcId, optionId: 'good' });
    } else if (awaitingNow(state, c) && c.stage !== 'ended') {
      if (needsMembership(state, c)) applyAction(state, { type: 'subscribe' });
      applyAction(state, { type: 'reply', npcId: c.npcId, optionId: pickReply(state, c.npcId, o) });
    }
  }
}

/** 自動プレイがアプリを開く時刻（朝・昼休み・夜・寝る前。開けない時間なら開かない）。2026-11-14：本番と同じ時刻の進行で検証する */
export const BOT_SESSIONS = [7 * 60 + 30, 12 * 60 + 30, 20 * 60, 23 * 60];

/** アプリを閉じて、ロック画面と同じ進み方で次の日の朝の時間まで進める。途中の決まった時刻にアプリを開いて返事をする */
function runUntilNextMorning(state: GameState, o: BotOptions): void {
  const startDay = state.day;
  let done = -1; // その日に済ませたセッションの時刻
  let doneDay = state.day;
  resolveVisible(state, o);
  applyAction(state, { type: 'closeApp' });
  for (let guard = 0; guard < 400 && state.status === 'playing'; guard++) {
    const mode = lockMode(state);
    if (mode === 'pending') { resolveVisible(state, o); applyAction(state, { type: 'closeApp' }); continue; }
    if (mode === 'block') { applyAction(state, { type: 'skipBlock' }); continue; }
    if (mode !== 'free') break;
    if (state.day !== doneDay) { doneDay = state.day; done = -1; }
    const now = clockOf(state);
    if (state.day > startDay && now >= BOT_SESSIONS[0]) {
      if (canOpenApp(state)) applyAction(state, { type: 'openApp' });
      return;
    }
    const due = BOT_SESSIONS.filter((m) => m <= now && m > done).pop();
    if (due !== undefined) {
      done = due;
      if (canOpenApp(state)) {
        applyAction(state, { type: 'openApp' });
        resolveVisible(state, o);
        replyAll(state, o);
        resolveVisible(state, o);
        if (state.screen !== 'lock') applyAction(state, { type: 'closeApp' });
      }
      continue;
    }
    const nextSession = BOT_SESSIONS.find((m) => m > now) ?? 1440;
    applyAction(state, { type: 'advanceFree', minutes: Math.max(1, nextSession - now) });
  }
}

/** narrow は本人の見た目の好み（容姿◯以上）で送る相手を選ぶ。他の方針は見た目で選ばない */
function looksOkFor(state: GameState, o: BotOptions, id: string): boolean {
  const ch = character(state);
  const n = state.npcs[id];
  return o.strategy !== 'narrow' || ch.lookPreference <= 1 || (n.profilePhotoVisible && n.looks >= ch.lookPreference);
}

export function playBot(characterId: string, seed: string, o: BotOptions): GameState {
  const state = newGame(characterId, seed);
  if (o.noPrivateEvents) state.flags.noPrivateEvents = true;
  const maxWeeks = o.maxWeeks ?? 160;
  // 本番と同じ時刻の進行で、1週間ずつ行動する（2026-11-14）
  for (let w = 0; w < maxWeeks && state.status === 'playing' && state.day < maxWeeks * 7; w++) {
    botWeek(state, o);
  }
  return state;
}
