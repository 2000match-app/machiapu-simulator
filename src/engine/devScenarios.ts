// 開発用：イベントE01〜E24の各分岐を短い操作で再現するケース。
// 確率分岐は devForce（1回で消費）で固定する。通常プレイの難易度評価とは別物。
import { applyAction, newGame } from './actions';
import { maybeSuggestFacePhoto } from './chat';
import { startRelationship } from './relationship';
import { subscribe } from './life';
import { createNpc, ensureContact, storeNpc } from './state';
import type { Contact, GameState, NpcTraits, Purpose } from './types';

/** 再現ケース用の開始：男性は最初から有料会員にしておく（メッセージ送信の前提） */
export function devNewGame(id: string, seed: string): GameState {
  const s = newGame(id, seed);
  s.flags.noPrivateEvents = true;
  subscribe(s);
  return s;
}

export interface DevContactOptions {
  purpose: Purpose;
  stage: 'matched' | 'talking' | 'scheduled' | 'dating' | 'relationship';
  meetings?: number;
  exchanges?: number;
  lineExchanged?: boolean;
  traits?: Partial<NpcTraits>;
  topic?: string;
}

export function devAddContact(state: GameState, o: DevContactOptions): Contact {
  state.flags.noPrivateEvents = true; // 再現ケースではプライベートの出来事を起こさない
  const npc = createNpc(state, 'search');
  npc.purpose = o.purpose;
  npc.traits = { ...npc.traits, misrepresented: false, rudeness: 0.1, passive: false, requiresFace: false, ...o.traits };
  npc.distanceMin = Math.min(npc.distanceMin, 45);
  storeNpc(state, npc, false);
  // 写真素材の割り当て（加工写真・高級店の写真）で目的や偽装が変わることがあるので、指定どおりに戻す
  const stored = state.npcs[npc.id];
  stored.purpose = o.purpose;
  stored.filteredPhoto = false;
  stored.nightWork = undefined;
  stored.traits = { ...stored.traits, misrepresented: false, ...o.traits };
  const c = ensureContact(state, npc.id, false);
  c.matchedDay = state.day;
  c.stage = o.stage === 'relationship' ? 'dating' : o.stage;
  c.twoWay = o.stage !== 'matched';
  c.exchanges = o.exchanges ?? (o.stage === 'matched' ? 0 : 3);
  c.lineExchanged = !!o.lineExchanged;
  c.meetings = o.meetings ?? 0;
  c.interest = 70;
  if (o.topic) {
    c.awaitingMe = true;
    c.topic = o.topic;
    c.flags.awaitSince = state.day;
    c.messages.push({ day: state.day, from: 'them', text: '（再現用のメッセージ）' });
  }
  if (o.stage === 'scheduled') {
    c.nextDate = { day: state.day + 1, tier: 'casual', proposedBy: 'me' };
    // 再現ケースでは当日ドタキャン（ランダム）を起こさない。起こすケースは '1' で上書きする
    state.flags[`dev:daycancel:${npc.id}`] = '0';
    state.flags[`dev:overtime:${npc.id}`] = '0'; // 平日の急な残業も起こさない
  }
  if (o.meetings && o.meetings > 0) {
    c.faceKnown = true;
    c.faceKnownVia = 'meeting';
    c.flags.firstDateResolved = true;
    c.postDateDecision = 'continue';
  }
  if (o.stage === 'relationship') startRelationship(state, c);
  return c;
}

/** 現在の場面をすべて、指定した選択（なければ先頭）で解決する */
export function resolveAll(state: GameState, prefer: Record<string, string> = {}, limit = 40): string[] {
  const seen: string[] = [];
  for (let i = 0; i < limit && state.pending.length > 0; i++) {
    const ev = state.pending[0];
    seen.push(ev.kind);
    const choice = prefer[ev.kind] && ev.choices.some((c) => c.id === prefer[ev.kind]) ? prefer[ev.kind] : ev.choices[0].id;
    applyAction(state, { type: 'resolve', uid: ev.uid, choiceId: choice });
  }
  return seen;
}

