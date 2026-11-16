// 関係の終了と、目に見える状態（既読・返信なし）の扱い。
import { applyDepthBonus, seriesLoss } from './life';
import { addFeed, logEvent, pushPending } from './state';
import type { Channel, Contact, GameState } from './types';
import { splitSentences } from './textSplit';
import { PURPOSE_LABEL } from './data/rules';
import { eventVisibleName } from './data/events';

export interface EndOptions {
  by: 'me' | 'them';
  cause: string;
  eventId?: string;
  /** 系列の基準損失。差分だけが精算される */
  base?: number;
  /** 画面に出す文（真因を断定しない表現） */
  visible?: string;
  /** 結果画面の解説用に確定した内部事情 */
  revealed?: string;
  /** 関係の深さによる加算を行うか（損失のある終了のみ） */
  depth?: boolean;
}

export function endContact(state: GameState, c: Contact, opts: EndOptions): void {
  if (c.stage === 'ended') return;
  const npc = state.npcs[c.npcId];
  if (opts.base && opts.base > 0 && opts.eventId) {
    // デートの後に「また会いたい」をどこまで本気で伝えたかで、振られたときの痛さが変わる（2026-11-14 指示。dates.ts の WISH_MULT）
    const wish = opts.by === 'them' && typeof c.flags.wishMult === 'number' ? c.flags.wishMult : 1;
    seriesLoss(state, c, opts.base * wish, opts.eventId, `${eventVisibleName(opts.eventId)}：${npc?.name ?? '相手'}`);
  }
  if (opts.depth !== false && opts.base && opts.base > 0) applyDepthBonus(state, c);
  if (opts.eventId) logEvent(state, opts.eventId, opts.cause, c.npcId);
  c.stage = 'ended';
  c.endedDay = state.day;
  c.endedBy = opts.by;
  c.endCause = opts.cause;
  c.awaitingMe = false;
  c.pendingReply = undefined;
  c.nextDate = undefined;
  c.revealed = opts.revealed ?? (npc ? PURPOSE_LABEL[npc.purpose] : undefined);
  if (state.partnerId === c.npcId) state.partnerId = undefined;
  if (opts.visible) {
    c.messages.push({ day: state.day, from: 'system', text: opts.visible, channel: channelOf(c) });
    addFeed(state, opts.visible, opts.by === 'them' ? 'bad' : 'neutral', c.npcId);
  }
  // この相手に関する未処理の場面を取り除く
  state.pending = state.pending.filter((p) => p.npcId !== c.npcId);
  // 一度でも会った相手から切られた時は、「振られた」ことをはっきり伝える場面を出す（2026-11-03 指示）
  if (opts.by === 'them' && c.meetings > 0 && npc && state.status === 'playing') {
    const lost = state.ledger.filter((e) => e.npcId === c.npcId && e.day === state.day && e.delta < 0).reduce((a, e) => a - e.delta, 0);
    pushPending(state, {
      kind: 'dumped', npcId: c.npcId, title: `${npc.name}さんに振られた`,
      lines: [
        { who: 'narration', text: opts.visible ?? `${npc.name}からの連絡が途絶えた。` },
        { who: 'narration', text: `${c.meetings}回会って、また会えると思っていた。けれど、${npc.name}との関係はここで終わった。` },
        { who: 'system', text: `変化：${npc.name}とのやり取りは終了${lost > 0 ? `／ライフ −${lost}` : ''}` },
      ],
      choices: [{ id: 'ok', label: '受け止める' }],
    });
  }
}

/**
 * 会う前に返信が止まった場合の終了。
 * LINE交換後なら E04（初期−6）、アプリ内なら E02 扱い（−3、週の浅い無反応に合算）。
 */
export function fadeBeforeMeeting(state: GameState, c: Contact, noteE02: (s: GameState, c: Contact) => void): void {
  const npc = state.npcs[c.npcId];
  if (c.lineExchanged) {
    endContact(state, c, {
      by: 'them', cause: '連絡先交換後に連絡が途絶えた', eventId: 'E04', base: 6,
      visible: `${npc.name}とのLINEに既読がつかなくなった。`,
    });
  } else {
    noteE02(state, c);
    endContact(state, c, {
      by: 'them', cause: '会話の途中で返信が止まった', eventId: 'E02',
      visible: `${npc.name}からの返信が止まったまま7日が過ぎた。`,
    });
  }
}

/** いまやり取りしている場所。外部サイトへ移ったら external、LINEを交換したら line */
export function channelOf(c: Contact): Channel {
  if (typeof c.flags.sakuraStart === 'number') return 'external';
  if (c.lineExchanged) return 'line';
  return 'app';
}

/** トークに書き込む。本人どうしのメッセージは1通1文・1回3通までに分ける（2026-11-11 ユーザー指示）。お知らせ（system）は分けない */
export function pushMsg(c: Contact, day: number, from: 'me' | 'them' | 'system', text: string): void {
  const parts = from === 'system' ? [text] : splitSentences(text);
  for (const t of parts.length > 0 ? parts : [text]) c.messages.push({ day, from, text: t, read: from === 'me' ? false : undefined, channel: channelOf(c) });
}
