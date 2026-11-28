// トークの進行：初回メッセージ、話題ごとの選択肢、返信待ち・既読・フェードアウト、デートの誘い。
import { channelOf, endContact, fadeBeforeMeeting, pushMsg } from './contact';
import { npcAnswerFirst, playerAizuchiLine, playerMeetLine, talkChoice, talkMenu } from './conversation';
import { afterDateReply, answerProposal, maybeScamPitch, pushMeshiRequest, scheduleDate, sneakyMeshi } from './dates';
import { isMember, noteE02, spend } from './life';
import { firstConversationRecovery } from './matching';
import { markActive, npcSay, npcSayMany, replyChance, scheduleReply, sayLines, vars } from './messaging';
import { TUNE_TEMP, levelOf, personaOf, splitSentences, stepLevel, tierOf, type Level, type Quality } from './talkTemp';
import { acceptLines, busyLines, greetByLevel, npcChatByLevel, tooEarlyLines } from './talkLines';
import { playerHobbies } from './conversation';
import { FIRST_MESSAGES, GREET, GREET_CURT, LINE_TALK, fill } from './data/dialogue';
import { attentiveness, curtChance, firstReplyAppealMultiplier, playerPopularity } from './appeal';
import { unavailableReason } from './privateEvents';
import { TUNE_AFTER_CALL, SPEC_E02_WAIT_DAYS, SPEC_LOSS, SPEC_PHOTO_PUBLISH_MIN_DAY, TUNE_DATE_ACCEPT_BASE, TUNE_EXCHANGES_BEFORE_DATE, TUNE_FIRST_REPLY, TUNE_FUNNEL, TUNE_INTIMACY_SURE, TUNE_LINE, TUNE_MALE_EMPTY, TUNE_VENUES, isNormalPurpose, TUNE_RECEIVED_SCALE } from './data/rules';
import { PLAYER_FACE } from './data/faceReveal';
import { PLAYER_TALK } from './data/talkPacks';
import { Rng } from './rng';
import { spendMinutes } from './clock';
import { addFeed, character, pushPending, withRng } from './state';
import type { Choice, Contact, GameState, Npc, VenueTier } from './types';

export function firstMessageOptions(): Choice[] {
  return FIRST_MESSAGES.map((m) => ({ id: m.id, label: m.label }));
}

/** 男性がアプリ内でメッセージを送るには有料会員が必要（LINE・外部サイトでは不要） */
export function needsMembership(state: GameState, c: Contact): boolean {
  return state.gender === 'M' && channelOf(c) === 'app' && !isMember(state);
}

export function sendFirstMessage(state: GameState, npcId: string, optionId: string): void {
  const c = state.contacts[npcId];
  const npc = state.npcs[npcId];
  if (!c || c.stage !== 'matched' || c.firstMessageSentDay !== undefined) return;
  if (needsMembership(state, c) || unavailableReason(state)) return;
  const def = FIRST_MESSAGES.find((m) => m.id === optionId) ?? FIRST_MESSAGES[0];
  // 挨拶＋自己紹介：挨拶・自己紹介の文・締めを分けて送る（1回の吹き出しは3文までで、間の文が落ちるため）
  const intros = (PLAYER_TALK[state.characterId]?.intro ?? []).filter((t) => !t.includes('マッチング'));
  const intro = withRng(state, (r) => r.pick(intros.length > 0 ? intros : [`${character(state).job}をしています。`]));
  const [head, tail] = fill(def.text, vars(state, npc)).split('{intro}');
  pushMsg(c, state.day, 'me', head);
  if (tail !== undefined) {
    pushMsg(c, state.day, 'me', intro);
    if (tail) pushMsg(c, state.day, 'me', tail);
  }
  c.firstMessageSentDay = state.day;
  c.firstMessageQuality = def.id;
  state.week.firstMessagesSent += 1;
  const g = state.gender === 'M' ? TUNE_FIRST_REPLY.toMale : TUNE_FIRST_REPLY.toFemale;
  const base = c.fromReceived ? g.fromReceived : g.fromSentLike;
  const p = Math.min(0.95, base * TUNE_FIRST_REPLY.quality[def.id] * TUNE_FIRST_REPLY.purpose[npc.purpose]
    * (npc.popularity >= 0.9 ? TUNE_FIRST_REPLY.popularPenalty : 1) * firstReplyAppealMultiplier(state, c, npc));
  scheduleReply(state, c, 'greet', p);
  if (c.pendingReply) c.pendingReply.expireDay = state.day + SPEC_E02_WAIT_DAYS;
}

/** いいね返しでマッチした直後に、先に送ってくる相手のメッセージを届ける（actions の acceptReceived から） */
export function deliverOpenerNow(state: GameState, c: Contact): void {
  if (c.pendingReply?.kind !== 'opener') return;
  c.pendingReply = undefined;
  opener(state, c, state.npcs[c.npcId]);
}

/** 相手から先に届いたメッセージ */
function opener(state: GameState, c: Contact, npc: Npc): void {
  const text = withRng(state, (rng) => sayLines(state, npc, GREET[npc.purpose], rng));
  npcSay(state, c, 'greet', { text });
  c.flags.openerFromThem = true;
  earlyDrinkInvite(state, c, npc);
}

/**
 * 容姿4以上のキャラは、相手の1〜2通目でいきなり飲みに誘われることがある（2026-11-18 指示）。
 * 体目的・食事目的の相手ほど多い。誘いへの返事は「行きましょう／気軽な店を提案／今は会えない」
 */
export const TUNE_EARLY_DRINK = { minLooks: 4, chance: { body: 0.6, profit: 0.35, sincere: 0.12, ambiguous: 0.2 } as Record<string, number> };
function earlyDrinkInvite(state: GameState, c: Contact, npc: Npc): boolean {
  if (character(state).looks < TUNE_EARLY_DRINK.minLooks || !state.player.photoVisible) return false;
  if (c.meetings > 0 || c.nextDate || c.flags.earlyDrink !== undefined || c.stage === 'ended') return false;
  const p = TUNE_EARLY_DRINK.chance[npc.purpose] ?? 0;
  const yes = withRng(state, (r) => r.chance(p));
  c.flags.earlyDrink = yes;
  if (!yes) return false;
  c.flags.inviteTier = 'casual';
  // 自分から飲みに誘ってきた相手は、会う気がある（2026-11-21 指示：電話・会いたいと返して断られるのはおかしい）
  if (isNormalPurpose(npc.purpose) && typeof c.flags.reach === 'number' && c.flags.reach < 3) c.flags.reach = 3;
  npcSay(state, c, 'invite_them', { text: withRng(state, (r) => r.pick(state.gender === 'F'
    ? ['ていうか、よかったら今度飲みに行きません？笑', '写真めっちゃタイプです。今週どこかで軽く飲みに行きませんか？', 'お酒飲めますか？近いうちにサクッと飲みに行きましょうよ']
    : ['よかったら、今度飲みに行きませんか？', 'お酒好きですか？今度軽く飲みに行きましょう！', 'メッセージより会って話したいです笑 今度飲みに行きません？'])) });
  return true;
}

/** まだ会っていない相手が、自分から「飲みに行こう」と誘ってきたか（会う気のある相手） */
function eagerToMeet(c: Contact): boolean {
  return c.flags.earlyDrink === true && c.meetings === 0;
}

export function canInvite(c: Contact): boolean {
  return (c.stage === 'talking' || c.stage === 'dating') && c.exchanges >= TUNE_EXCHANGES_BEFORE_DATE && !c.nextDate;
}

export function canPublishPhoto(state: GameState): boolean {
  return !state.player.photoVisible && state.day >= SPEC_PHOTO_PUBLISH_MIN_DAY;
}

/** 返事を書く時の選択肢 */
/** 2026-11-16 より前のセーブ：当日キャンセルの連絡がふつうの会話の話題になっていたら、キャンセルへの返事に直す */
function legacyDayCancel(c: Contact): boolean {
  const last = c.dates[c.dates.length - 1];
  if (!last || last.outcome !== 'canceled' || !c.awaitingMe || c.topic !== 'chat_cool') return false;
  const them = [...c.messages].reverse().find((m) => m.from === 'them');
  const mine = [...c.messages].reverse().find((m) => m.from === 'me');
  return !!them && them.day === last.day && (!mine || mine.day <= last.day);
}

