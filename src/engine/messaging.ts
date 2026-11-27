// 相手の発言・返信予定の共通処理。
import { Rng } from './rng';
import { attentiveness, playerPopularity } from './appeal';
import { CHAT, fill } from './data/dialogue';
import { TUNE_FUNNEL, TUNE_MALE_EMPTY, TUNE_REPLY } from './data/rules';
import { pushMsg } from './contact';
import { character, withRng } from './state';
import { delayByLevel, type Level } from './talkTemp';
import { cringeGag, cringeGreeting, cringify } from './cringe';
import type { Contact, GameState, Npc } from './types';

export function vars(state: GameState, npc: Npc): Record<string, string> {
  return { name: npc.name, me: character(state).name, h: npc.hobbies[0], h2: npc.hobbies[1] ?? npc.hobbies[0] };
}

export function sayLines(state: GameState, npc: Npc, pool: { toMale: string[]; toFemale: string[] }, rng: Rng): string {
  const lines = state.gender === 'M' ? pool.toMale : pool.toFemale;
  return fill(rng.pick(lines), vars(state, npc));
}

/** 相手がトークに書き込む。プレイヤーの返事待ちにするかを指定 */
export function npcSay(state: GameState, c: Contact, topicKey: string, opts: { awaitMe?: boolean; text?: string } = {}): void {
  const npc = state.npcs[c.npcId];
  // 同じ相手が同じ台詞を繰り返さないよう、既に言った文は避けて選ぶ
  const said = new Set(c.messages.filter((m) => m.from === 'them').map((m) => m.text));
  // 一度会った相手には「会った後」の台詞を使う（会ったのに「一度会ってみたい」と言わないように）
  const pool = (c.meetings > 0 && CHAT[`${topicKey}_met`]) || CHAT[topicKey] || CHAT.chat_normal;
  const text = opts.text ?? withRng(state, (rng) => {
    let t = sayLines(state, npc, pool, rng);
    for (let i = 0; i < 6 && said.has(t); i++) t = sayLines(state, npc, pool, rng);
    return t;
  });
  // 直前の自分のメッセージは既読になる
  for (const m of c.messages) if (m.from === 'me') m.read = true;
  if (npc?.cringe) {
    // ウケ狙いの痛い人（2026-11-27）：最初はダジャレの挨拶、「！」は「‼️」、ときどき自分でボケる。別の乱数列で、会話の流れはずらさない
    const r = Rng.fromSeed(state.seed, 'cringe-say', c.npcId, c.messages.length);
    const first = !c.messages.some((m) => m.from === 'them');
    const gag = opts.awaitMe !== false ? cringeGag(c, npc, r) : undefined;
    if (first) pushMsg(c, state.day, 'them', cringeGreeting(state.clock ?? 20 * 60, r));
    pushMsg(c, state.day, 'them', cringify(text, r));
    for (const g of gag ?? []) pushMsg(c, state.day, 'them', g);
  } else {
    pushMsg(c, state.day, 'them', text);
  }
  state.week.repliesReceived = (state.week.repliesReceived ?? 0) + 1;
  if (opts.awaitMe !== false) {
    c.awaitingMe = true;
    c.topic = topicKey;
    c.flags.awaitSince = state.day;
  }
}

/** 相手が何通かに分けて書き込む（1通1文・最大3通。2026-11-11）。返事待ちにするのは最後の1通 */
export function npcSayMany(state: GameState, c: Contact, topicKey: string, texts: string[], opts: { awaitMe?: boolean } = {}): void {
  const list = texts.filter((t) => t.trim()).slice(0, 3);
  if (list.length === 0) return;
  list.forEach((text, i) => npcSay(state, c, topicKey, { text, awaitMe: i === list.length - 1 ? opts.awaitMe : false }));
  if (list.length > 1) state.week.repliesReceived = Math.max(0, (state.week.repliesReceived ?? 0) - (list.length - 1)); // 返信は1回として数える
}

export function replyDelay(npc: Npc, rng: Rng): number {
  switch (npc.traits.contactPref) {
    case 'high': return rng.int(1, 2);
    case 'mid': return rng.int(1, 3);
    default: return rng.int(2, 4);
  }
}

