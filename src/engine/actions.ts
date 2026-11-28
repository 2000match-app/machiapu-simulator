// プレイヤー操作の入口。同じシード・同じ操作列なら同じ結果になる（乱数状態は state.rng）。
import { loadVisitors, markFootprintsSeen } from './footprints';
import { START_CLOCK, advanceFree, fastForward, focusUnlocked, afterDateScene, canOpenApp, isLifeNotice, nextFreeMinute, pushLifeNotice, skipBlock, skipChain, useAppTime, visibleNotices, visiblePending } from './clock';
import { advanceDays, advanceWeek, canRest, checkEnd, closeDay, continueAdvance, continueRest, isResting, startRest } from './advance';
import { deliverOpenerNow, followUp, isPoliteReply, playerReply, publishPhoto, resolvePhotoSuggest, sendFirstMessage } from './chat';
import { endContact } from './contact';
import {
  resolveDateE06, resolveDateE07, resolveDateE10, resolveDateE11, resolveDateEnd, resolveDateNoshow, resolveDatePay,
  resolveDateTalk, resolveE11Seminar, resolveDateBar, resolveDateBail, resolveDateRole, resolveE25, resolveE15, resolveMarriedReveal, resolveMeshiRequest, resolveNightInvite,
  resolveRelProposeThem, resolveDatePick, resolveNoMatch, resolveWorkCall, resolveMakeup, resolveVenue, resolveDateTouch } from './dates';
import { rollMonthLambda, spend, subscribe } from './life';
import { resolvePrivateEvent } from './privateEvents';
import { acceptReceived, dropFromSearch, loadReceived, loadSearch, runSearch, sendLike, skipReceived, skipSearch, updateStrictness } from './matching';
import { pushRelOthers, endRelationship, resolveRelationshipEvent, resolveScamPitch } from './relationship';
import { SPEC_DEADLINE_EXTENSION_MAX_MONTHS, TUNE_BOOST, TUNE_EXTRA_LIKES } from './data/rules';
import { addFeed, isInRelationship, newGame as createState } from './state';
import type { GameState, Preference } from './types';

export type Action =
  | { type: 'search' }
  | { type: 'setPrefs'; prefs: Preference }
  | { type: 'like'; npcId: string }
  | { type: 'likeAll' }
  | { type: 'skipSearch'; npcId: string }
  /** いいね・スキップを使い切ったら次の日へ進むか（2026-11-11 オンオフ） */
  | { type: 'setAutoNextDay'; on: boolean }
  | { type: 'loadReceived'; count: number; onlyMatching: boolean }
  | { type: 'acceptReceived'; npcId: string }
  | { type: 'skipReceived'; npcIds: string[] }
  | { type: 'skipAllReceived' }
  | { type: 'firstMessage'; npcId: string; optionId: string }
  | { type: 'reply'; npcId: string; optionId: string }
  | { type: 'followUp'; npcId: string }
  | { type: 'endContact'; npcId: string }
  /** トーク一覧から非表示にする（自分からやり取りを終える。ライフは減らない） */
  | { type: 'hideContact'; npcId: string }
  /** 開始時のプロローグを閉じる */
  | { type: 'closePrologue' }
  /** 開始時に検索条件を選ぶ（2026-11-09。初期値はその人物の初期条件） */
  | { type: 'setStartPrefs'; prefs: Preference }
  | { type: 'publishPhoto' }
  | { type: 'rest' }
  | { type: 'buyLikes' }
  | { type: 'boost' }
  | { type: 'extendDeadline'; months: number }
  | { type: 'advance' }
  | { type: 'advanceDay' }
  | { type: 'advanceWeek' }
  | { type: 'continue' }
  | { type: 'searchMore'; count: number }
  | { type: 'subscribe' }
  | { type: 'resolve'; uid: string; choiceId: string }
  /** アプリを閉じてロック画面へ／ロック画面からアプリへ（2026-11-13） */
  | { type: 'closeApp' }
  | { type: 'openApp' }
  /** ロック画面：自由時間に時刻を進める／睡眠・勤務・予定を終わりまで進める */
  | { type: 'advanceFree'; minutes: number }
  | { type: 'skipBlock' }
  | { type: 'skipChain' }
  /** ロック画面：次の大事な通知まで早送り（2026-11-14） */
  | { type: 'fastForward' }
  /** トークに集中するモード（2026-11-15） */
  | { type: 'setFocus'; on: boolean }
  /** 通知を既読にする（ids がなければ見えているものすべて） */
  | { type: 'readNotices'; ids?: string[] }
  | { type: 'setNotify'; key: 'likes' | 'talk'; on: boolean }
  /** プロフィールを開いた（読む時間としてゲーム内2分。2026-11-14） */
  | { type: 'viewProfile'; npcId: string }
  | { type: 'loadFootprints'; count: number }
  | { type: 'seeFootprints' };