export function replyOptions(state: GameState, c: Contact): Choice[] {
  const t = legacyDayCancel(c) ? 'day_cancel' : c.topic ?? 'chat_normal';
  const opts: Choice[] = [];
  if (channelOf(c) === 'external') {
    // 外部の有料サイト：1通ごとにポイント代がかかる
    const fee = `${SITE_MESSAGE_YEN.toLocaleString()}円分のポイント`;
    return [
      { id: 'site_meet', label: '会おうと誘う', sub: fee },
      { id: 'site_photo', label: '写真を送ってほしいと頼む', sub: fee },
      { id: 'site_chat', label: '話を続ける', sub: fee },
      { id: 'site_quit', label: 'このサイトでのやり取りをやめる' },
    ];
  }
  /** ふつうの会話の選択肢（2026-11-03 指示）。雑談・電話はライフを使わない（2026-11-06） */
  const talk4 = () => {
    const met = c.meetings > 0;
    // 断られてから7日間は、同じ相手にもう一度「会いたい」とは言いにくい
    const cooling = state.day < Number(c.flags.meetWishDeclinedDay ?? -99) + 7;
    if (met) {
      opts.push({ id: 'aizuchi', label: '相槌だけ返す', sub: '話は広がらない' }, { id: 'zatsudan', label: '雑談をする' });
    } else {
      // 会う前（2026-11-11 指示）：相手が質問したら「詳しく答える・適当に答える・ブロック」、
      // それ以外は「相槌・プロフィールを見て質問する・電話してみたいと言う」。送る文面は sub に出す
      const m = talkMenu(state, c, state.npcs[c.npcId]);
      if (m.mode === 'question') {
        opts.push({ id: 'ans_d', label: '詳しく答える', sub: m.detailed }, { id: 'ans_c', label: '適当に答える', sub: m.casual }, { id: 'block', label: 'ブロックする', sub: 'この人とのやり取りを終える' });
      } else {
        opts.push({ id: 'aizuchi', label: '相槌を打つ', sub: m.aizuchi }, { id: 'profile_q', label: 'プロフィールを見て質問する' });
        // 電話は3往復以上やり取りしてから（2026-11-14 指示）
        if (c.exchanges >= TUNE_AFTER_CALL.minExchanges) opts.push({ id: 'callwish', label: '電話してみたいと言う' });
      }
    }
    if (met) opts.push({ id: 'call', label: '電話をする', sub: '1時間使う' });
    if (!c.nextDate && c.stage !== 'relationship' && !cooling) opts.push({ id: 'meet_wish', label: met ? 'また会いたいと伝える' : '会ってみたいと希望を伝える', sub: met ? undefined : '無視されて終わることもある' });
  };
  switch (t) {
    case 'greet':
      talk4();
      break;
    case 'job':
      opts.push({ id: 'honest', label: '今の仕事と収入を正直に話す' }, { id: 'vague', label: '「まあ色々です」とぼかす' });
      break;
    case 'kids':
      opts.push({ id: 'share', label: '育児の予定と会える日を先に伝える' }, { id: 'later', label: '会ってから話すと答える' });
      break;
    case 'schedule':
      opts.push({ id: 'share', label: '勤務の都合を正直に伝える' }, { id: 'force', label: '無理して合わせると言う' });
      break;
    case 'photo_ask':
      opts.push({ id: 'explain', label: '会ってからのほうが…と伝える' });
      // 顔写真を見たいと言われたら、日数に関係なく必ず顔を出す選択肢を出す（2026-11-18 指示）
      if (!state.player.photoVisible) opts.push({ id: 'publish', label: '顔を出す（プロフィールに顔写真を載せる）', sub: '公開すると元に戻せない' });
      break;
    case 'praise_blind':
      opts.push({ id: 'happy', label: '嬉しいと素直に返す' }, { id: 'temper', label: '会ってみないと分からないよと返す' });
      break;
    case 'body_hint':
      opts.push({ id: 'pace', label: '自分のペースで進めたいと伝える' }, { id: 'laugh', label: '笑って流す' }, { id: 'match', label: '乗り気で返す' });
      break;
    case 'profit_hint':
      opts.push({ id: 'budget', label: '自分の予算感を正直に伝える' }, { id: 'impress', label: '「連れて行くよ」と返す' }, { id: 'skip', label: '話題を変える' });
      break;
    case 'married_hint':
      opts.push({ id: 'ask', label: '土日に会えない理由を聞く' }, { id: 'accept', label: '平日で大丈夫と返す' });
      break;
    case 'business_line':
      opts.push({ id: 'ok', label: 'LINEを交換する' }, { id: 'app', label: 'もう少しアプリで話したいと返す' });
      break;
    case 'business_pitch_hint':
      opts.push({ id: 'decline', label: '二人で会うのでなければ遠慮すると断る' }, { id: 'go', label: '3人で会ってみる' });
      break;
    case 'scam_love':
      opts.push({ id: 'warm', label: '嬉しいと返す' }, { id: 'calm', label: '会ってから判断したいと返す' });
      break;
    case 'sakura_move':
      opts.push({ id: 'move', label: '教えられたサイトに登録して話す' }, { id: 'decline', label: 'このアプリで話したいと断る' });
      break;
    case 'day_cancel':
      // 当日キャンセルの連絡への返し方（2026-11-16）
      opts.push(
        { id: 'dc_ok', label: '「大丈夫です、また都合のいい日を教えてください」と返す' },
        { id: 'dc_short', label: '「了解です」とだけ返す' },
        { id: 'dc_complain', label: '「当日のキャンセルは正直困ります」と伝える' },
        { id: 'dc_end', label: 'このままやり取りを終える', sub: 'ライフは減らない' },
      );
      break;
    case 'invite_them':
      opts.push({ id: 'accept', label: '行きましょうと返す' }, { id: 'cheaper', label: '気軽な店を提案する' }, { id: 'decline', label: '今は会えないと伝える' });
      break;
    case 'keep':
    case 'chat_cool':
      talk4();
      break;
    case 'line_them':
      opts.push({ id: 'ok', label: 'LINEを交換する' }, { id: 'app', label: 'もう少しアプリで話したいと返す' });
      break;
    case 'line_no':
      opts.push({ id: 'fine', label: '「もちろん大丈夫です」と返す' }, { id: 'push', label: 'もう一度お願いする' });
      break;
    default:
      talk4();
  }
  // 一度断られたら、次に会うまでは聞き直せない
  const lineRefused = !!c.flags.lineDeclined && c.meetings <= Number(c.flags.lineDeclinedAt ?? 0);
  if (!c.lineExchanged && c.exchanges >= 1 && !lineRefused && !['business_line', 'sakura_move', 'line_them', 'line_no'].includes(t)) {
    opts.push({ id: 'line', label: 'LINE交換を提案する', sub: '断られることもある' });
  }
  if (c.stage === 'dating' && c.meetings >= 2) opts.push({ id: 'propose', label: '付き合ってほしいと伝える' });
  return opts;
}