export function advanceDays(state: GameState, days: number, prefer: Record<string, string> = {}): void {
  const target = state.day + days;
  let guard = 0;
  while (state.day < target && state.status === 'playing' && guard++ < 200) {
    resolveAll(state, prefer);
    applyAction(state, { type: 'advance' });
  }
  resolveAll(state, prefer);
}

/** 検索結果からまだいいねしていない相手を1人選ぶ（足りなければ続きを読み込む） */
export function nextCandidate(s: GameState): string {
  let id = s.search.results.find((x) => !s.contacts[x]);
  if (!id) {
    applyAction(s, { type: 'searchMore', count: 12 });
    id = s.search.results.find((x) => !s.contacts[x]);
  }
  return id!;
}

export interface DevScenario {
  id: string;
  label: string;
  run: () => GameState;
}

function scheduledDate(characterId: string, purpose: Purpose, seed: string, setup?: (s: GameState, c: Contact) => void, prefer: Record<string, string> = {}, extraDays = 10): GameState {
  const s = newGame(characterId, seed);
  const c = devAddContact(s, { purpose, stage: 'scheduled' });
  setup?.(s, c);
  advanceDays(s, extraDays, prefer);
  return s;
}

export const DEV_SCENARIOS: DevScenario[] = [
  {
    id: 'E01-M', label: 'E01 男性：送信20件以上が全て不成立（週−8）',
    run: () => {
      const s = devNewGame('M05', 'dev-e01');
      applyAction(s, { type: 'search' });
      let n = 0;
      while (n < 25) {
        const id = nextCandidate(s);
        applyAction(s, { type: 'like', npcId: id });
        const c = s.contacts[id];
        if (c) { c.likeWillMatch = false; c.likeResolveDay = 7; }
        n++;
        // いいねは1日5回まで：使い切ったら次の日に送る（結果はまとめて7日目に確定）
        if (s.likesLeft === 0) applyAction(s, { type: 'advanceDay' });
      }
      advanceDays(s, 14);
      return s;
    },
  },
  {
    id: 'E01-F', label: 'E01 女性：同条件で週−4',
    run: () => {
      const s = devNewGame('F06', 'dev-e01f');
      let n = 0;
      while (n < 22) {
        const id = nextCandidate(s);
        applyAction(s, { type: 'like', npcId: id });
        const c = s.contacts[id];
        if (c) { c.likeWillMatch = false; c.likeResolveDay = 7; }
        n++;
        // いいねは1日5回まで：使い切ったら次の日に送る（結果はまとめて7日目に確定）
        if (s.likesLeft === 0) applyAction(s, { type: 'advanceDay' });
      }
      advanceDays(s, 14);
      return s;
    },
  },
  {
    id: 'E02', label: 'E02 マッチ後に未返信（−3）',
    run: () => {
      const s = devNewGame('M05', 'dev-e02');
      const c = devAddContact(s, { purpose: 'sincere', stage: 'matched' });
      applyAction(s, { type: 'firstMessage', npcId: c.npcId, optionId: 'good' });
      c.pendingReply = { ...c.pendingReply!, willReply: false };
      advanceDays(s, 14);
      return s;
    },
  },
  {
    id: 'E03', label: 'E03 デート後の既読無視（−10）',
    run: () => scheduledDate('M05', 'sincere', 'dev-e03', (s, c) => {
      s.flags[`dev:decision:${c.npcId}`] = 'reject';
      s.flags[`dev:delivery:${c.npcId}`] = 'E03';
      s.flags[`dev:noshow:${c.npcId}`] = '0';
    }, { date_end: 'more' }),
  },
  {
    id: 'E04', label: 'E04 対面後に連絡不能（−15）',
    run: () => scheduledDate('M08', 'sincere', 'dev-e04', (s, c) => {
      s.flags[`dev:decision:${c.npcId}`] = 'reject';
      s.flags[`dev:delivery:${c.npcId}`] = 'E04';
      s.flags[`dev:noshow:${c.npcId}`] = '0';
    }, { date_end: 'more' }),
  },
  {
    id: 'E05-notice', label: 'E05 当日の朝にキャンセルの連絡（連絡あり）',
    run: () => scheduledDate('F03', 'ambiguous', 'dev-e05n', (s, c) => { s.flags[`dev:daycancel:${c.npcId}`] = '1'; }),
  },
  {
    id: 'E05', label: 'E05 無言キャンセル・待ちぼうけ',
    run: () => scheduledDate('M05', 'ambiguous', 'dev-e05', (s, c) => { s.flags[`dev:noshow:${c.npcId}`] = '1'; }, { date_noshow: 'wait' }),
  },
  {
    id: 'E06', label: 'E06 写真・年齢・職業の重大な偽装（−12）',
    run: () => scheduledDate('F03', 'body', 'dev-e06', (s, c) => {
      s.npcs[c.npcId].traits.misrepresented = true;
      s.flags[`dev:noshow:${c.npcId}`] = '0';
    }, { date_e06: 'end' }),
  },
  {
    id: 'E07', label: 'E07 容姿・年収を値踏みされる（−12）',
    run: () => scheduledDate('M07', 'sincere', 'dev-e07', (s, c) => {
      s.flags[`dev:rude:${c.npcId}`] = '1';
      s.flags[`dev:noshow:${c.npcId}`] = '0';
    }, { date_e07: 'leave', date_end: 'more' }),
  },
  {
    id: 'E08', label: 'E08 メシ目（高額店→支払い後に連絡不能、−18）',
    run: () => {
      const s = devNewGame('M05', 'dev-e08');
      const c = devAddContact(s, { purpose: 'profit', stage: 'talking', topic: 'chat_normal', exchanges: 3 });
      s.flags[`dev:noshow:${c.npcId}`] = '0';
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'invite_casual' });
      advanceDays(s, 21, { meshi_request: 'go', date_pay: 'all', date_end: 'more', date_talk: 'listen' });
      return s;
    },
  },
  {
    id: 'E09', label: 'E09 ヤリ捨て（親密になった後に切られる、−35）',
    run: () => {
      const s = devNewGame('F02', 'dev-e09');
      const c = devAddContact(s, { purpose: 'body', stage: 'scheduled' });
      s.flags[`dev:noshow:${c.npcId}`] = '0';
      advanceDays(s, 20, { night_invite: 'go', date_end: 'more', date_pay: 'treated' });
      return s;
    },
  },
  {
    id: 'E10', label: 'E10 美人局・恐喝（−45、特殊損失）',
    run: () => scheduledDate('M02', 'bijin', 'dev-e10', undefined, { date_e10: 'help' }),
  },
  {
    id: 'E11-early', label: 'E11 業者：会う前に断る（−3）',
    run: () => {
      const s = devNewGame('M04', 'dev-e11a');
      const c = devAddContact(s, { purpose: 'business', stage: 'talking', topic: 'business_pitch_hint' });
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'decline' });
      return s;
    },
  },
  {
    id: 'E11-after', label: 'E11 業者：会ってから勧誘（−15）',
    run: () => scheduledDate('F03', 'business', 'dev-e11b', (s, c) => { s.flags[`dev:noshow:${c.npcId}`] = '0'; }, { date_e11: 'refuse' }),
  },
  {
    id: 'E12', label: 'E12 ロマンス詐欺：送金（−40、特殊損失）',
    run: () => {
      const s = devNewGame('F05', 'dev-e12');
      const c = devAddContact(s, { purpose: 'scam', stage: 'talking', topic: 'scam_love', exchanges: 3 });
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'warm' });
      advanceDays(s, 7, { scam_pitch: 'send' });
      return s;
    },
  },
  {
    id: 'E12-closed', label: 'E12 送金前に関係を閉じる（−8）',
    run: () => {
      const s = devNewGame('M06', 'dev-e12b');
      const c = devAddContact(s, { purpose: 'scam', stage: 'talking', topic: 'scam_love', exchanges: 3 });
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'warm' });
      advanceDays(s, 7, { scam_pitch: 'close' });
      return s;
    },
  },
  {
    id: 'E13', label: 'E13 サクラサイトへ移動→ポイントを払ってやり取り→発覚（−20、特殊損失）',
    run: () => {
      const s = devNewGame('M06', 'dev-e13');
      const c = devAddContact(s, { purpose: 'sakura', stage: 'talking', topic: 'sakura_move' });
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'move' });
      for (let i = 0; i < 6; i++) {
        advanceDays(s, 1);
        if (s.contacts[c.npcId].awaitingMe) applyAction(s, { type: 'reply', npcId: c.npcId, optionId: i % 2 === 0 ? 'site_meet' : 'site_photo' });
      }
      advanceDays(s, 35);
      return s;
    },
  },
  {
    id: 'E13-declined', label: 'E13 誘導段階で断る（−3）',
    run: () => {
      const s = devNewGame('M06', 'dev-e13b');
      const c = devAddContact(s, { purpose: 'sakura', stage: 'talking', topic: 'sakura_move' });
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'decline' });
      return s;
    },
  },
  {
    id: 'E14', label: 'E14 既婚発覚（3回会った後、−30＋深さ+5）',
    run: () => {
      const s = devNewGame('F09', 'dev-e14');
      const c = devAddContact(s, { purpose: 'married', stage: 'dating', meetings: 3 });
      s.flags[`dev:weekly:${c.npcId}`] = 'married';
      advanceDays(s, 7, { married_reveal: 'leave' });
      return s;
    },
  },
  {
    id: 'E15', label: 'E15 キープ状態が14日（−6）',
    run: () => {
      const s = devNewGame('F05', 'dev-e15');
      const c = devAddContact(s, { purpose: 'ambiguous', stage: 'dating', meetings: 2 });
      c.ambiguousSince = s.day - 30;
      s.flags[`dev:weekly:${c.npcId}`] = 'keep';
      advanceDays(s, 7, { e15: 'wait' });
      return s;
    },
  },
  {
    id: 'E16', label: 'E16 別の本命を選ばれる（−18）',
    run: () => {
      const s = devNewGame('F01', 'dev-e16');
      const c = devAddContact(s, { purpose: 'ambiguous', stage: 'dating', meetings: 2 });
      s.flags[`dev:weekly:${c.npcId}`] = 'e16';
      advanceDays(s, 7);
      return s;
    },
  },
  {
    id: 'E17', label: 'E17 普通に相性が合わず断られる（−8）',
    run: () => scheduledDate('F03', 'sincere', 'dev-e17', (s, c) => {
      s.flags[`dev:decision:${c.npcId}`] = 'reject';
      s.flags[`dev:delivery:${c.npcId}`] = 'E17';
      s.flags[`dev:noshow:${c.npcId}`] = '0';
    }, { date_end: 'more' }),
  },
  {
    id: 'E18', label: 'E18 誘い・会計・調整を任される（2週間ごと−6）',
    run: () => {
      const s = devNewGame('M04', 'dev-e18');
      devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
      s.flags['dev:relweekly'] = 'e18';
      advanceDays(s, 14, { e18: 'talk', rel_week: 'call', rel_phase: 'agree' });
      return s;
    },
  },
  {
    id: 'E19', label: 'E19 子どもの事情を軽視される（−12）',
    run: () => {
      const s = devNewGame('M09', 'dev-e19');
      devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3, traits: { acceptsConstraints: false } });
      s.flags['dev:relweekly'] = 'e19';
      advanceDays(s, 14, { e19: 'discuss', rel_week: 'call', rel_phase: 'agree' });
      return s;
    },
  },
  {
    id: 'E20', label: 'E20 活動中の会話が6人以上（−4）',
    run: () => {
      const s = devNewGame('F02', 'dev-e20');
      // 7人：返信の流れは乱数で変わるので、1人が途中で止まっても6人以上が残るように（2026-11-11）
      for (let i = 0; i < 7; i++) {
        const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
        applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'empathize' });
      }
      advanceDays(s, 7);
      return s;
    },
  },
  {
    id: 'E21', label: 'E21 交際中も相手がアプリで探索（−15）',
    run: () => {
      const s = devNewGame('F01', 'dev-e21');
      devAddContact(s, { purpose: 'ambiguous', stage: 'relationship', meetings: 3 });
      s.flags['dev:relweekly'] = 'e21';
      advanceDays(s, 14, { e21: 'reconfirm', rel_week: 'meet', rel_phase: 'agree' });
      return s;
    },
  },
  {
    id: 'E22', label: 'E22 生活・金銭感覚の衝突（未解消の週−5）',
    run: () => {
      const s = devNewGame('M04', 'dev-e22');
      devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3, traits: { moneySense: 'lavish' } });
      s.flags['dev:relweekly'] = 'e22';
      advanceDays(s, 14, { e22: 'postpone', rel_week: 'cheap', rel_phase: 'agree' });
      return s;
    },
  },
  {
    id: 'E23', label: 'E23 交際89日目までの破局（−25）',
    run: () => {
      const s = devNewGame('F03', 'dev-e23');
      const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
      advanceDays(s, 10, { rel_phase: 'agree', rel_week: 'meet' });
      applyAction(s, { type: 'endContact', npcId: c.npcId });
      return s;
    },
  },
  {
    id: 'E24', label: 'E24 一致した相手との進展→交際（損失なし）',
    run: () => {
      const s = devNewGame('M05', 'dev-e24');
      const c = devAddContact(s, { purpose: 'sincere', stage: 'dating', meetings: 2, topic: 'after_date_good' });
      c.interest = 80;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'propose' });
      advanceDays(s, 7, { rel_phase: 'agree', rel_week: 'meet', rel_others: 'close' });
      return s;
    },
  },
  // 顔出しの場面（2026-11-10 顔かくしの素材）。場面が出たところで止める
  {
    id: 'FACE-hidden', label: '顔出し：顔写真なしの相手と初デート（本当の顔が分かる）',
    run: () => faceDate('dev-face-hidden', (n) => { n.profilePhotoVisible = false; n.photo = 's37.jpg'; }),
  },
  {
    id: 'FACE-filtered', label: '顔出し：加工の強い写真の相手と初デート',
    run: () => faceDate('dev-face-filtered', (n) => { n.filteredPhoto = true; }),
  },
  {
    id: 'FACE-suggest', label: '顔出し：マッチしないので顔写真を載せるか提案される（悠斗）',
    run: () => {
      const s = devNewGame('M05', 'dev-face-suggest');
      advanceDays(s, 14);
      maybeSuggestFacePhoto(s, true);
      return s;
    },
  },
  {
    id: 'FACE-ask', label: '顔出し：トークで顔写真を頼まれる（悠斗。「プロフィールに顔写真を載せる」を選ぶと顔がトークに出る）',
    run: () => {
      const s = devNewGame('M05', 'dev-face-ask');
      advanceDays(s, 14);
      devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'photo_ask' });
      return s;
    },
  },
];

/** 男性（大輔）で、翌日に初デートの約束がある相手を作り、デートの場面が出たところで止める */
function faceDate(seed: string, setup: (npc: GameState['npcs'][string]) => void): GameState {
  const s = devNewGame('M07', seed);
  const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
  setup(s.npcs[c.npcId]);
  s.flags[`dev:noshow:${c.npcId}`] = '0';
  for (let i = 0; i < 5 && s.status === 'playing'; i++) {
    if (s.pending.some((p) => p.kind === 'date_talk' || p.kind === 'date_e06')) break;
    resolveAll(s);
    applyAction(s, { type: 'advance' });
  }
  return s;
}