export function newGame(characterId: string, seed: string): GameState {
  const s = createState(characterId, seed);
  // 始まりは月曜の夜。残業などで開けない時間なら、その人が空く時刻から（2026-11-13）
  s.clock = nextFreeMinute(s, START_CLOCK);
  rollMonthLambda(s);
  updateStrictness(s);
  const hist = Math.floor(s.player.appHistoryDays / 30);
  addFeed(s, hist > 0
    ? `アプリを開き直した（これまでのアプリ歴 ${hist >= 12 ? `${Math.floor(hist / 12)}年` : ''}${hist % 12 ? `${hist % 12}か月` : ''}）。今日から記録を始める。`
    : 'アプリに登録した。今日が1日目。', 'neutral');
  return s;
}

function noteAppUse(state: GameState): void {
  if (isInRelationship(state)) {
    state.flags.appUseWeek = Number(state.flags.appUseWeek ?? 0) + 1;
    state.flags.appUseSinceRelationship = Number(state.flags.appUseSinceRelationship ?? 0) + 1;
  }
}

/** 状態を直接書き換える（シミュレーション用）。UIは dispatch を使う */
export function applyAction(state: GameState, action: Action): void {
  if (state.status !== 'playing') return;
  // 選択が必要な場面が「見えている」間だけ、ほかの操作を止める（2026-11-14 修正：届く時刻前の場面まで数えていたため、
  // 0時に朝の出来事が予約されると睡眠のスキップやアプリ内の操作が効かず、睡眠の表示がくり返していた）
  // ロック解除・通知の操作は止めない（2026-11-14 修正：ロック画面で「候補日が届いた」などが出ると解除できず、動かなくなっていた）
  const busy = visiblePending(state).length > 0;
  const allowedWhileBusy = ['resolve', 'openApp', 'readNotices', 'setNotify'];
  if (busy && !allowedWhileBusy.includes(action.type)) return;
  const timeActions = ['resolve', 'advance', 'advanceDay', 'advanceWeek', 'continue'];
  const likedCount = action.type === 'likeAll' ? state.search.results.filter((x) => !state.contacts[x]).length : 0;
  if (isResting(state) && !timeActions.includes(action.type)) return;
  switch (action.type) {
    case 'search':
      runSearch(state);
      break;
    case 'searchMore':
      loadSearch(state, action.count, state.search.results.length === 0);
      break;
    case 'setPrefs':
      state.player.prefs = { ...action.prefs, ageMin: Math.max(18, action.prefs.ageMin), ageMax: Math.max(action.prefs.ageMin, action.prefs.ageMax) };
      updateStrictness(state);
      state.search.results = [];
      break;
    case 'like':
      // いいねした相手は「さがす」から外す（いいね欄の「送ったいいね」で見られる）
      if (sendLike(state, action.npcId)) noteAppUse(state);
      dropFromSearch(state);
      break;
    case 'likeAll':
      // いいねの回数制限はなし（2026-11-13）
      for (const id of state.search.results.filter((x) => !state.contacts[x])) {
        if (sendLike(state, id)) noteAppUse(state);
      }
      dropFromSearch(state);
      break;
    case 'setAutoNextDay':
      state.flags.manualDay = !action.on;
      break;
    case 'closeApp':
      // 確認が必要な出来事が見えている間は閉じない
      if (visiblePending(state).length === 0) { state.screen = 'lock'; delete state.flags.ffResult; }
      break;
    case 'openApp':
      autoLifeEvents(state);
      if (canOpenApp(state)) {
        state.screen = 'app';
        delete state.flags.lockReason;
        // ロックを解除したら、いまロック画面に出ている通知は消える（2026-11-14）
        for (const n of visibleNotices(state)) { n.read = true; n.cleared = true; }
      }
      break;
    case 'advanceFree':
      advanceFree(state, action.minutes);
      autoLifeEvents(state);
      break;
    case 'skipBlock':
      skipBlock(state);
      autoLifeEvents(state);
      break;
    case 'skipChain':
      skipChain(state);
      autoLifeEvents(state);
      break;
    case 'fastForward':
      state.flags.ffResult = fastForward(state);
      autoLifeEvents(state);
      break;
    case 'setFocus':
      state.focusMode = action.on && focusUnlocked(state); // 3人とマッチするまでは使えない
      break;
    case 'setNotify':
      state.notify = { ...state.notify, [action.key]: action.on };
      break;
    case 'readNotices':
      for (const n of visibleNotices(state)) if (!action.ids || action.ids.includes(n.id)) n.read = true;
      break;
    case 'skipSearch':
      skipSearch(state, action.npcId);
      break;
    case 'loadReceived':
      loadReceived(state, action.count, action.onlyMatching);
      break;
    case 'acceptReceived':
      acceptReceived(state, action.npcId);
      if (state.contacts[action.npcId]) deliverOpenerNow(state, state.contacts[action.npcId]);
      noteAppUse(state);
      break;
    case 'skipReceived':
      skipReceived(state, action.npcIds);
      break;
    case 'skipAllReceived':
      skipReceived(state, 'all-unseen');
      break;
    case 'firstMessage':
      sendFirstMessage(state, action.npcId, action.optionId);
      break;
    case 'reply':
      playerReply(state, action.npcId, action.optionId);
      break;
    case 'followUp': {
      followUp(state, action.npcId);
      const c = state.contacts[action.npcId];
      if (c) {
        const n = c.followUps.filter((d) => state.day - d < 7).length;
        state.flags.maxFollowUps7 = Math.max(Number(state.flags.maxFollowUps7 ?? 0), n);
      }
      break;
    }
    case 'endContact': {
      const c = state.contacts[action.npcId];
      if (!c || c.stage === 'ended') break;
      if (c.stage === 'relationship') endRelationship(state, c, 'me', '自分から別れを伝えた');
      else endContact(state, c, { by: 'me', cause: '自分から終了', visible: `${state.npcs[c.npcId]?.name ?? '相手'}とのやり取りを自分から終えた。` });
      checkEnd(state);
      break;
    }
    case 'setStartPrefs':
      state.flags.startPrefsSet = true;
      state.player.prefs = { ...action.prefs, ageMin: Math.max(18, action.prefs.ageMin), ageMax: Math.max(action.prefs.ageMin, action.prefs.ageMax) };
      updateStrictness(state);
      state.search.results = [];
      break;
    case 'closePrologue':
      state.flags.prologueSeen = true;
      break;
    case 'hideContact': {
      const c = state.contacts[action.npcId];
      if (!c || c.stage === 'ended' || c.stage === 'relationship') break;
      endContact(state, c, { by: 'me', cause: '非表示にした', visible: `${state.npcs[c.npcId]?.name ?? '相手'}とのトークを非表示にした。` });
      checkEnd(state);
      break;
    }
    case 'subscribe':
      subscribe(state);
      break;
    case 'publishPhoto':
      publishPhoto(state);
      break;
    case 'rest':
      if (canRest(state).ok) startRest(state);
      break;
    case 'buyLikes':
      spend(state, TUNE_EXTRA_LIKES.yen, 'boost', `追加いいね${TUNE_EXTRA_LIKES.count}件（任意の課金）`);
      state.likesLeft += TUNE_EXTRA_LIKES.count;
      break;
    case 'boost':
      spend(state, TUNE_BOOST.yen, 'boost', `プロフィールの露出アップ${TUNE_BOOST.days}日間（任意の課金）`);
      state.boostUntil = state.day + TUNE_BOOST.days;
      break;
    case 'extendDeadline':
      if (!state.player.deadlineExtended) {
        const m = Math.max(1, Math.min(SPEC_DEADLINE_EXTENSION_MAX_MONTHS, Math.round(action.months)));
        state.player.deadlineMonths += m;
        state.player.deadlineExtended = true;
        addFeed(state, `交際開始の希望期限を${m}か月見直した。過去のアプリ歴は戻らない。`, 'neutral');
      }
      break;
    case 'advance':
      if (isResting(state)) continueRest(state);
      else advanceWeek(state);
      break;
    case 'advanceDay':
      advanceDays(state, 1);
      break;
    case 'advanceWeek':
      advanceDays(state, 7);
      break;
    case 'continue':
      continueAdvance(state);
      break;
    case 'resolve':
      resolve(state, action.uid, action.choiceId);
      break;
    case 'viewProfile':
      break;
    case 'loadFootprints':
      loadVisitors(state, action.count);
      break;
    case 'seeFootprints':
      markFootprintsSeen(state);
      break;
  }
  // アプリの操作でゲーム内の時間を使う（2026-11-14 指示）。読む・考える間は止まっている
  const cost = appMinutes(action, likedCount);
  if (cost > 0 && state.screen !== 'lock') useAppTime(state, cost);
}