/** 相手からのメッセージに返事をする */
export function playerReply(state: GameState, npcId: string, optionId: string): void {
  const c = state.contacts[npcId];
  const npc = state.npcs[npcId];
  if (!c || !c.awaitingMe) return;
  if (needsMembership(state, c) || unavailableReason(state)) return;
  if (channelOf(c) === 'external') {
    siteReply(state, c, npc, optionId);
    return;
  }
  const ch = character(state);
  c.awaitingMe = false;
  c.followUps = [];
  if (!c.twoWay) {
    // 相手から先に来たメッセージに初めて返した時点で双方向
    c.twoWay = true;
    state.stats.conversations += 1;
    state.week.twoWayStarted += 1;
    firstConversationRecovery(state);
  }
  c.exchanges += 1;
  if (c.stage === 'matched') c.stage = 'talking';
  // 返信を3日以上悩むと、会う前の相手は冷めてブロックしやすい（体験談 2026-11-09）
  const waitedDays = typeof c.flags.awaitSince === 'number' ? state.day - (c.flags.awaitSince as number) : 0;
  if (waitedDays >= 3 && c.meetings === 0 && isNormalPurpose(npc.purpose)) {
    c.interest -= 8;
    if (withRng(state, (r) => r.chance(0.3))) c.flags.blockedForFollowUps = true;
  }
  markActive(state, c);
  // 会う前の文面の選択肢（第4段階）：画面に出した文面をそのまま送り、会話の状態を進める
  const plan = c.meetings === 0 ? talkChoice(state, c, npc, optionId) : undefined;
  const deceptive = !isNormalPurpose(npc.purpose);
  let nextKind = 'chat';
  let text = '';
  let sent = false; // 選んだ手の中で送信まで済ませた
  let exchangeLine = false;

  if (optionId.startsWith('invite_')) {
    const tier = optionId.slice(7) as VenueTier;
    text = `よかったら今度、${TUNE_VENUES[tier].label}でも行きませんか？`;
    c.flags.inviteTier = tier;
    nextKind = 'date_answer';
  } else if (optionId === 'dc_end') {
    endContact(state, c, { by: 'me', cause: '当日キャンセルのあと自分から終了', visible: `${npc.name}とのやり取りを終えた。` });
    return;
  } else if (optionId.startsWith('dc_')) {
    // 当日キャンセルへの返事（2026-11-16）
    if (optionId === 'dc_ok') { text = '大丈夫です！また都合のいい日を教えてください。'; c.interest += deceptive ? 0 : 3; }
    else if (optionId === 'dc_short') { text = '了解です。'; c.interest -= 2; }
    else { text = '当日にキャンセルされるのは、正直ちょっと困ります…'; c.interest -= 10; }
    c.flags.aizuchiStreak = 0;
  } else if (optionId === 'block') {
    // 質問に答えたくない相手をブロックする（自分から終える。ライフは減らない。2026-11-11 指示）
    endContact(state, c, { by: 'me', cause: '質問に答えずブロックした', visible: `${npc.name}をブロックした。` });
    return;
  } else if (plan && optionId !== 'aizuchi') {
    // 会う前の会話（2026-11-11）：答える（＋聞き返す・質問を添える）／プロフィールを見て質問する／電話してみたいと言う
    text = plan.text;
    plan.apply();
    // 丁寧な返信のライフのコストはやめた（2026-11-14 指示）
    const casual = optionId.startsWith('ans_c');
    c.interest += deceptive ? 0 : casual ? 0 : optionId === 'callwish' ? 2 : 5;
    c.flags.talks = Number(c.flags.talks ?? 0) + (casual ? 0 : 1);
    c.flags.aizuchiStreak = casual ? Number(c.flags.aizuchiStreak ?? 0) + 1 : 0;
    if (optionId === 'callwish') nextKind = 'call_wish';
  } else {
    switch (optionId) {
      case 'aizuchi':
        if (plan) { text = plan.text; plan.apply(); } else text = playerAizuchiLine(state, c);
        c.flags.aizuchiLast = true; c.flags.aizuchiStreak = Number(c.flags.aizuchiStreak ?? 0) + 1;
        break;
      case 'zatsudan':
        if (plan) { text = plan.text; plan.apply(); } else {
          text = withRng(state, (r) => r.pick([`この前は楽しかったです！${npc.hobbies[0]}の話の続き、また聞かせてください`, '今週こんなことがあって…（近況を話す）', 'この前話してたお店、調べてみました！']));
        }
        c.interest += deceptive ? 0 : 6;
        c.flags.talks = Number(c.flags.talks ?? 0) + 1;
        c.flags.aizuchiStreak = 0;
        break;
      case 'change':
      case 'switch':
      case 'answer':
      case 'selftalk':
        // 相手のプロフィールの趣味を聞く／別の話題を聞く／答えるだけ／長く語る（第4段階）
        if (plan) { text = plan.text; plan.apply(); } else text = playerAizuchiLine(state, c);
        c.interest += deceptive ? 0 : optionId === 'change' ? 4 : optionId === 'selftalk' ? 1 : 3;
        c.flags.talks = Number(c.flags.talks ?? 0) + 1;
        c.flags.aizuchiStreak = 0;
        break;
      case 'dodge':
        // はぐらかす：質問に答えない
        if (plan) { text = plan.text; plan.apply(); } else text = 'まあいろいろですね笑';
        c.interest -= 4;
        c.flags.aizuchiStreak = Number(c.flags.aizuchiStreak ?? 0) + 1;
        break;
      case 'call':
        text = '（電話で1時間ほど話した）';
        c.interest += deceptive ? 2 : 11;
        c.flags.calledDay = state.day;
        if (c.meetings === 0) c.flags.callsBeforeMeet = Number(c.flags.callsBeforeMeet ?? 0) + 1;
        c.flags.talks = Number(c.flags.talks ?? 0) + 2;
        c.flags.aizuchiStreak = 0;
        afterCall(state, c, npc);
        nextKind = 'after_call';
        spendMinutes(state, 60); // 電話で1時間使う（2026-11-13。以前は1日使った）
        break;
      case 'meet_wish':
        text = playerMeetLine(state, c, npc);
        // 食べ物の話題から「〇〇食べに行きませんか？」と誘ったときは食事（2026-11-16）
        c.flags.inviteTier = c.meetings > 0 || c.flags.convTopic === 'food' ? 'casual' : 'cafe';
        // すぐに飲みに誘ってきた相手には、話した回数に関係なく会いたいと伝えられる（2026-11-21）
        if ((!enoughTalk(c) || !inviteReady(state, c, npc)) && !calledRecently(state, c) && !eagerToMeet(c)) {
          // 相槌ばかりで話していない相手からの誘いは、話をそらされる（2026-11-06 指示）。ライフは減らないが、7日間は誘い直せない
          c.flags.meetWishDeclinedDay = state.day;
          nextKind = 'invite_ignored';
          break;
        }
        c.flags.meetWishPending = c.meetings === 0; // 会う前だけ：断られたり予定が立たなかったりしたらライフが減る
        nextKind = 'date_answer';
        break;
      case 'warm': text = `${npc.hobbies[0]}、いいですよね！自分は最近…（話が弾む）`; c.interest += deceptive ? 0 : 8; break;
      case 'ask': text = 'お仕事は何されてるんですか？休みの日は？結婚願望はありますか？'; c.interest += 2; c.flags.interviewChat = true; break;
      case 'meet':
        text = '話しやすいので、さっそく今週どこかで会いませんか？';
        c.interest += npc.purpose === 'sincere' ? -8 : npc.purpose === 'ambiguous' ? -3 : 8;
        if (c.exchanges >= 1) { c.flags.inviteTier = 'cafe'; nextKind = 'date_answer'; }
        break;
      case 'empathize': text = 'わかります！自分も最近…（近況を少し話す）'; c.interest += deceptive ? 0 : 6; break;
      case 'short': text = 'そうなんですね！'; c.interest -= 6; break;
      case 'honest': text = `今は${ch.job}で、年収は${Math.round(ch.incomeYen / 10000)}万円くらいです。正直に言っておきたくて。`; c.flags.conditionsShared = true; c.interest += npc.prefs.minIncomeYen > ch.incomeYen ? -15 : 3; break;
      case 'vague': text = 'まあ色々やってます笑'; c.interest -= 4; c.flags.conditionsVague = true; break;
      case 'share':
        // 休みの伝え方は勤務の形に合わせる（2026-11-12 指示：コンサル・総合職で「不規則」はおかしい）
        text = ch.children > 0 ? '子どもがいるので、会えるのは月に数日です。先に伝えておきたくて。'
          : ch.constraints.shiftWork ? 'シフト勤務なので、土日は休めないことが多いです。'
          : ch.holiday === 'weekday' ? '休みは平日なので、土日は会いにくいです。'
          : ch.constraints.weekendWorkCalls ? '休みは土日なんですけど、平日は帰りが遅くて、休みの日も仕事の連絡が来ることがあります。'
          : '休みは土日です。平日は帰りが遅いことが多いので、会うなら週末が多くなりそうです。';
        c.flags.conditionsShared = true;
        c.interest += npc.traits.acceptsConstraints ? 5 : -20;
        break;
      case 'later': text = '詳しくは会ったときに話しますね。'; break;
      case 'force': text = '大丈夫です、合わせます！'; c.flags.overCommitted = true; break;
      case 'explain': text = '写真は載せていなくて…会ってからのほうが嬉しいです。'; nextKind = 'photo_answer'; break;
      case 'publish': {
        // 先に「載せました」と送ってから、相手が写真を見て判断する（2026-11-28：離脱されても、送った顔はトークに残す）
        text = 'プロフィールに顔写真を載せました。見てもらえたら嬉しいです。';
        nextKind = 'photo_answer';
        const at = c.messages.length;
        for (const line of splitSentences(text)) pushMsg(c, state.day, 'me', line);
        if (PLAYER_FACE[state.characterId] && c.messages[at]) c.messages[at].image = PLAYER_FACE[state.characterId];
        sent = true;
        publishPhoto(state, true);
        if (c.stage === 'ended') return; // 公開写真を見て離脱した
        break;
      }
      case 'happy': text = '嬉しいです…！'; c.flags.expectationUp = true; c.interest += 3; break;
      case 'temper': text = '会ってみないと分からないですよ笑'; break;
      case 'pace': text = 'ゆっくり仲良くなりたいので、自分のペースで進めたいです。'; c.interest += npc.purpose === 'body' ? -20 : 5; break;
      case 'laugh': text = '笑'; break;
      case 'match': text = 'いいね！楽しみ'; c.interest += npc.purpose === 'body' ? 10 : 0; c.flags.eager = true; break;
      case 'budget': text = '正直あまり高いお店は行けないんだけど、美味しい店なら探すよ。'; c.interest += npc.purpose === 'profit' ? -25 : 3; break;
      case 'impress': text = 'いいね、連れて行くよ！'; c.flags.promisedLuxury = true; c.interest += npc.purpose === 'profit' ? 15 : 3; break;
      case 'skip': text = 'そういえば最近…（話題を変える）'; break;
      case 'accept': text = '平日でも大丈夫ですよ。'; break;
      case 'line': text = 'よかったらLINE交換しませんか？'; nextKind = 'line_answer'; break;
      case 'ok': text = 'いいですよ、交換しましょう。'; exchangeLine = true; c.interest += deceptive ? 0 : 3; break;
      case 'app': text = 'もう少しアプリで話したいです。'; c.interest -= npc.purpose === 'business' ? 10 : 3; break;
      case 'dig': text = `${npc.hobbies[0]}って、どんなところが好きなんですか？`; c.interest += deceptive ? 0 : 3; break;
      case 'fine': text = 'もちろん大丈夫です！また会えたときにでも。'; c.interest += 2; break;
      case 'push': text = 'LINEの方が楽なので、ぜひ交換したいです！'; c.interest -= 12; break;
      case 'decline':
        if (c.topic === 'business_pitch_hint') {
          pushMsg(c, state.day, 'me', '二人で会うのでなければ、遠慮しておきます。');
          endContact(state, c, { by: 'me', cause: '勧誘の気配に気づいて会う前に断った', eventId: 'E11', base: SPEC_LOSS.E11_EARLY, visible: '勧誘の気配に気づいて、会う前に断った。' });
          return;
        }
        if (c.topic === 'sakura_move') {
          pushMsg(c, state.day, 'me', 'このアプリで話したいです。');
          endContact(state, c, { by: 'me', cause: '外部サイトへの誘導を断った', eventId: 'E13', base: SPEC_LOSS.E13_DECLINED, visible: `${npc.name}は「じゃあいいです」と言い、それきりになった。` });
          return;
        }
        text = '今はちょっと会えなくて…ごめんなさい。'; c.interest -= 10; break;
      case 'go': text = '3人でも大丈夫ですよ。'; c.flags.inviteTier = 'cafe'; nextKind = 'date_answer'; break;
      case 'calm': text = '会ってからちゃんと判断したいです。'; c.flags.scamCalm = true; break;
      case 'move':
        pushMsg(c, state.day, 'me', '分かりました、登録してみます。');
        withRng(state, (r) => {
          c.flags.sakuraStart = state.day;
          c.flags.sakuraUntil = state.day + r.int(10, 30);
        });
        c.flags.sakuraPaid = 0;
        c.warningSignDay ??= state.day;
        pushMsg(c, state.day, 'system', `外部サイト「${SITE_NAME}」に登録した。メッセージは1通${SITE_MESSAGE_YEN.toLocaleString()}円分のポイントで送れる。`);
        c.pendingReply = { day: state.day + 1, kind: 'site', willReply: true, expireDay: state.day + 1 };
        return;
      case 'cheaper': text = '気軽なお店だとうれしいです。'; c.flags.inviteTier = 'cafe'; nextKind = 'date_answer_them'; break;
      case 'propose': text = 'ちゃんと付き合ってほしいと思ってる。'; nextKind = 'proposal'; c.flags.playerProposed = true; break;
      default:
        text = 'うんうん';
    }
    if (c.topic === 'invite_them' && optionId === 'accept') { text = '行きましょう！'; nextKind = 'date_answer_them'; c.flags.inviteTier ??= npc.purpose === 'profit' ? 'luxury' : 'casual'; }
    if (c.topic === 'married_hint' && optionId === 'ask') { text = '土日に会えないのは、何か理由があるんですか？'; c.warningSignDay ??= state.day; c.flags.askedMarried = true; }
  }
  // 選んだ手で、相手の温度が動く（会う前。トーク仕様案 v0.2 §3.4、2026-11-11）
  stepLevel(state, c, npc, qualityOf(state, c, npc, optionId));
  // 1通1文・最大3通に分けて送る（2026-11-11）
  // 顔写真を載せたと伝えるとき（publish）は、上で送って顔をトークに出している（2026-11-10 顔かくしの素材）
  if (!sent) for (const line of splitSentences(text)) pushMsg(c, state.day, 'me', line);
  if (exchangeLine) {
    // ここから先のやり取りはLINE（トークの「LINE・外部サイト」に移る。男性も有料会員は不要）
    c.lineExchanged = true;
    pushMsg(c, state.day, 'system', 'LINEを交換しました。ここからのやり取りはLINEで続きます。');
  }
  scheduleReply(state, c, nextKind === 'after_call' ? 'chat' : nextKind, nextKind.startsWith('date_answer') || nextKind === 'invite_ignored' ? 1 : nextKind === 'photo_answer' || nextKind === 'proposal' || nextKind === 'after_call' ? 0.98 : replyChance(state, c, npc));
}