/** 相手が次に返信するかどうかを事前に決めておく（返信待ち・既読の体験を作る） */
export function scheduleReply(state: GameState, c: Contact, kind: string, chance: number): void {
  const npc = state.npcs[c.npcId];
  withRng(state, (rng) => {
    // 会話にならない相手（reach 0）は、1回返したらそれきり。会話が続く相手（reach 1以上）は会うまではほぼ返してくれる
    const reach = typeof c.flags.reach === 'number' && c.meetings === 0 ? c.flags.reach : undefined;
    const p = reach === undefined || reach < 1 ? chance : c.exchanges < 4 ? 1 : Math.max(chance, TUNE_FUNNEL.talkingReply);
    // 会う気のない相手は、「予定が合わない」でかわした後は返信しない（2026-11-14 指示）
    const dodged = !!c.flags.deflected && reach !== undefined && reach < 2;
    const willReply = !dodged && rng.chance(p) && !(reach === 0 && (c.exchanges >= 1 || c.flags.silent));
    // 男性プレイヤーへの会う前の返信は遅れがち（数日あく）
    // 格上のこちらには返信が早い（親身さの分だけ遅れを減らす）
    const extra = state.gender === 'M' && c.meetings === 0 ? Math.round(TUNE_MALE_EMPTY.extraDelay * (1 - Math.max(attentiveness(state, npc), 0.7 * playerPopularity(state)))) : 0;
    // 会う前は、温度が高いほど返信が早い（2026-11-11）。乗り気以上は遅れを足さない
    const level = c.meetings === 0 && typeof c.flags.level === 'number' ? (c.flags.level as Level) : undefined;
    const delay = level !== undefined
      ? delayByLevel(level, rng) + (level <= 3 && extra > 0 ? rng.int(0, extra) : 0)
      : replyDelay(npc, rng) + (extra > 0 ? rng.int(0, extra) : 0);
    if (state.clock === undefined) {
      c.pendingReply = { day: state.day + delay, kind, willReply, expireDay: state.day + Math.max(7, delay) };
      return;
    }
    // 時刻つき（2026-11-14 壁打ちの指摘）：送った時刻から、温度に応じた時間のあとに届く。相手の睡眠（0〜7時）には届かない
    const range = level !== undefined ? REPLY_MINUTES_BY_LEVEL[level] : REPLY_MINUTES_BY_PREF[npc.traits.contactPref] ?? REPLY_MINUTES_BY_PREF.low;
    let mins = rng.int(range[0], range[1]) + (extra > 0 && (level === undefined || level <= 3) ? rng.int(0, extra) * 1440 : 0);
    let due = state.day * 1440 + (state.clock ?? 0) + mins;
    if (due % 1440 < 7 * 60) { due = Math.floor(due / 1440) * 1440 + 7 * 60 + rng.int(0, 90); mins = due - state.day * 1440 - (state.clock ?? 0); }
    const dDay = Math.floor(due / 1440);
    c.pendingReply = { day: dDay, minute: due % 1440, kind, willReply, expireDay: state.day + Math.max(7, dDay - state.day) };
    void mins;
  });
  c.awaitingMe = false;
}

/** 返信までの時間（分）。会う前は温度（L1〜L5）、会った後は相手の連絡の頻度で決める（2026-11-14） */
export const REPLY_MINUTES_BY_LEVEL: Record<number, [number, number]> = { 5: [5, 30], 4: [30, 120], 3: [120, 480], 2: [480, 1440], 1: [1440, 4320] };
export const REPLY_MINUTES_BY_PREF: Record<string, [number, number]> = { high: [10, 120], mid: [60, 480], low: [360, 1800] };

/** 通常の会話で相手が返信する確率。恋愛目的の相手は興味次第で、男性プレイヤーへの返信ほど低い */
export function replyChance(state: GameState, c: Contact, npc: Npc): number {
  switch (npc.purpose) {
    case 'business':
    case 'scam':
    case 'sakura':
    case 'bijin':
      return 0.95;
    case 'body':
      return c.interest >= 35 ? 0.93 : 0.25;
    case 'profit':
      return c.interest >= 40 ? 0.9 : 0.25;
    case 'married':
      return Math.min(0.9, Math.max(0.2, (c.interest - 5) / 55));
    default: {
      const offset = state.gender === 'M' ? TUNE_REPLY.offsetToMale : TUNE_REPLY.offsetToFemale;
      const base = (c.interest - offset) / 55;
      const ambiguous = npc.purpose === 'ambiguous' ? 0.9 : 1;
      return Math.min(TUNE_REPLY.max, Math.max(TUNE_REPLY.min, base * ambiguous));
    }
  }
}

export function markActive(state: GameState, c: Contact): void {
  if (!c.twoWay) return;
  if (!state.week.activeConversationIds.includes(c.npcId)) state.week.activeConversationIds.push(c.npcId);
}