/** 操作ごとのゲーム内時間（分）：プロフィールを見る2分、スキップ30秒。2026-11-15 指示：いいね（いいね返しも）30分、トークは1送信20分 */
export const APP_MINUTES = { profile: 2, like: 30, skip: 0.5, reply: 20, politeReply: 20 };
function appMinutes(action: Action, likedCount: number): number {
  switch (action.type) {
    case 'viewProfile': return APP_MINUTES.profile;
    case 'like': case 'acceptReceived': return APP_MINUTES.like;
    case 'likeAll': return APP_MINUTES.like * likedCount;
    case 'skipSearch': case 'skipReceived': return APP_MINUTES.skip;
    case 'firstMessage': case 'followUp': return APP_MINUTES.reply;
    case 'reply': return isPoliteReply(action.optionId) ? APP_MINUTES.politeReply : APP_MINUTES.reply;
    default: return 0;
  }
}

export function dispatch(state: GameState, action: Action): GameState {
  const next = structuredClone(state);
  applyAction(next, action);
  return next;
}

/**
 * 選ぶ必要がないプライベートの出来事（結婚式の招待状・体調不良など）は、届いた時刻にロック画面の通知として受け取り、
 * そのまま結果を反映する（ポップアップで止めない。2026-11-14）。合コン・退会を考える夜など選択のあるものは今までどおり
 */