/**
 * 選んだ手の良し悪し（トーク仕様案 v0.2 §3.4）。刺さる＝相手と共通の趣味の話、良い＝答えて聞き返す・話を広げる・電話、
 * 雑＝相槌だけ・質問攻め・素っ気ない返事、侵害＝断られた後に食い下がる
 */
function qualityOf(state: GameState, c: Contact, npc: Npc, optionId: string): Quality {
  const shared = playerHobbies(state).some((h) => npc.hobbies.includes(h));
  // 会う前の会話の選択肢（2026-11-11）
  if (optionId.startsWith('ans_c')) return 'sloppy';
  if (optionId.startsWith('ans_d')) return optionId.includes('+') ? 'good' : 'normal';
  if (optionId.startsWith('q:d:')) return 'good';
  if (optionId.startsWith('q:a:hobby')) return shared ? 'hit' : 'good';
  if (optionId.startsWith('q:')) return 'normal';
  if (optionId === 'callwish') return 'good';
  switch (optionId) {
    case 'aizuchi': case 'short': case 'ask': case 'vague': case 'dodge': return 'sloppy';
    case 'answer': case 'switch': case 'selftalk': return 'normal';
    case 'push': return 'violation';
    case 'change': return shared ? 'hit' : 'good';
    case 'zatsudan': return shared && c.flags.convTopic === 'hobby' ? 'hit' : 'good';
    case 'call': case 'dig': case 'warm': case 'empathize': case 'honest': case 'share': return 'good';
    default: return 'normal';
  }
}

// ── 外部の有料メッセージサイト（サクラ・E13） ──
export const SITE_NAME = 'ハートメール';
export const SITE_MESSAGE_YEN = 500;

const SITE_LINES = {
  first: ['こっちだと通知が来るから安心♪ 来てくれてありがとう', 'やっと落ち着いて話せるね。ここなら写真も送れるよ'],
  meet: ['会いたい…！でも今週は仕事が詰まってて。来週なら絶対！それまでここで話そ？', '会うのはもう少しお互いを知ってからがいいな。ここでたくさん話そう'],
  photo: ['写真は会員同士だとポイントで送れるみたい。もうちょっと話したら送るね', 'ごめん、今アプリの調子が悪くて写真が送れないの…'],
  chat: ['今日もメッセージくれて嬉しい。{me}さんと話すのが一日の楽しみ', 'ねえ、もっと{me}さんのこと知りたいな。今日は何してた？'],
  nudge: ['最近メッセージ来ないけど大丈夫？ポイント切れちゃった？', '待ってるね。話したいことがたくさんあるの'],
};

/** 外部サイトでの返事（1通ごとにポイント代。相手は会う話をかわし続ける） */
function siteReply(state: GameState, c: Contact, npc: Npc, optionId: string): void {
  const paid = Number(c.flags.sakuraPaid ?? 0);
  if (optionId === 'site_quit') {
    pushMsg(c, state.day, 'me', 'ごめんなさい、このサイトでのやり取りはやめます。');
    if (paid === 0) {
      endContact(state, c, { by: 'me', cause: '外部サイトへの誘導に気づいて離れた', eventId: 'E13', base: SPEC_LOSS.E13_DECLINED, visible: 'ポイントを使う前に外部サイトから離れた。' });
    } else {
      endContact(state, c, {
        by: 'me', cause: '外部の有料サイトへ誘導された（サクラ）', eventId: 'E13', base: SPEC_LOSS.E13_FOUND,
        visible: `外部サイトから離れた。会えないまま使ったポイントは${paid.toLocaleString()}円。`,
      });
    }
    return;
  }
  const text = optionId === 'site_meet' ? '今度こそ会いませんか？日にちはそちらに合わせます。'
    : optionId === 'site_photo' ? '写真を送ってもらえませんか？'
      : '今日は仕事が忙しかったです。そっちはどうでした？';
  pushMsg(c, state.day, 'me', text);
  spend(state, SITE_MESSAGE_YEN, 'special', `外部サイト「${SITE_NAME}」のポイント（${npc.name}へのメッセージ）`, { npcId: c.npcId, special: true });
  c.flags.sakuraPaid = paid + SITE_MESSAGE_YEN;
  c.flags.siteLastAsk = optionId;
  c.awaitingMe = false;
  c.pendingReply = { day: state.day + 1, kind: 'site', willReply: true, expireDay: state.day + 1 };
}

function siteNpcMessage(state: GameState, c: Contact, npc: Npc): void {
  const ask = String(c.flags.siteLastAsk ?? '');
  const pool = !c.flags.siteGreeted ? SITE_LINES.first : ask === 'site_meet' ? SITE_LINES.meet : ask === 'site_photo' ? SITE_LINES.photo : SITE_LINES.chat;
  c.flags.siteGreeted = true;
  const text = fill(withRng(state, (r) => r.pick(pool)), vars(state, npc));
  npcSay(state, c, 'site', { text });
}

/** 返事のない相手にもう一度送る（連投の記録） */
export function followUp(state: GameState, npcId: string): void {
  const c = state.contacts[npcId];
  const npc = state.npcs[npcId];
  if (!c || c.awaitingMe || c.stage === 'ended' || c.stage === 'like_sent' || c.stage === 'like_failed') return;
  if (needsMembership(state, c) || channelOf(c) === 'external' || unavailableReason(state)) return;
  pushMsg(c, state.day, 'me', withRng(state, (r) => r.pick(['お疲れさまです！お忙しいですか？', 'この前の話の続き、気になってます笑', 'もしかして何か気に障ることを言ってしまいましたか…？'])));
  c.followUps.push(state.day);
  c.interest -= 8;
  if (isNormalPurpose(npc.purpose) && c.followUps.filter((d) => state.day - d < 7).length >= 3 && withRng(state, (r) => r.chance(0.5))) {
    c.flags.blockedForFollowUps = true;
  }
}

function answerInvite(state: GameState, c: Contact, npc: Npc, byThem: boolean): void {
  const tier = (c.flags.inviteTier as VenueTier | undefined) ?? 'cafe';
  if (npc.purpose === 'sakura') {
    npcSay(state, c, 'sakura_deflect', { awaitMe: false });
    npcSay(state, c, 'sakura_move', { text: 'それより、このアプリ通知が来なくて…こっちのサイトなら写真も送れるから、移動して話さない？' });
    return;
  }
  if (npc.purpose === 'scam') {
    npcSay(state, c, 'scam_love', { text: '会いたいけど、今は仕事で海外にいて…戻ったら必ず会おうね。それまで毎日話したい' });
    return;
  }
  // 会う約束まで進まない相手（進み方の上限 reach が0〜1・まだ会っていない）
  const noPromise = typeof c.flags.reach === 'number' && c.flags.reach < 2 && c.meetings === 0;
  if (!state.player.photoVisible && !c.faceKnown && npc.traits.requiresFace) {
    if (!c.flags.photoAsked) {
      c.flags.photoAsked = true;
      npcSay(state, c, 'photo_ask');
      return;
    }
  }
  if (npc.purpose === 'profit' && tier !== 'luxury' && !c.flags.meshiRequested && !sneakyMeshi(state, npc)) {
    c.flags.meshiRequested = true;
    pushMeshiRequest(state, c);
    return;
  }
  if (isNormalPurpose(npc.purpose) && !noPromise && npc.traits.moneySense === 'lavish' && tier === 'cafe' && !c.flags.meshiRequested && withRng(state, (r) => r.chance(0.3))) {
    c.flags.meshiRequested = true;
    pushMeshiRequest(state, c);
    return;
  }
  let p: number;
  if (noPromise) c.interest = Math.min(c.interest, TUNE_FUNNEL.noPromiseInterestCap);
  // 自分から飲みに誘ってきた相手は、こちらの誘いも必ず受ける（2026-11-21）
  const eager = eagerToMeet(c);
  if (noPromise) {
    p = 0; // 会う約束までは進まない相手
  } else if (typeof c.flags.reach === 'number' && c.meetings === 0) {
    p = byThem ? 1 : TUNE_FUNNEL.promiseAccept; // 約束まで進む相手
    if (state.gender === 'M' && c.interest >= TUNE_INTIMACY_SURE) p = 1;
  } else if (isNormalPurpose(npc.purpose)) {
    p = TUNE_DATE_ACCEPT_BASE * Math.min(1.5, Math.max(0.2, c.interest / 55));
    if (byThem) p = 1;
    // 男性プレイヤー：親密度が70以上なら必ず受けてもらえる（2026-11-03 指示）。未満はランダム
    if (state.gender === 'M' && c.interest >= TUNE_INTIMACY_SURE) p = 1;
  } else {
    p = 0.95;
  }
  // 電話をした相手は、こちらの誘いを受けやすい：受諾率 +20%（上限85%。2026-11-14 指示）。
  // 会う気のなかった相手も、電話で気が変わって受けたら、実際に会うところまで進む
  const callBoost = !byThem && isNormalPurpose(npc.purpose) && calledRecently(state, c) && p < TUNE_AFTER_CALL.acceptCap;
  if (callBoost) p = Math.min(TUNE_AFTER_CALL.acceptCap, p + TUNE_AFTER_CALL.acceptBonus);
  // 「先に一度電話したい」という返事は、実際には見ないのでやめた（2026-11-11 ユーザー指示：誘いの返事は承諾／予定が合わない／無視の3つだけ）
  if (eager) p = 1;
  const ok = p >= 1 || (p > 0 && withRng(state, (r) => r.chance(Math.min(0.97, p))));
  if (ok && callBoost && noPromise) c.flags.reach = 3;
  const wished = !!c.flags.meetWishPending;
  c.flags.meetWishPending = false;
  const level = c.meetings === 0 ? levelOf(state, c, npc) : (3 as Level);
  // 会う気のない相手は、1回目は「予定が合わない」（別の日を出さない＝実質のお断り）。もう一度誘うと無視されて終わる
  if (!ok && noPromise && !c.flags.deflected) {
    c.flags.deflected = true;
    c.flags.meetWishDeclinedDay = state.day;
    npcSayMany(state, c, 'chat_cool', busyLines(state, c, npc));
    addFeed(state, `${npc.name}に誘いを「予定が合わない」とかわされた。別の日を出してこない相手とは、このまま会えずに終わることが多い。`, 'bad', c.npcId);
    return;
  }
  if (!ok) {
    if (wished || c.meetings === 0) {
      // 温度がふつう以上の人（丁寧な人は必ず）は「予定が合わない」と返し、会話は続く。それ以外は無視（既読のまま）で終わる（2026-11-11）
      // 会う気のない相手（1回目でかわした相手）は、2回目は温度に関係なく無視で終わる（以前のブロックと同じく損失なし）
      if (c.meetings === 0 && !noPromise && (level >= 3 || personaOf(state, c, npc).type === 'polite')) {
        c.flags.meetWishDeclinedDay = state.day;
        c.interest -= 5;
        npcSayMany(state, c, 'chat_cool', busyLines(state, c, npc));
        addFeed(state, `${npc.name}に誘いを「予定が合わない」と返された。`, 'bad', c.npcId);
        return;
      }
      for (const m of c.messages) if (m.from === 'me') m.read = true;
      endContact(state, c, { by: 'them', cause: '会う誘いを無視された', visible: `${npc.name}を誘ったメッセージは既読のまま返事が来ない。数日後、トークは「このユーザーは存在しません」になっていた。` });
      return;
    }
    // 一度会った相手は「予定が合わない」
    c.flags.meetWishDeclinedDay = state.day;
    c.interest -= 5;
    npcSayMany(state, c, 'chat_cool', busyLines(state, c, npc));
    addFeed(state, `${npc.name}に誘いを「予定が合わない」と返された。`, 'bad', c.npcId);
    return;
  }
  const scheduled = scheduleDate(state, c, tier, byThem ? 'them' : 'me');
  if (scheduled) {
    npcSayMany(state, c, 'chat_normal', acceptLines(state, c, npc, level), { awaitMe: false });
  }
}

/**
 * 「電話してみたい」への返事（2026-11-11 指示）。温度が高いほど受けてくれる。受けたらその夜に電話して、
 * 電話をしたのと同じ効果（好感度・会う前の電話の回数）。断られたらメッセージで続ける
 */
function answerCallWish(state: GameState, c: Contact, npc: Npc): void {
  const level = c.meetings === 0 ? levelOf(state, c, npc) : 4;
  // 自分から飲みに誘ってきた相手は、電話も受ける（2026-11-21）
  const p = eagerToMeet(c) ? 1 : !isNormalPurpose(npc.purpose) ? 0.6 : level >= 4 ? 0.9 : level === 3 ? 0.65 : level === 2 ? 0.25 : 0.05;
  const ok = withRng(state, (r) => r.chance(p));
  c.flags.myAct = '';
  c.flags.convAct = '';
  if (!ok) {
    c.interest -= 2;
    npcSayMany(state, c, 'chat_cool', [withRng(state, (r) => r.pick(['電話はちょっと苦手で…', 'すみません、電話はもう少し先でもいいですか？', 'ごめんなさい、最近夜はバタバタしてて…']))]);
    return;
  }
  // 体験談（2026-11-18）：明日電話する約束をした相手から、直前にブロックされた（会う気のない相手）
  if (isNormalPurpose(npc.purpose) && !eagerToMeet(c) && typeof c.flags.reach === 'number' && c.flags.reach < 2 && withRng(state, (r) => r.chance(0.15))) {
    npcSay(state, c, 'chat_normal', { text: 'いいですよ！明日の夜21時とかどうですか？', awaitMe: false });
    pushMsg(c, state.day, 'me', 'ぜひ！明日21時、楽しみにしてます');
    c.pendingReply = { day: state.day + 1, minute: 20 * 60 + 40, kind: 'call_block', willReply: true, expireDay: state.day + 2 };
    c.awaitingMe = false;
    return;
  }
  npcSay(state, c, 'chat_normal', { text: withRng(state, (r) => r.pick(['いいですよ！今夜とかどうですか？', 'ぜひ！夜なら大丈夫です', 'いいですね、話してみたいです！'])), awaitMe: false });
  pushMsg(c, state.day, 'system', '（その夜、電話で1時間ほど話した）');
  c.interest += isNormalPurpose(npc.purpose) ? 11 : 2;
  c.flags.calledDay = state.day;
  if (c.meetings === 0) c.flags.callsBeforeMeet = Number(c.flags.callsBeforeMeet ?? 0) + 1;
  c.flags.talks = Number(c.flags.talks ?? 0) + 2;
  afterCall(state, c, npc);
  npcSay(state, c, 'chat_normal', { text: withRng(state, (r) => r.pick(['電話楽しかったです！また話しましょう☺️', '声聞けてよかったです！', '思ってたより話しやすかったです笑'])) });
}