function autoLifeEvents(state: GameState): void {
  if (state.clock === undefined) return;
  for (const p of visiblePending(state)) {
    if (!isLifeNotice(p)) continue;
    pushLifeNotice(state, p);
    resolve(state, p.uid, p.choices[0].id);
  }
}

function resolve(state: GameState, uid: string, choiceId: string): void {
  const ev = state.pending.find((p) => p.uid === uid);
  if (!ev) return;
  if (!ev.choices.some((c) => c.id === choiceId)) return;
  state.pending = state.pending.filter((p) => p.uid !== uid);
  const c = ev.npcId ? state.contacts[ev.npcId] : undefined;
  switch (ev.kind) {
    case 'date_noshow': if (c) resolveDateNoshow(state, c, choiceId, ev); break;
    case 'date_e06': if (c) resolveDateE06(state, c, choiceId); break;
    case 'date_talk': if (c) resolveDateTalk(state, c, choiceId); break;
    case 'date_e07': if (c) resolveDateE07(state, c, choiceId, ev); break;
    case 'date_e11': if (c) resolveDateE11(state, c, choiceId); break;
    case 'e11_seminar': if (c) resolveE11Seminar(state, c, choiceId); break;
    case 'date_bar': if (c) resolveDateBar(state, c, choiceId); break;
    case 'date_bail': if (c) resolveDateBail(state, c); break;
    case 'e25': if (c) resolveE25(state, c, choiceId); break;
    case 'date_role': if (c) resolveDateRole(state, c, choiceId); break;
    case 'date_pay': if (c) resolveDatePay(state, c, choiceId); break;
    case 'date_pick': if (c) resolveDatePick(state, c, choiceId); break;
    case 'work_call': if (c) resolveWorkCall(state, c, choiceId); break;
    case 'date_nomatch': if (c) resolveNoMatch(state, c, ev); break; // 候補日をカレンダーで確かめて返す（2026-11-14）
    case 'tired_night': break; // 寝落ちした日（次の日へ進めるのは画面側）
    case 'wfh_makeup': break;
    case 'date_makeup': if (c) resolveMakeup(state, c, ev); break;
    case 'date_venue': if (c) resolveVenue(state, c, ev); break; // 男性のデート場所選び（2026-11-15） // デート前のメイク（3段）
    case 'date_touch': if (c) resolveDateTouch(state, c, choiceId); break; // デート中に手を触ってくる // 在宅ワークの日の化粧（ライフはデート当日に引く）
    case 'rel_start': if (c) pushRelOthers(state, c); break; // 交際スタートを見せたあと、ほかの相手とのやり取りを聞く（2026-11-16）
    case 'date_e10': if (c) resolveDateE10(state, c, choiceId); break;
    case 'night_invite': if (c) resolveNightInvite(state, c, choiceId); break;
    case 'date_end': if (c) resolveDateEnd(state, c, choiceId); break;
    case 'meshi_request': if (c) resolveMeshiRequest(state, c, choiceId); break;
    case 'rel_propose_them': if (c) resolveRelProposeThem(state, c, choiceId); break;
    case 'e15': if (c) resolveE15(state, c, choiceId); break;
    case 'married_reveal': if (c) resolveMarriedReveal(state, c, choiceId); break;
    case 'scam_pitch': if (c) resolveScamPitch(state, c, choiceId); break;
    case 'dumped':
      break;
    case 'f03_wedding':
      state.flags.f03Rush = choiceId === 'rush';
      if (choiceId === 'rush') state.likesLeft += 10;
      addFeed(state, choiceId === 'rush' ? '焦りに押されるように、今週はいつもより多く「いいね」を押した。' : '自分のペースで続けると決めた。', 'neutral');
      break;
    case 'photo_suggest':
      resolvePhotoSuggest(state, choiceId);
      break;
    case 'value_review':
      if (choiceId !== 'keep') applyAction(state, { type: 'extendDeadline', months: Number(choiceId) });
      break;
    default:
      if (ev.kind.startsWith('pe_')) resolvePrivateEvent(state, ev.kind, choiceId);
      else resolveRelationshipEvent(state, ev, choiceId);
  }
  if (state.life <= 0) {
    state.pending = [];
  }
  // デートの場面が終わったら、デートの終わりの時刻まで進める（2026-11-13）
  if (ev.kind.startsWith('date_')) afterDateScene(state, ev.npcId);
  if (state.pending.length === 0 && state.flags.dayOpen) closeDay(state);
  else checkEnd(state);
}