/** 返信予定の時刻が来た相手の返事を届ける。届けたら true（2026-11-14：送った時刻から予約した返信を、その時刻に処理できるように切り出した） */
function deliverReply(state: GameState, c: Contact, npc: Npc): boolean {
  const pr = c.pendingReply;
  if (!pr) return false;
  // 電話の約束をしたのに、その直前にブロック（2026-11-18 体験談）
  if (pr.kind === 'call_block') {
    c.pendingReply = undefined;
    endContact(state, c, { by: 'them', cause: '電話の約束をした直前にブロックされた', eventId: 'E04', base: SPEC_LOSS.E04_EARLY, visible: `約束の電話の時間の少し前、${npc.name}とのトークを開くと「このユーザーは存在しません」と表示された。` });
    return true;
  }
  // 電話で盛り上がった翌日「友達にしか思えない」
  if (c.flags.friendZone === true && c.meetings === 0 && pr.willReply) {
    c.pendingReply = undefined;
    c.flags.friendZone = false;
    npcSayMany(state, c, 'chat_cool', ['何回か電話してみて、すごく楽しかったんですけど…', 'ごめんなさい、友達にしか思えなくて。']);
    endContact(state, c, { by: 'them', cause: '電話で盛り上がった翌日、「友達にしか思えない」とブロックされた', eventId: 'E04', base: SPEC_LOSS.E04_EARLY, visible: `${npc.name}から「友達にしか思えない」と届いたあと、トークが開けなくなった。` });
    return true;
  }
  if (pr.kind === 'opener') { c.pendingReply = undefined; opener(state, c, npc); return true; }
  if (pr.kind === 'site') { c.pendingReply = undefined; siteNpcMessage(state, c, npc); return true; }
  if (pr.kind === 'after_date') { c.pendingReply = undefined; afterDateReply(state, c); return true; }
  if (c.flags.blockedForFollowUps) { c.pendingReply = undefined; fadeBeforeMeeting(state, c, noteE02); return true; }
  if (pr.willReply) { c.pendingReply = undefined; npcReply(state, c, npc, pr.kind); return true; }
  return false;
}

/** 時刻の進行中（ロック画面・アプリの操作で時間が進んだとき）：届く時刻が来た返信を届ける。届いた相手の id を返す */
export function deliverRepliesUntil(state: GameState, minute: number): { npcId: string; minute: number; from: number }[] {
  const out: { npcId: string; minute: number; from: number }[] = [];
  for (const c of Object.values(state.contacts)) {
    if (c.stage === 'ended' || c.stage === 'like_sent' || c.stage === 'like_failed') continue;
    const pr = c.pendingReply;
    if (!pr || !pr.willReply && pr.kind !== 'opener' && pr.kind !== 'site' && pr.kind !== 'after_date' && !c.flags.blockedForFollowUps) continue;
    const due = pr.day < state.day || (pr.day === state.day && (pr.minute ?? 0) <= minute);
    if (!due) continue;
    const at = pr.day === state.day ? Math.max(0, pr.minute ?? 0) : 0;
    const from = c.messages.length;
    if (deliverReply(state, c, state.npcs[c.npcId])) out.push({ npcId: c.npcId, minute: at, from });
  }
  return out;
}

/** 毎日：相手の返信予定を処理する（時刻つきの返信は、時刻の進行中に deliverRepliesUntil で届ける） */
export function processRepliesDaily(state: GameState): void {
  for (const c of Object.values(state.contacts)) {
    if (c.stage === 'ended' || c.stage === 'like_sent' || c.stage === 'like_failed') continue;
    const npc = state.npcs[c.npcId];
    const pr = c.pendingReply;
    // 日付の変わり目（ロック画面の進行）では、時刻つきの返信は時刻が来るまで待つ
    const due = pr && (pr.day < state.day || (pr.day === state.day && (pr.minute === undefined || !state.flags.clockOpen)));
    if (pr && due) {
      if (deliverReply(state, c, npc)) continue;
      // 返信しない場合でも、既読だけつくことがある
      if (pr.day === state.day && withRng(state, (r) => r.chance(0.6))) for (const m of c.messages) if (m.from === 'me') m.read = true;
    }
    if (pr && !pr.willReply && pr.expireDay <= state.day && c.pendingReply === pr) {
      c.pendingReply = undefined;
      if (!c.twoWay) {
        // 初回メッセージ後7日間会話にならない（E02）。定型文だけの場合は損失にしない
        if (c.firstMessageQuality && c.firstMessageQuality !== 'template') noteE02(state, c);
        endContact(state, c, { by: 'them', cause: 'マッチ後に会話にならなかった', eventId: c.firstMessageQuality !== 'template' ? 'E02' : undefined, visible: `${npc.name}からの返信がないまま7日が過ぎた。` });
      } else if (c.stage === 'dating' && c.meetings > 0) {
        endContact(state, c, { by: 'them', cause: 'デート後の既読無視', eventId: 'E03', base: SPEC_LOSS.E03, visible: `${npc.name}からの返信は来なかった。` });
      } else {
        fadeBeforeMeeting(state, c, noteE02);
      }
    }
    // 外部サイト：返事をしないと相手から催促が届く（受け取るのは無料）
    if (channelOf(c) === 'external' && c.awaitingMe && typeof c.flags.awaitSince === 'number') {
      const waited = state.day - (c.flags.awaitSince as number);
      if (waited > 0 && waited % 3 === 0) {
        pushMsg(c, state.day, 'them', fill(withRng(state, (r) => r.pick(SITE_LINES.nudge)), vars(state, npc)));
      }
      continue;
    }
    // プレイヤーが返事をしないまま放置した場合
    if (c.awaitingMe && typeof c.flags.awaitSince === 'number') {
      const waited = state.day - (c.flags.awaitSince as number);
      if (waited === 7) c.interest -= 15;
      if (waited >= 14 && c.stage !== 'relationship') {
        endContact(state, c, { by: 'me', cause: '返信しないまま自然消滅', visible: `返信しないまま、${npc.name}とのトークが止まった。` });
      }
    }
  }
}

/** LINE交換を持ちかけられた相手の返事。断られることもある（「会ってから」主義、まだ早い、既婚者は避ける） */
function answerLine(state: GameState, c: Contact, npc: Npc): void {
  // 返事を待つ間に（デートの別れ際などで）交換が済んでいたら、ふつうの返事にする
  if (c.lineExchanged) {
    npcSay(state, c, 'chat_normal');
    return;
  }
  if (npc.purpose === 'sakura') {
    npcSay(state, c, 'sakura_move', { text: 'LINEは前にトラブルがあって…。このサイトなら写真も送れるので、こっちで話しませんか？' });
    return;
  }
  const g = state.gender === 'M' ? 'toMale' : 'toFemale';
  let p: number;
  if (isNormalPurpose(npc.purpose)) {
    c.flags.lineAfterMeeting ??= withRng(state, (r) => r.chance(TUNE_LINE.afterMeetingOnly[g]));
    p = c.flags.lineAfterMeeting && c.meetings === 0 ? 0
      : Math.min(0.95, Math.max(0.05, (c.interest - TUNE_LINE.acceptOffset) / TUNE_LINE.acceptSpan)) * (c.exchanges < 3 && c.meetings === 0 ? 0.7 : 1);
  } else {
    p = TUNE_LINE.purposeAccept[npc.purpose] ?? 0.5;
  }
  if (withRng(state, (r) => r.chance(p))) {
    npcSay(state, c, 'chat_normal', { text: withRng(state, (r) => sayLines(state, npc, LINE_TALK.accept, r)) });
    c.lineExchanged = true;
    pushMsg(c, state.day, 'system', 'LINEを交換しました。ここからのやり取りはLINEで続きます。');
    return;
  }
  c.interest -= 3;
  c.flags.lineDeclined = true;
  c.flags.lineDeclinedAt = c.meetings;
  if (npc.purpose === 'married') c.warningSignDay ??= state.day;
  npcSay(state, c, 'line_no', { text: withRng(state, (r) => sayLines(state, npc, npc.purpose === 'married' ? LINE_TALK.declineMarried : c.meetings > 0 ? LINE_TALK.declineMet : LINE_TALK.decline, r)) });
}

/** 会う話をしてもいいくらい話したか：会う前は、雑談・電話を2回以上して、直近が相槌続きでないこと */
/**
 * 会う前に、デートの誘いが出てよいだけ往復したか（2026-11-11 指示：5〜10往復以降 → 2026-11-14 指示で3〜6往復以降。相手ごとに決まる）。
 * ヤリ目・メシ目などの目的を偽る相手は早く誘ってくるので対象外
 */
export function inviteReady(state: GameState, c: Contact, npc: Npc): boolean {
  if (c.meetings > 0 || !isNormalPurpose(npc.purpose)) return true;
  if (typeof c.flags.inviteAfter !== 'number') c.flags.inviteAfter = Rng.fromSeed(state.seed, 'invite-after', c.npcId).int(3, 6);
  return c.exchanges >= Math.min(6, Number(c.flags.inviteAfter)); // 古いセーブの7〜10往復も6往復までに
}

/** 丁寧な返信（詳しく答える・プロフィールを見て質問する）のコスト。2026-11-13 に1日2回まで無料・3回目からライフ −1 にしたが、2026-11-14 指示でやめた（cost 0） */
export const TUNE_POLITE = { freePerDay: 2, cost: 0 };
export function isPoliteReply(optionId: string): boolean {
  return optionId.startsWith('ans_d') || optionId.startsWith('q:');
}
/** 今日あと何回、丁寧な返信を無料でできるか */
export function politeFreeLeft(state: GameState): number {
  const used = state.flags.politeDay === state.day ? Number(state.flags.politeCount ?? 0) : 0;
  return Math.max(0, TUNE_POLITE.freePerDay - used);
}

/** 最近電話した相手か（電話の効果が続く間） */
function calledRecently(state: GameState, c: Contact): boolean {
  return typeof c.flags.calledDay === 'number' && state.day - c.flags.calledDay <= TUNE_AFTER_CALL.days;
}

/** 電話をした（効果は誘いの受諾率。answerInvite の callBoost。2026-11-14） */
function afterCall(state: GameState, c: Contact, npc: Npc): void {
  delete c.flags.postCallInvite; // 同じ日の朝の版の名残（古いセーブ）
  // 体験談（2026-11-18）：何度か電話して盛り上がったのに、翌日「友達にしか思えない」と言われてブロック（会う気のない相手）
  const noMeet = typeof c.flags.reach === 'number' && c.flags.reach < 2 && c.meetings === 0;
  if (isNormalPurpose(npc.purpose) && noMeet && c.flags.friendZone === undefined && Number(c.flags.callsBeforeMeet ?? 0) >= 2) {
    c.flags.friendZone = withRng(state, (r) => r.chance(0.35));
  }
}

function enoughTalk(c: Contact): boolean {
  return c.meetings > 0 || (Number(c.flags.talks ?? 0) >= 2 && Number(c.flags.aizuchiStreak ?? 0) < 2);
}

function npcReply(state: GameState, c: Contact, npc: Npc, kind: string): void {
  const ch = character(state);
  // 男性プレイヤー：会う約束まで進まない相手は、やり取りの途中で突然ブロックすることがある
  if (state.gender === 'M' && c.meetings === 0 && typeof c.flags.reach === 'number' && c.flags.reach <= 1 && c.exchanges >= 2
    && !kind.startsWith('date_answer') && withRng(state, (r) => r.chance(TUNE_MALE_EMPTY.blockPerReply * (1 - Math.max(attentiveness(state, npc), 0.6 * playerPopularity(state)))))) {
    noteE02(state, c);
    endContact(state, c, { by: 'them', cause: '会話の途中で突然ブロックされた', visible: `${npc.name}とのトークを開くと「このユーザーは存在しません」と表示された。` });
    return;
  }
  if (!c.twoWay) {
    c.twoWay = true;
    state.stats.conversations += 1;
    state.week.twoWayStarted += 1;
    firstConversationRecovery(state);
    if (c.stage === 'matched') c.stage = 'talking';
  }
  markActive(state, c);
  if (kind === 'greet') {
    // 最初の返信：魅力度の格差で決まる温度で、挨拶だけか、2〜3通か（2026-11-11）
    const level = levelOf(state, c, npc);
    if (level <= 2) c.flags.curtReplies = Number(c.flags.curtReplies ?? 0) + 1;
    npcSayMany(state, c, 'greet', greetByLevel(state, c, npc, level, GREET_CURT, GREET[npc.purpose]));
    earlyDrinkInvite(state, c, npc);
    return;
  }
  if (kind === 'line_answer') {
    answerLine(state, c, npc);
    return;
  }
  if (kind === 'date_answer' || kind === 'date_answer_them') {
    answerInvite(state, c, npc, kind === 'date_answer_them');
    return;
  }
  if (kind === 'invite_ignored') {
    c.flags.convAct = ''; // 話をそらされた後は、こちらから新しい話題を振る
    c.flags.myAct = '';
    // 2026-11-14 指示：「予定が合わない」ではなく「もう少し話してから」と返す（断られた理由が分かるように）
    npcSayMany(state, c, 'chat_normal', tooEarlyLines(state, c, npc));
    addFeed(state, `${npc.name}を誘ったが「もう少しお話ししてから」と返された。もう少しやり取りしてから誘うとよさそう。`, 'neutral', c.npcId);
    return;
  }
  if (kind === 'proposal') {
    answerProposal(state, c, npc);
    return;
  }
  if (kind === 'call_wish') {
    answerCallWish(state, c, npc);
    return;
  }
  if (kind === 'photo_answer') {
    if (state.player.photoVisible) {
      // 公開写真での判定は publishPhoto で済んでいる
      if (c.stage === 'ended') return;
      c.flags.inviteTier ??= 'cafe';
      answerInvite(state, c, npc, false);
    } else {
      state.stats.photoRequestDrops += 1;
      npcSay(state, c, 'chat_cool', { text: 'そっか…ごめんなさい、顔が分からないまま会うのはちょっと難しいかも。', awaitMe: false });
      noteE02(state, c);
      endContact(state, c, { by: 'them', cause: '顔写真がないため会う前に止まった', eventId: 'E02', visible: `${npc.name}とは、会う前にやり取りが終わった。` });
    }
    return;
  }
  if (maybeScamPitch(state, c)) {
    npcSay(state, c, 'scam_love', { awaitMe: false });
    return;
  }
  // 次の話題を選ぶ
  const topic = withRng(state, (r) => {
    const ex = c.exchanges;
    const p = npc.purpose;
    if (p === 'sakura' && ex >= 1) return 'sakura_move';
    if (p === 'business' && ex === 1 && !c.lineExchanged) return 'business_line';
    if (p === 'business' && ex >= 2) return 'business_pitch_hint';
    if (p === 'scam') return 'scam_love';
    if (p === 'bijin' && ex >= 1) return 'invite_them';
    if (p === 'body' && ex >= 1 && r.chance(0.5)) return 'body_hint';
    if (p === 'profit' && ex >= 1 && !c.flags.profitHinted) { c.flags.profitHinted = true; return 'profit_hint'; }
    if (p === 'married' && ex >= 1 && r.chance(0.5)) return 'married_hint';
    if (c.meetings === 0 && ex >= 1 && !c.flags.jobAsked && (ch.id === 'M03' || ch.id === 'M10' || (state.gender === 'M' && npc.prefs.minIncomeYen > 0 && r.chance(0.3)))) { c.flags.jobAsked = true; return 'job'; }
    if (c.meetings === 0 && ex >= 1 && !c.flags.kidsAsked && ch.children > 0) { c.flags.kidsAsked = true; return 'kids'; }
    if (c.meetings === 0 && ex >= 1 && !c.flags.scheduleAsked && (ch.constraints.shiftWork || ch.constraints.busy) && r.chance(0.6)) { c.flags.scheduleAsked = true; return 'schedule'; }
    if (!state.player.photoVisible && !c.faceKnown && ex >= 1 && !c.flags.photoAsked && npc.traits.requiresFace && r.chance(0.5)) { c.flags.photoAsked = true; return 'photo_ask'; }
    if (!state.player.photoVisible && !c.faceKnown && ex >= 1 && !c.flags.praised && r.chance(0.35)) { c.flags.praised = true; return 'praise_blind'; }
    const aizuchi = !!c.flags.aizuchiLast;
    const canPromise = (typeof c.flags.reach !== 'number' || c.flags.reach >= 2 || c.meetings > 0) && enoughTalk(c) && inviteReady(state, c, npc);
    c.flags.aizuchiLast = false;
    if (state.gender === 'F' && ex >= 1 && isNormalPurpose(p) && canPromise && !c.nextDate && !aizuchi && r.chance(Math.min(0.8, Math.max(0.03, (c.interest - 35) / 50)))) return 'invite_them';
    if (typeof c.flags.reach === 'number' && c.flags.reach >= 2 && c.meetings === 0 && ex >= 3 && enoughTalk(c) && inviteReady(state, c, npc) && !c.nextDate && !aizuchi && r.chance(TUNE_FUNNEL.promiseInviteThem)) return 'invite_them';
    if (state.gender === 'M' && ex >= 2 && isNormalPurpose(p) && canPromise && c.interest >= 65 && !c.nextDate && !aizuchi && r.chance(0.35)) return 'invite_them';
    // トークの途中で、相手から高級店を指定してくる（男性プレイヤー。メシ目・お金づかいの派手な相手。2026-11-09 指示）
    if (state.gender === 'M' && c.meetings === 0 && ex >= 2 && !c.nextDate && !c.flags.meshiRequested
      && ((p === 'profit' && !sneakyMeshi(state, npc)) || (isNormalPurpose(p) && npc.traits.moneySense === 'lavish' && canPromise))
      && r.chance(npc.nightWork === 'meshi' ? 1 : p === 'profit' ? 0.8 : 0.5)) return 'meshi_them';
    if (ex >= 2 && (p === 'body' || p === 'married' || p === 'profit') && !c.nextDate && r.chance(0.5)) return 'invite_them';
    if (!c.lineExchanged && !c.flags.lineThemAsked && ex >= 2) {
      const want = isNormalPurpose(p) ? (c.interest >= 65 ? TUNE_LINE.themPropose[state.gender === 'M' ? 'toMale' : 'toFemale'] : 0) : p === 'body' || p === 'bijin' ? 0.3 : 0;
      if (r.chance(want)) { c.flags.lineThemAsked = true; return 'line_them'; }
    }
    if (c.meetings > 0) return r.chance(Math.min(0.95, curtChance(state, c, npc))) ? 'chat_cool' : 'chat_normal';
    // 会う前：温度（魅力度の格差と対応タイプ。2026-11-11）で返信の形が決まる。一言・短い答えは「話を広げない返事」
    let level = levelOf(state, c, npc);
    // 男性プレイヤー：会話は続くが約束にならない相手は、相槌のような返事が多い（既存の TUNE_MALE_EMPTY）
    if (state.gender === 'M' && c.flags.reach === 1 && r.chance(TUNE_MALE_EMPTY.curtTalking * (1 - 0.6 * playerPopularity(state)))) level = Math.min(level, 2) as Level;
    // 会う前にやり取りが長引くと萎える（体験談：長く話すほどボロが出る）
    if (!c.nextDate && ex >= 14 && r.chance(Math.min(0.5, (ex - 13) * 0.05))) level = Math.min(level, 2) as Level;
    c.flags.replyLevel = level;
    return level <= 2 ? 'chat_cool' : 'chat_normal';
  });
  if (topic === 'chat_cool') c.flags.curtReplies = Number(c.flags.curtReplies ?? 0) + 1;
  if (topic === 'invite_them') c.flags.inviteTier = npc.purpose === 'profit' ? 'luxury' : npc.purpose === 'body' ? 'casual' : 'casual';
  if (topic === 'meshi_them') {
    // 「ここ行ってみたいんです」と高級店を指定。予約すると、当日はおごらされる
    c.flags.meshiRequested = true;
    c.flags.inviteTier = 'luxury';
    npc.traits = { ...npc.traits, payExpectation: 'treat' };
    npcSay(state, c, 'chat_normal', { text: withRng(state, (r) => r.pick(['そういえば、ずっと行ってみたいお店があるんです…！', 'ねえ、今度ここ連れて行ってほしいです🥺', '気になってるお店があって、誰かと行きたいなって思ってたんです'])), awaitMe: false });
    pushMeshiRequest(state, c);
    return;
  }
  if (topic === 'sakura_move') {
    npcSay(state, c, 'sakura_move', { text: 'ここ最近アプリの調子が悪くて…。よかったら、このサイトで話しませんか？写真も送れるので☺️' });
    return;
  }
  // 会う前のふつうの会話：話題カード方式の文を、温度で形を変えて1通1文・最大3通で返す（2026-11-11）
  if (c.meetings === 0 && (topic === 'chat_normal' || topic === 'chat_cool')) {
    const level = Number(c.flags.replyLevel ?? levelOf(state, c, npc)) as Level;
    // 見切り：一言が続いたら、会う約束まで進まない相手は既読のまま終わることがある（トーク仕様案 v0.2 §3.5）
    c.flags.oneWordStreak = level === 1 ? Number(c.flags.oneWordStreak ?? 0) + 1 : 0;
    const p = personaOf(state, c, npc);
    if (level === 1 && Number(c.flags.oneWordStreak) >= TUNE_TEMP.ghostStreak && tierOf(state, c, npc) <= 0 && (p.type === 'sync' || p.type === 'passive')
      && isNormalPurpose(npc.purpose) && typeof c.flags.reach === 'number' && c.flags.reach <= 1 && withRng(state, (r) => r.chance(TUNE_TEMP.ghostChance))) {
      for (const m of c.messages) if (m.from === 'me') m.read = true;
      fadeBeforeMeeting(state, c, noteE02);
      return;
    }
    npcSayMany(state, c, topic, npcChatByLevel(state, c, npc, level));
    return;
  }
  // 話題カード以外の話（誘い・勤務の話など）：こちらが質問していたら先に答えてから。その後はこちらから新しい話題を振る
  const prefix = c.meetings === 0 ? npcAnswerFirst(state, c, npc) : '';
  c.flags.convAct = '';
  c.flags.myAct = '';
  const before = c.messages.length;
  npcSay(state, c, topic);
  if (prefix) {
    // 先に質問への答えを置く。1回の返信は3通まで（答え1通＋本題の最後の2通）（2026-11-11）
    const added = c.messages.splice(before);
    const head = { ...added[0], text: splitSentences(prefix)[0] ?? prefix };
    c.messages.push(head, ...added.slice(-2));
  }
}

/**
 * 顔写真を公開する（開始14日経過後、一方向）。
 * 既にやり取り中で顔を知らない相手は、公開写真を初めて見た時点で一度だけ継続を判断する。
 * 離脱率は表から導出：d = 1 − (1 − 写真なし時のお断り率)/(1 − 公開後のお断り率)
 */
/** force：相手に顔写真を頼まれて載せるとき（14日たつ前でも載せられる。2026-11-18） */
export function publishPhoto(state: GameState, force = false): boolean {
  if (state.player.photoVisible || (!force && !canPublishPhoto(state))) return false;
  const ch = character(state);
  state.player.photoVisible = true;
  state.player.photoPublishedDay = state.day;
  addFeed(state, 'プロフィールに顔写真を載せた。', 'neutral');
  const hidden = ch.rates.postDateRejection;
  const pub = (ch.ratesPhotoPublic ?? ch.rates).postDateRejection;
  const d = Math.max(0, 1 - (1 - hidden) / (1 - pub));
  for (const c of Object.values(state.contacts)) {
    if (c.stage === 'ended' || c.stage === 'like_failed' || c.faceKnown) continue;
    c.faceKnown = true;
    c.faceKnownVia = 'photo';
    // まだマッチ前（反応待ち）の相手は、写真を見たうえで判断するだけ（送信成立の判定は送信時に確定済み）
    if (c.stage === 'like_sent') continue;
    const npc = state.npcs[c.npcId];
    if (!isNormalPurpose(npc.purpose)) { c.photoJudgement = 'pass'; continue; }
    const leave = withRng(state, (r) => r.chance(d));
    c.photoJudgement = leave ? 'left' : 'pass';
    if (leave) {
      state.stats.photoJudgeLeft += 1;
      if (c.stage === 'matched' && !c.twoWay) {
        endContact(state, c, { by: 'them', cause: '公開写真を見て離脱（外見の相性・内部判定）', visible: `${npc.name}とのトークが動かなくなった。` });
      } else {
        fadeBeforeMeeting(state, c, noteE02);
        c.endCause = '公開写真を見て離脱（外見の相性・内部判定）';
      }
    }
  }
  // 受信いいねの期待件数を公開後の表で引き直す
  const [lo, hi] = (ch.ratesPhotoPublic ?? ch.rates).receivedPer30;
  state.received.monthLambda = withRng(state, (r) => r.range(lo, hi)) * TUNE_RECEIVED_SCALE[state.gender];
  return true;
}

/**
 * 顔出しの提案（2026-11-10 指示）：顔写真なしで始めた人物が、写真を載せられる日になってもマッチがほとんどないとき、
 * アプリから「顔写真を載せませんか」というお知らせが届く。載せる顔のプレビュー付き。最大2回、21日以上あけて。
 */
export const TUNE_PHOTO_SUGGEST = { lookbackDays: 14, maxMatches: 2, maxTimes: 2, gapDays: 21 };

export function maybeSuggestFacePhoto(state: GameState, force = false): void {
  const face = PLAYER_FACE[state.characterId];
  if (!face || !canPublishPhoto(state)) return;
  if (!force) {
    if (state.flags.noPrivateEvents || state.pending.length > 0) return; // 開発用の再現ケースでは起こさない
    const times = Number(state.flags.photoSuggestTimes ?? 0);
    if (times >= TUNE_PHOTO_SUGGEST.maxTimes) return;
    if (state.day - Number(state.flags.photoSuggestDay ?? -999) < TUNE_PHOTO_SUGGEST.gapDays) return;
    if (recentMatches(state) > TUNE_PHOTO_SUGGEST.maxMatches) return;
  }
  state.flags.photoSuggestTimes = Number(state.flags.photoSuggestTimes ?? 0) + 1;
  state.flags.photoSuggestDay = state.day;
  const n = recentMatches(state);
  pushPending(state, {
    kind: 'photo_suggest', title: 'アプリからのお知らせ',
    lines: [
      { who: 'system', text: 'プロフィール写真のアドバイス：顔がわかる写真をメインに設定すると、お相手から見つけてもらいやすくなります。' },
      { who: 'narration', text: n === 0 ? `ここ${TUNE_PHOTO_SUGGEST.lookbackDays}日、新しいマッチは1件もない。` : `ここ${TUNE_PHOTO_SUGGEST.lookbackDays}日で、新しいマッチは${n}件だけだ。` },
      { who: 'narration', text: '顔を出せば、写真の段階で判断されるようになる。会ってから断られることは減るかもしれないが、今やり取りしている相手も写真を見て続けるかを決める。' },
    ],
    image: { file: face, caption: '載せる写真（プロフィールに載せると元に戻せない）', label: 'あなたの顔写真' },
    // 元に戻せない操作なので、載せない方を先に置く（先頭を選ぶ自動処理でも勝手に公開しない）
    choices: [
      { id: 'keep', label: '今は載せない' },
      { id: 'publish', label: '顔写真を載せる', sub: '公開すると元に戻せない' },
    ],
  });
}

function recentMatches(state: GameState): number {
  const from = state.day - TUNE_PHOTO_SUGGEST.lookbackDays;
  return Object.values(state.contacts).filter((c) => c.matchedDay !== undefined && c.matchedDay >= from).length;
}

export function resolvePhotoSuggest(state: GameState, choiceId: string): void {
  if (choiceId === 'publish') publishPhoto(state);
  else addFeed(state, '顔写真は載せずに続けることにした。', 'neutral');
}
