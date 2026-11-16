// デートの場面と、交際前に会っている相手の処理（E03〜E11・E15〜E18・E24）。
import { Rng } from './rng';
import { lifestyleOf } from './data/lifestyles';
import { channelOf, endContact, fadeBeforeMeeting, pushMsg } from './contact';
import { applyLoss, noteE02, recoverOnce, seriesLoss, spend } from './life';
import { npcSay, sayLines, vars } from './messaging';
import { pushScamPitch, startRelationship } from './relationship';
import { CHAT, DATE_TALK, MESHI_STORES, NIGHT_INVITE, fill } from './data/dialogue';
import { FEMALE_PHOTOS, MALE_PHOTOS } from './data/npcPhotos';
import { revealFacePhoto } from './photos';
import {
  SPEC_FIRST_MUTUAL_DATE_RECOVERY, SPEC_LOSS, TUNE_DAY_CANCEL, TUNE_FUNNEL, TUNE_LINE, TUNE_NOSHOW, TUNE_PREP_YEN, TUNE_REJECT_DELIVERY, TUNE_VENUES, derivedPhotoLeaveRate,
  isNormalPurpose, tuneTransportYen,
} from './data/rules';
import { addFeed, character, devForce, logEvent, pushPending, withRng } from './state';
import { dateWithWeekday } from './calendar';
import { AREAS, getArea } from './data/areas';
import type { Choice, Contact, GameState, Impression, Npc, PendingEvent, VenueTier } from './types';

const WEEKEND = (day: number) => day % 7 === 5 || day % 7 === 6;

export function npcFirstPerson(state: GameState): string {
  return state.gender === 'M' ? '私' : '俺';
}

/** 在宅ワークの日か（麻衣・美咲。週ごとに平日から決まる）。この日にデートをすると化粧が必要でライフ −1 */
export function workFromHome(state: GameState, day: number): boolean {
  const n = character(state).homeWorkPerWeek;
  if (!n || WEEKEND(day)) return false;
  return Rng.fromSeed(state.seed, 'wfh', Math.floor(day / 7)).shuffle([0, 1, 2, 3, 4]).slice(0, n).includes(day % 7);
}

/** 土日のどちらかに入れておく予定（麻衣・美咲：ピラティス・友達とお出かけ）。その日は会えない */
export function weekendPlan(state: GameState, day: number): string | undefined {
  const plans = character(state).weekendPlans;
  if (!plans || !WEEKEND(day)) return undefined;
  const r = Rng.fromSeed(state.seed, 'weekend-plan', Math.floor(day / 7));
  return day % 7 === 5 + r.int(0, 1) ? r.pick(plans) : undefined;
}

/** プレイヤーがその日に会えるか（育児・シフト・多忙を反映。日ごとに決定的） */
export function playerFree(state: GameState, day: number): boolean {
  const ch = character(state);
  if (weekendPlan(state, day)) return false;
  const r = Rng.fromSeed(state.seed, 'free', day).next();
  const s = ch.freeSlotsPerMonth;
  const pWeekend = ch.weekendLimited ? (s * 0.1) / 8.6 : Math.min(0.95, (s * 0.7) / 8.6);
  const pWeekday = ch.weekendLimited ? (s * 0.9) / 21.4 : (s * 0.3) / 21.4;
  // 週に最低2日は会える日を確保する（2026-11-09 指示）
  if (guaranteedPlayerDays(state, Math.floor(day / 7)).includes(day)) return true;
  // 仕事が忙しい人（健人・悠斗・大輔）は、平日の夜に会えるのは週1日まで（2026-11-09）。平日休みの相手とは会いにくい
  if (ch.constraints.busy && !WEEKEND(day)) {
    const week = Math.floor(day / 7);
    const theDay = Rng.fromSeed(state.seed, 'busy-weekday', week).int(0, 4);
    return day % 7 === theDay && r < 0.6;
  }
  return r < (WEEKEND(day) ? pWeekend : pWeekday);
}

/** その週（月曜始まり）に必ず空けておく2日。忙しい人は平日の夜1日＋休日1日、平日休みの人は平日2日 */
function guaranteedPlayerDays(state: GameState, week: number): number[] {
  const ch = character(state);
  const base = week * 7;
  const r = Rng.fromSeed(state.seed, 'guar', week);
  if (ch.weekendLimited) {
    const a = r.int(0, 4);
    let b = r.int(0, 3);
    if (b >= a) b += 1;
    return [base + a, base + b];
  }
  const weekday = ch.constraints.busy ? Rng.fromSeed(state.seed, 'busy-weekday', week).int(0, 4) : r.int(0, 4);
  let weekend = base + 5 + r.int(0, 1);
  if (weekendPlan(state, weekend)) weekend = weekend % 7 === 5 ? weekend + 1 : weekend - 1; // 予定で埋めた日は避ける
  return [base + weekday, weekend];
}

/** 相手ごとに、その週のお互いに会える日を2日つくる（自分の空いている日から選ぶ） */
function guaranteedMutualDays(state: GameState, npc: Npc, week: number): number[] {
  const far = npc.distanceMin > 60;
  const cands: number[] = [];
  for (let d = week * 7; d < week * 7 + 7; d++) {
    if (far && !WEEKEND(d)) continue;
    if (npc.purpose === 'married' && WEEKEND(d)) continue;
    if (playerFree(state, d)) cands.push(d);
  }
  const r = Rng.fromSeed(state.seed, 'nguar', npc.id, week);
  for (let i = cands.length - 1; i > 0; i--) { const j = r.int(0, i); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  return cands.slice(0, 2);
}

/**
 * マチアプと関係ない予定（2026-11-07 指示）：会えない日の一部に、カレンダーに出す私用の予定を付ける。
 * シードと日付から決まる。平日は飲み会・残業など、休日は友人との外出・帰省など
 */
export function privateEventOn(state: GameState, day: number): string | undefined {
  const plan = weekendPlan(state, day);
  if (plan) return plan;
  if (playerFree(state, day)) return undefined;
  const ch = character(state);
  const r = Rng.fromSeed(state.seed, 'private-cal', day);
  const weekend = WEEKEND(day);
  if (ch.constraints.shiftWork && weekend && r.chance(0.5)) return 'シフト勤務';
  if (ch.constraints.childcare && r.chance(0.35)) return weekend ? '子どもの習い事' : '保育園の行事';
  // 人物の生活リズム（2026-11-13）：商社は会食・飲み会・ゴルフ、コンサルは残業など。なければ共通の候補
  const ls = lifestyleOf(ch.id);
  if (weekend) {
    if (ls.weekendPool) return r.chance(ls.weekendChance ?? 0.6) ? r.weighted(ls.weekendPool) : undefined;
    return r.chance(0.6) ? r.pick(['友人と外出', '実家に帰る', '友人の誕生日会', '美容院', '買い物', '大学の友人とランチ', '家の用事']) : undefined;
  }
  if (ls.weekdayPool && r.chance(ls.weekdayChance ?? 0.22)) return r.weighted(ls.weekdayPool);
  const generic = !ls.weekdayPool && r.chance(0.22) ? r.pick(['会社の飲み会', '残業', '同期と飲み', '歯医者', '取引先と会食', 'ジム']) : undefined;
  // 忙しい人の会えない平日の夜は、ほかに予定がなければ残業
  return generic ?? (ls.overtime ? '残業' : undefined);
}

export function npcFree(state: GameState, npc: Npc, day: number): boolean {
  return npcFreeBase(state, npc, day) || guaranteedMutualDays(state, npc, Math.floor(day / 7)).includes(day);
}

function npcFreeBase(state: GameState, npc: Npc, day: number): boolean {
  const r = Rng.fromSeed(state.seed, 'nfree', npc.id, day).next();
  if (npc.purpose === 'married') return !WEEKEND(day) && r < 0.6;
  if (npc.traits.weekendFree) return WEEKEND(day) ? r < 0.9 : r < 0.25;
  return WEEKEND(day) ? r < 0.15 : r < 0.7;
}

export function findDateDay(state: GameState, npc: Npc, from: number): number | null {
  return findDateDays(state, npc, from, 1)[0] ?? null;
}

/** お互いに空いている日（近い順に最大 n 日） */
export function findDateDays(state: GameState, npc: Npc, from: number, n: number): number[] {
  const out: number[] = [];
  const taken = new Set(Object.values(state.contacts).map((c) => c.nextDate?.day).filter((d): d is number => d !== undefined));
  // 住まいが遠い相手（片道60分超）は、移動の時間が取れる休日にしか会えず、予定が先になる（2026-11-03 指示）
  const far = npc.distanceMin > 60;
  for (let d = from + (far ? 4 : 2); d <= from + 21; d++) {
    if (taken.has(d)) continue;
    if (state.restingUntil !== undefined && d <= state.restingUntil) continue;
    if (far && !WEEKEND(d)) continue;
    if (playerFree(state, d) && npcFree(state, npc, d)) {
      out.push(d);
      if (out.length >= n) break;
    }
  }
  return out;
}

const WEEKDAY = ['月', '火', '水', '木', '金', '土', '日'];

export function scheduleDate(state: GameState, c: Contact, tier: VenueTier, by: 'me' | 'them'): boolean {
  const npc = state.npcs[c.npcId];
  // 片道90分を超える相手とは、そもそも予定がまとまりにくい
  const tooFar = npc.distanceMin > 90 && withRng(state, (r) => r.chance(0.35));
  const day = tooFar ? null : findDateDay(state, npc, state.day);
  if (day === null) {
    c.flags.scheduleFails = ((c.flags.scheduleFails as number) ?? 0) + 1;
    c.interest -= 8;
    // 相手が出してきた候補日（自分は予定が入っている日）をカレンダーで見せる（2026-11-09 指示）
    const proposed: number[] = [];
    for (let d = state.day + 2; d <= state.day + 16 && proposed.length < 3; d++) {
      if ((npc.distanceMin > 60 && !WEEKEND(d)) || playerFree(state, d)) continue;
      if (npcFreeBase(state, npc, d)) proposed.push(d);
    }
    const coolLine = npc.distanceMin > 60 ? 'お互い家が遠いので、なかなか予定が合わないですね…また落ち着いたら連絡します' : 'なかなか予定が合わないですね…また落ち着いたら連絡します';
    if (proposed.length > 0) {
      // 2026-11-14 指示：1) 相手から候補日が届く → 2) カレンダーで確かめる（場面） → 3) 「その日は予定があって…」と返す → 4) 相手の返事（resolveNoMatch）
      npcSay(state, c, 'chat_normal', { text: `${proposed.map((d) => dateWithWeekday(d)).join('、')}なら空いてるんですけど、どうですか？`, awaitMe: false });
      pushPending(state, {
        kind: 'date_nomatch', npcId: c.npcId, title: '候補日が届いた',
        lines: [
          { who: 'them', text: `${proposed.map((d) => dateWithWeekday(d)).join('、')}なら空いてるんですけど、どうですか？` },
          { who: 'narration', text: 'カレンダーで、相手の候補日に自分の予定が入っていないか確かめる。' },
        ],
        choices: [{ id: 'ok', label: '「その日は予定があって…」と返す' }],
        data: { proposed: proposed.join(','), coolLine },
      });
      addFeed(state, `${npc.name}から候補日が届いたが、どの日も自分の予定と重なっていた。`, 'bad', c.npcId);
      return false;
    }
    npcSay(state, c, 'chat_cool', { text: coolLine, awaitMe: true });
    addFeed(state, `${npc.name}と日程が合わなかった。`, 'bad', c.npcId);
    return false;
  }
  c.nextDate = { day, tier, proposedBy: by };
  c.flags.scheduled = true; // 会う約束をしたことがある（集計用）
  c.stage = 'scheduled';
  // 日付を選ぶ（2026-11-06 指示）：自分から誘った時はカレンダーの空き日から選び、相手から誘われた時は相手が候補日を出す。
  // 選ぶまでは一番近い日が仮の予定（選ばなくても進む）
  const days = findDateDays(state, npc, state.day, by === 'them' ? 3 : 8);
  if (days.length > 1) {
    pushPending(state, {
      kind: 'date_pick', npcId: c.npcId, title: by === 'them' ? '候補日が届いた' : '日にちを決める',
      lines: by === 'them'
        ? [{ who: 'them', text: `${days.map((d) => dateWithWeekday(d)).join('、')}あたりはどうですか？` }]
        : [{ who: 'narration', text: `${npc.name}と${TUNE_VENUES[tier].label}に行くことになった。お互いに空いている日から選ぼう。` }],
      choices: days.map((d) => ({ id: String(d), label: dateWithWeekday(d), sub: `${d - state.day}日後` })),
    });
    return true;
  }
  confirmDateDay(state, c, day);
  return true;
}

/** 予定の日を確定してトークと出来事に残す */
function confirmDateDay(state: GameState, c: Contact, day: number): void {
  const npc = state.npcs[c.npcId];
  const tier = c.nextDate?.tier ?? 'cafe';
  if (c.nextDate) c.nextDate.day = day;
  pushMsg(c, state.day, 'system', `予定：${dateWithWeekday(day)}・${day - state.day}日後（${TUNE_VENUES[tier].label}）`);
  addFeed(state, `${npc.name}と${day - state.day}日後（${WEEKDAY[day % 7]}曜）に会う約束をした（${TUNE_VENUES[tier].label}）。`, 'good', c.npcId);
  // 在宅ワークの日に決めたら、化粧が必要なことを知らせる（2026-11-11 指示。ライフは当日に −1。女性だけ）
  if (state.gender === 'F' && workFromHome(state, day)) {
    pushPending(state, {
      kind: 'wfh_makeup', npcId: c.npcId, title: 'その日は在宅ワーク',
      lines: [
        { who: 'narration', text: `${dateWithWeekday(day)}は在宅ワークの日だ。一日すっぴんで過ごすつもりだったのに、デートのためだけに化粧をしないといけない。` },
        { who: 'system', text: '変化：デートの当日、化粧の手間でライフ −1' },
      ],
      choices: [{ id: 'ok', label: '仕方ない' }],
    });
  }
}

/** 候補日がどれも合わなかったと返す（2026-11-14）：こちらの返事のあと、相手の「なかなか合わないですね」 */
export function resolveNoMatch(state: GameState, c: Contact, ev: PendingEvent): void {
  pushMsg(c, state.day, 'me', 'すみません、その日はどれも予定が入っていて…');
  npcSay(state, c, 'chat_cool', { text: String(ev.data?.coolLine ?? 'なかなか予定が合わないですね…また落ち着いたら連絡します'), awaitMe: true });
}

export function resolveDatePick(state: GameState, c: Contact, choiceId: string): void {
  if (!c.nextDate || c.stage !== 'scheduled') return;
  const day = Number(choiceId);
  if (!Number.isFinite(day) || day <= state.day) return;
  confirmDateDay(state, c, day);
}

/** 高額店の指定（E08の前兆。普通の相手が言うこともある） */
export function pushMeshiRequest(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  // 高級店を指定してくる相手は、おごられるつもり（男性プレイヤーの相手）
  if (state.gender === 'M') npc.traits = { ...npc.traits, payExpectation: 'treat' };
  const store = withRng(state, (r) => r.pick(MESHI_STORES));
  c.flags.meshiStore = store.name;
  c.flags.meshiPrice = store.price;
  pushPending(state, {
    kind: 'meshi_request', npcId: c.npcId, title: `${npc.name}からのお店の指定`,
    lines: [
      { who: 'them', text: `行ってみたいお店があって…「${store.name}」なんだけど、どうかな？` },
      { who: 'narration', text: `コースは1人${store.price.toLocaleString()}円から。2人分なら月の予算の${Math.round((store.price * 2) / character(state).monthlyBudgetYen * 100)}%にあたる。` },
    ],
    choices: [
      { id: 'alt', label: '別の価格帯のお店を提案する' },
      { id: 'go', label: 'その店を予約する' },
      { id: 'decline', label: '今回は見送る' },
    ],
  });
}

export function resolveMeshiRequest(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'go') {
    c.flags.luxuryChosen = true;
    scheduleDate(state, c, 'luxury', 'me');
    return;
  }
  if (choiceId === 'decline') {
    endContact(state, c, { by: 'me', cause: '高額店の指定を受けて自分から見送った', visible: `${npc.name}との約束は見送った。` });
    return;
  }
  // 別の価格帯を提案
  if (npc.purpose === 'profit') {
    const accepts = withRng(state, (r) => r.chance(0.25));
    if (!accepts) {
      npcSay(state, c, 'chat_cool', { text: 'そっか〜、じゃあまた今度で！', awaitMe: false });
      c.warningSignDay ??= state.day;
      c.flags.fadeAfterAlt = state.day + 4;
      return;
    }
    c.flags.profitAltAccepted = true;
  }
  npcSay(state, c, 'chat_normal', { text: 'いいですね、そこにしましょう！', awaitMe: false });
  scheduleDate(state, c, 'casual', 'me');
}

function dateCost(c: Contact, tier: VenueTier, rng: Rng): number {
  if (tier === 'luxury' && typeof c.flags.meshiPrice === 'number') return c.flags.meshiPrice;
  const [lo, hi] = TUNE_VENUES[tier].perPerson;
  return Math.round(rng.range(lo, hi) / 100) * 100;
}

/** 「写真と違う」相手の実際の顔：同じくらいの年齢で、容姿レベルが1つ下の顔写真（まだ誰にも使っていないもの） */
export function actualFacePhoto(state: GameState, npc: Npc): string | undefined {
  if (!npc.photo) return undefined;
  const used = new Set(state.usedPhotos ?? []);
  const want = Math.max(1, npc.looks - (npc.filteredPhoto ? 2 : 1)); // 加工写真は2段階下
  const cands = (npc.gender === 'M' ? MALE_PHOTOS : FEMALE_PHOTOS).filter((t) => t.faceVisible && t.looks === want && t.file !== npc.photo && !used.has(t.id))
    .sort((a, b) => Math.abs(a.age - npc.age) - Math.abs(b.age - npc.age));
  const t = cands[0];
  if (!t) return undefined;
  (state.usedPhotos ??= []).push(t.id);
  return t.file;
}

/** デート当日：場面の開始 */
export function startDate(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  delete c.flags.wishMult; // 前回のデートの後に伝えた気持ちの強さは、次に会ったらリセット
  const date = c.nextDate!;
  const transport = tuneTransportYen(npc.distanceMin);
  // 対面前に相手が顔を知っていたか（写真公開で知った場合のみtrue）。対面時に容姿を二重評価しないための記録
  if (c.meetings === 0) c.flags.faceWasKnownBeforeDate = c.faceKnown;
  // 在宅ワークの日のデートは、化粧が必要になる（2026-11-11 指示：ライフ −1。女性だけ）
  if (state.gender === 'F' && workFromHome(state, date.day)) {
    applyLoss(state, 1, 'event', '在宅ワークの日にデート。わざわざ化粧をした');
    addFeed(state, '在宅ワークの日だったので、デートのためにわざわざ化粧をした。ライフ −1。', 'bad', c.npcId);
  }
  // 女性はデートの前にメイクをする（2026-11-12 指示：手間を感じさせる。3回押す）
  if (state.gender === 'F') pushMakeup(state, c, 1);
  // 男性はデートの場所を決める（2026-11-15 指示：女性の化粧と対になる手間。最寄り→中間→お店を3回押す）
  else pushVenue(state, c, 1);
  // ドタキャン・待ちぼうけ（E05）
  const fated = typeof c.flags.reach === 'number' && c.meetings === 0 && isNormalPurpose(npc.purpose);
  const noshowP = fated ? (c.flags.forceNoshow ? 1 : 0) : (TUNE_NOSHOW[npc.purpose] ?? 0) * (c.meetings === 0 ? 1 : 0.4) * (npc.filteredPhoto ? 2 : 1);
  const forced = devForce(state, `noshow:${c.npcId}`);
  const noshow = forced !== undefined ? forced === '1' : withRng(state, (r) => r.chance(noshowP));
  if (noshow && fated) { c.flags.forceNoshow = false; c.flags.reach = 1; }
  if (noshow) {
    pushPending(state, {
      kind: 'date_noshow', npcId: c.npcId, title: '待ち合わせ場所',
      lines: [
        { who: 'narration', text: `約束の時間を過ぎても${npc.name}は来ない。キャンセルの連絡もなく、送ったメッセージに既読がつかない。` },
        { who: 'narration', text: `${TUNE_VENUES[date.tier].label}の予約時間が近づいている。往復の交通費は${transport.toLocaleString()}円。` },
      ],
      choices: [
        { id: 'wait', label: 'もう1時間待つ' },
        { id: 'leave', label: '店に連絡して帰る' },
      ],
      data: { transport },
    });
    return;
  }
  const lines: PendingEvent['lines'] = [];
  const firstMeeting = c.meetings === 0;
  if (firstMeeting) {
    lines.push({ who: 'narration', text: `${TUNE_VENUES[date.tier].label}の前で${npc.name}と初めて顔を合わせた。` });
    if (!c.faceKnown) {
      lines.push({ who: 'narration', text: `プロフィールに顔写真を載せていないので、${npc.name}がこちらの顔を見るのは今日が初めてだ。` });
      lines.push({ who: 'narration', text: withRng(state, (r) => r.pick([
        `${npc.name}は一瞬こちらを確かめるように見てから、笑顔で会釈した。`,
        `「はじめまして」と言う${npc.name}の声は、メッセージの印象より少し落ち着いて聞こえた。`,
      ])) });
    }
  } else {
    lines.push({ who: 'narration', text: `${c.meetings + 1}回目のデート。${TUNE_VENUES[date.tier].label}で${npc.name}と待ち合わせた。` });
  }
  c.flags.dateTransport = transport;
  c.flags.rejMult = 1;
  if (firstMeeting && isNormalPurpose(npc.purpose)) {
    // 成功の流れ（体験談 2026-11-09）：初回は短めのカフェ・ランチの方が減点されにくい。会う前に電話で話していると、会ってもギャップが少ない
    if (date.tier === 'cafe' || date.tier === 'casual') c.flags.rejMult = 0.92;
    else if (date.tier === 'luxury' && !c.flags.meshiRequested) c.flags.rejMult = 1.05;
    const calls = Number(c.flags.callsBeforeMeet ?? 0);
    if (calls > 0) c.flags.rejMult = Number(c.flags.rejMult) * (calls >= 2 ? 0.75 : 0.85);
  }
  c.dateNotes = [firstMeeting ? `${TUNE_VENUES[date.tier].label}で初めて会った` : `${c.meetings + 1}回目のデート（${TUNE_VENUES[date.tier].label}）`];
  if (npc.distanceMin > 60) note(c, `住まいが遠く、往復の交通費は${transport.toLocaleString()}円。終電を気にして早めに切り上げた`);
  if (firstMeeting && !c.faceKnown) note(c, '相手がこちらの顔を見るのは今日が初めてだった');
  if (firstMeeting && Number(c.flags.callsBeforeMeet ?? 0) > 0 && isNormalPurpose(npc.purpose)) {
    lines.push({ who: 'narration', text: '電話で何度か話していたので、初めて会う気がしない。' });
    note(c, '会う前に電話で話していたので、緊張せずに話せた');
  }
  // 年収を盛っている相手：会うと話の端々で分かる（イベントにはしない）
  if (firstMeeting && npc.realIncomeYen && !npc.fakeTitle) {
    note(c, '年収はプロフィールより低そうだった');
    lines.push({ who: 'narration', text: '話の端々から、年収はプロフィールに書いてあるより低そうだと分かった。' });
  }
  if (firstMeeting && (npc.traits.misrepresented || npc.fakeTitle)) {
    if (npc.fakeTitle && !npc.traits.misrepresented) {
      // 医師・弁護士を偽っていた（写真は本人）
      note(c, `プロフィールでは${npc.job}だったが、本当は${npc.fakeTitle}だった`);
      lines.push({ who: 'narration', text: `プロフィールでは${npc.job}と書いてあったが、仕事の話がまったくかみ合わない。聞き返すと、本当は${npc.fakeTitle.replace(/（.*）/, '')}だった。` });
      pushPending(state, {
        kind: 'date_e06', npcId: c.npcId, title: '職業を偽っていた', lines,
        choices: [{ id: 'continue', label: 'このまま食事を続ける' }, { id: 'end', label: '理由を伝えて帰る' }],
      });
      return;
    }
    note(c, 'プロフィールの写真とは別人のようだった');
    lines.push({ who: 'narration', text: npc.fakeTitle
      ? `プロフィールの写真とは、明らかに別人のように見える。${npc.job}というのも嘘で、本当は${npc.fakeTitle.replace(/（.*）/, '')}だった。`
      : 'プロフィールの写真とは、明らかに別人のように見える。話を聞くと、年齢も職業も書いてあったものと違っていた。' });
    // 実際の顔：容姿レベルを1つ下げた写真を見せる（2026-11-07 指示）。加工写真の相手は顔かくしの素材から（2026-11-10）
    const actual = (npc.filteredPhoto ? revealFacePhoto(state, npc) : undefined) ?? actualFacePhoto(state, npc);
    if (actual) c.flags.actualPhoto = actual;
    pushPending(state, {
      kind: 'date_e06', npcId: c.npcId, title: '写真と違う', lines,
      ...(actual ? { image: { file: actual, caption: npc.filteredPhoto ? '実際に会った相手（加工写真とはまるで別人）' : npc.looks > 1 ? '実際に会った相手（プロフィールの写真より容姿レベルが1つ下）' : '実際に会った相手' } } : {}),
      choices: [{ id: 'continue', label: 'このまま食事を続ける' }, { id: 'end', label: '理由を伝えて帰る' }],
    });
    return;
  }
  // 顔を出していない相手・加工の強い写真の相手は、初めて会ったときに本当の顔が分かる（2026-11-10 顔かくしの素材）
  let image: PendingEvent['image'];
  if (firstMeeting && (!npc.profilePhotoVisible || npc.filteredPhoto)) {
    const face = revealFacePhoto(state, npc);
    if (face) {
      c.flags.actualPhoto = face;
      if (npc.filteredPhoto) {
        lines.push({ who: 'narration', text: `${npc.name}は、プロフィールの加工の強い写真とはずいぶん印象が違った。` });
        note(c, 'プロフィールの加工写真とは、ずいぶん印象が違った');
        image = { file: face, caption: '実際に会った相手（加工写真とはまるで別人）' };
      } else {
        lines.push({ who: 'narration', text: `プロフィールには顔の写った写真がなかった。${npc.name}は、こういう顔の人だった。` });
        note(c, '顔写真を載せていない相手の顔を、初めて見た');
        image = { file: face, caption: `初めて見た${npc.name}の顔（プロフィールに顔写真はなかった）` };
      }
    }
  }
  const touch = dateMoments(state, c, npc, lines, firstMeeting);
  pushTalk(state, c, npc, lines, image);
  if (touch) pushTouch(state, c, npc);
}

const MAKEUP_STEPS = ['下地とファンデーションを塗る', 'アイメイクをする', '髪を整えて、服を選ぶ'];

/** デート前のメイク（1〜3段目）。次の段は先頭に差し込み、デートの場面より前に出す */
function pushMakeup(state: GameState, c: Contact, step: number): void {
  const npc = state.npcs[c.npcId];
  const ev = pushPending(state, {
    kind: 'date_makeup', npcId: c.npcId, title: `デートの準備（${step}/${MAKEUP_STEPS.length}）`,
    lines: [{ who: 'narration', text: step === 1 ? `今日は${npc.name}と会う日。出かける前に、メイクをしないといけない。` : step === MAKEUP_STEPS.length ? 'あと少し。鏡の前で最後の仕上げ。' : '次はアイメイク。' }],
    choices: [{ id: 'next', label: MAKEUP_STEPS[step - 1] }],
    data: { step: String(step) },
  });
  if (step > 1) {
    state.pending = [ev, ...state.pending.filter((p) => p.uid !== ev.uid)];
  }
}

export function resolveMakeup(state: GameState, c: Contact, ev: PendingEvent): void {
  const step = Number(ev.data?.step ?? 1);
  if (step < MAKEUP_STEPS.length) pushMakeup(state, c, step + 1);
}

/** 男性のデート場所選び（2026-11-15）：お互いの最寄りを確認 → 中間の駅を確認 → お店を確認 */
const VENUE_STEPS = ['お互いの最寄り駅を確認する', '中間あたりの駅を確認する', 'お店を確認する'];
const SHOP_WORDS: Record<VenueTier, string[]> = {
  cafe: ['駅前のカフェ', '落ち着いた喫茶店', 'テラス席のあるカフェ'],
  casual: ['駅近のイタリアンバル', '雰囲気のいい居酒屋', '小さなビストロ'],
  dinner: ['少し良いイタリアン', 'コースのあるフレンチ', '個室のある和食'],
  luxury: ['ホテルのレストラン', '予約の取りにくいフレンチ', '眺めのいい鉄板焼き'],
};
function venuePlan(state: GameState, c: Contact): { mine: string; theirs: string; mid: string; shop: string } {
  const npc = state.npcs[c.npcId];
  const me = getArea(character(state).areaId);
  const them = getArea(npc.areaId);
  const mx = (me.x + them.x) / 2;
  const my = (me.y + them.y) / 2;
  const mid = AREAS.filter((a) => !a.remote).reduce((best, a) => ((a.x - mx) ** 2 + (a.y - my) ** 2 < (best.x - mx) ** 2 + (best.y - my) ** 2 ? a : best));
  const tier = c.nextDate?.tier ?? 'cafe';
  const shop = Rng.fromSeed(state.seed, 'venue', c.npcId, state.day).pick(SHOP_WORDS[tier] ?? SHOP_WORDS.cafe);
  return { mine: me.name, theirs: them.name, mid: mid.name, shop };
}
function pushVenue(state: GameState, c: Contact, step: number): void {
  const npc = state.npcs[c.npcId];
  const v = venuePlan(state, c);
  const text = step === 1 ? `今日は${npc.name}と会う日。どこで会うか、こちらで決めないといけない。`
    : step === 2 ? `${npc.name}は${v.theirs}、自分は${v.mine}。間を取るなら${v.mid}あたりか。`
      : `${v.mid}で、${TUNE_VENUES[c.nextDate?.tier ?? 'cafe'].label}に合うお店を探す。${v.shop}が良さそうだ。`;
  const ev = pushPending(state, {
    kind: 'date_venue', npcId: c.npcId, title: `デートの場所決め（${step}/${VENUE_STEPS.length}）`,
    lines: [{ who: 'narration', text }],
    choices: [{ id: 'next', label: VENUE_STEPS[step - 1] }],
    data: { step: String(step) },
  });
  if (step > 1) state.pending = [ev, ...state.pending.filter((p) => p.uid !== ev.uid)];
}
export function resolveVenue(state: GameState, c: Contact, ev: PendingEvent): void {
  const step = Number(ev.data?.step ?? 1);
  if (step < VENUE_STEPS.length) { pushVenue(state, c, step + 1); return; }
  const v = venuePlan(state, c);
  pushMsg(c, state.day, 'me', `今日は${v.mid}の${v.shop}にしようと思います！駅に着いたら連絡しますね。`);
}

/**
 * 選択では避けられない目的偽装（2026-11-13 指示）。相手ごとにシードで決まる。
 * - 断れないメシ目：メシ目（夜職を除く）の半分は高い店を指定せず、ふつうのデートでおごらせて消える
 * - 断れないヤリ捨て：ヤリ目の半分は、家に行くのを断っても「ちゃんと付き合おう」と言い、数日で切る
 */
export function sneakyMeshi(state: GameState, npc: Npc): boolean {
  return npc.purpose === 'profit' && !npc.nightWork && Rng.fromSeed(state.seed, 'sneaky-meshi', npc.id).chance(0.5);
}
export function sneakyBody(state: GameState, npc: Npc): boolean {
  return npc.purpose === 'body' && Rng.fromSeed(state.seed, 'sneaky-body', npc.id).chance(0.5);
}

/** 断れないヤリ捨て：その場で付き合おうと言い、3〜7日で切る（E09） */
function fakeCommit(state: GameState, c: Contact, npc: Npc, why: string): void {
  note(c, why);
  finalizeDate(state, c, 'good');
  c.nextDate = undefined;
  pushMsg(c, state.day, 'them', 'じゃあ、ちゃんと付き合おうよ');
  startRelationship(state, c);
  if (c.relationship) c.relationship.fakeResolveDay = state.day + Rng.fromSeed(state.seed, 'sneaky-body-day', npc.id).int(3, 7);
  c.warningSignDay ??= state.day;
}

/** デート中の相手の言い方（男女で少し変える） */
const exWord = (npc: Npc) => (npc.gender === 'M' ? '元カノ' : '元カレ');

/**
 * デート中に低い確率で起きる出来事（2026-11-12 指示）。場面の文とデートのメモに足す。
 * 遅刻・身長のサバ読み・歯・写真より良いと言われる・元恋人の話・話題が偏る男性。手を触ってくるは別の場面（戻り値 true）
 */
function dateMoments(state: GameState, c: Contact, npc: Npc, lines: PendingEvent['lines'], firstMeeting: boolean): boolean {
  const r = Rng.fromSeed(state.seed, 'date-moment', c.npcId, c.meetings);
  // 待ち合わせに5〜10分遅れてくる
  if (r.chance(0.08)) {
    const min = r.int(5, 10);
    lines.push({ who: 'narration', text: `${npc.name}は待ち合わせに${min}分遅れてきた。「ごめんなさい、電車が遅れてて…」` });
    note(c, `待ち合わせに${min}分遅れてきた`);
  }
  // 身長のサバ読み：会うと分かる（プロフィールの170〜172cmより低い）
  if (firstMeeting && npc.realHeightCm) {
    lines.push({ who: 'narration', text: `プロフィールでは${npc.heightCm}cmだったが、並んでみると${npc.realHeightCm}cmくらいに見える。` });
    note(c, `身長はプロフィール（${npc.heightCm}cm）より低く、${npc.realHeightCm}cmくらいだった`);
  }
  // 歯が汚い
  if (r.chance(0.05)) {
    lines.push({ who: 'narration', text: `笑ったときに見えた${npc.name}の歯が、正直あまりきれいではなかった。` });
    note(c, '歯があまりきれいではなかった');
  }
  // 写真よりかっこいい／かわいいと言われる（顔を見せたうえで会った時）
  if (firstMeeting && (state.player.photoVisible || c.faceKnown) && r.chance(0.12)) {
    lines.push({ who: 'them', text: state.gender === 'M' ? '写真よりかっこいいですね！' : '写真よりかわいいですね！' });
    note(c, `「写真より${state.gender === 'M' ? 'かっこいい' : 'かわいい'}」と言われた`);
    c.interest += 3;
  }
  // 元恋人の話をしてくる
  if (r.chance(0.08)) {
    lines.push({ who: 'narration', text: `${npc.name}は途中から${exWord(npc)}の話を始め、しばらく止まらなかった。` });
    note(c, `${exWord(npc)}の話を長々とされた`);
  }
  // 容姿1〜2の男性の一部は、風俗・パチンコ・アニメの話ばかり（相手ごとに決まる）
  if (npc.gender === 'M' && npc.looks <= 2 && Rng.fromSeed(state.seed, 'narrow-talk', npc.id).chance(0.3)) {
    lines.push({ who: 'narration', text: `${npc.name}の話は、風俗とパチンコとアニメの話ばかりだった。こちらの話にはあまり興味がなさそうだ。` });
    note(c, '風俗・パチンコ・アニメの話ばかりだった');
  }
  // 男性NPCが手を触ってくる（女性プレイヤー。ヤリ目は起きやすい）
  return npc.gender === 'M' && r.chance(npc.purpose === 'body' ? 0.35 : 0.06);
}

/** デート中に手を触ってくる場面 */
function pushTouch(state: GameState, c: Contact, npc: Npc): void {
  pushPending(state, {
    kind: 'date_touch', npcId: c.npcId, title: '手に触れてきた',
    lines: [{ who: 'narration', text: `話している途中で、${npc.name}がテーブルの上のこちらの手にそっと触れてきた。` }],
    choices: [{ id: 'pull', label: 'さりげなく手を引っ込める' }, { id: 'keep', label: 'そのままにしておく' }],
  });
}

export function resolveDateTouch(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'keep') {
    c.interest += npc.purpose === 'body' ? 8 : 3;
    if (npc.purpose === 'body') c.flags.eager = true;
    note(c, '手に触れられて、そのままにした');
  } else {
    if (npc.purpose === 'body') c.interest -= 5;
    note(c, '手に触れられて、さりげなく引っ込めた');
  }
}

function talkChoices(state: GameState, npc: Npc, c: Contact): Choice[] {
  const ch = character(state);
  const cs: Choice[] = [
    { id: 'listen', label: DATE_TALK.listen.label },
    { id: 'self', label: DATE_TALK.self.label },
    { id: 'interview', label: DATE_TALK.interview.label },
  ];
  if (ch.incomeYen <= 3_200_000 || ch.job.includes('非正規') || ch.job.includes('フリーター')) cs.push({ id: 'honest', label: DATE_TALK.honest.label });
  if (c.meetings >= 1) cs.splice(1, 0, { id: 'remember', label: DATE_TALK.remember.label }); // 成功の流れ：前回の話を覚えている
  if (ch.children > 0) cs.push({ id: 'kids', label: DATE_TALK.kids.label });
  void npc;
  return cs;
}

function pushTalk(state: GameState, c: Contact, npc: Npc, pre: PendingEvent['lines'], image?: PendingEvent['image']): void {
  const lines = [...pre];
  const topic = withRng(state, (r) => r.pick([
    `${npc.name}は最近ハマっている${npc.hobbies[0]}の話をしてくれた。`,
    `仕事の話になると、${npc.name}は少しだけ愚痴をこぼした。`,
    `${npc.hobbies[1] ?? npc.hobbies[0]}の話題で、思ったより盛り上がった。`,
  ]));
  lines.push({ who: 'narration', text: topic });
  note(c, topic);
  // デート中に見えるサイン（体験談 2026-11-09）
  const sign = withRng(state, (r) => {
    if (npc.purpose === 'body' && state.gender === 'F' && r.chance(0.6)) return r.pick([`テーブルの下で、${npc.name}の足が何度も当たってくる。`, `${npc.name}の視線が、さっきから顔より下に向いている気がする。`, `まだ2杯目なのに、${npc.name}は「この後どうする？」とばかり聞いてくる。`]);
    if (isNormalPurpose(npc.purpose) && c.interest < 45 && r.chance(0.5)) return r.pick([`${npc.name}は、テーブルの上のスマホをちらちら見ている。`, `${npc.name}の相槌が、だんだん短くなってきた。`]);
    if (r.chance(0.12)) return r.pick([`${npc.name}の元恋人の話が、なかなか終わらない。`, `${npc.name}の趣味の自慢話が、30分ほど続いた。`]);
    return '';
  });
  if (sign) { lines.push({ who: 'narration', text: sign }); note(c, sign); }
  pushPending(state, {
    kind: 'date_talk', npcId: c.npcId, title: `${npc.name}とのデート`,
    lines,
    ...(image ? { image } : {}),
    choices: talkChoices(state, npc, c),
  });
}

/**
 * 土日に急に仕事が入る（健人・大輔。2026-11-09）：週末のデートの日の朝に、職場から呼び出しが来ることがある
 */
export function maybeWorkCall(state: GameState, c: Contact): boolean {
  const ch = character(state);
  if (!c.nextDate) return false;
  const npc = state.npcs[c.npcId];
  // 平日の夜のデート：急な残業が入ることがある（2026-11-09 指示。忙しい人ほど多い）
  if (!WEEKEND(c.nextDate.day)) {
    const forced = devForce(state, `overtime:${c.npcId}`);
    if (forced !== undefined ? forced !== '1' : !withRng(state, (r) => r.chance(ch.constraints.busy ? 0.15 : 0.06))) return false;
    c.flags.workCallKind = 'overtime';
    pushPending(state, {
      kind: 'work_call', npcId: c.npcId, title: '夕方、急な残業',
      lines: [
        { who: 'narration', text: `${npc.name}と会う約束の日の夕方、上司から「悪いけど、今日中にこれをお願い」と急ぎの仕事を頼まれた。` },
        { who: 'system', text: '残業すればデートはキャンセル。断れば職場での立場が気になる。' },
      ],
      choices: [
        { id: 'work', label: '残業して、デートをキャンセルする', sub: '相手の気持ちは冷める' },
        { id: 'date', label: '仕事を切り上げてデートに行く', sub: '気まずさが残る' },
      ],
    });
    return true;
  }
  if (!ch.constraints.weekendWorkCalls) return false;
  if (!withRng(state, (r) => r.chance(0.18))) return false;
  c.flags.workCallKind = 'weekend';
  pushPending(state, {
    kind: 'work_call', npcId: c.npcId, title: '休日の朝、職場から電話',
    lines: [
      { who: 'narration', text: `${npc.name}と会う約束の日の朝、上司から電話が来た。「悪いけど、今日どうしても出てほしい」` },
      { who: 'system', text: '仕事に行けばデートはキャンセル。断れば職場での立場が気になる。' },
    ],
    choices: [
      { id: 'work', label: '仕事に行き、デートをキャンセルする', sub: '相手の気持ちは冷める' },
      { id: 'date', label: '仕事を断ってデートに行く', sub: '気まずさが残る' },
    ],
  });
  return true;
}

export function resolveWorkCall(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  const overtime = c.flags.workCallKind === 'overtime';
  if (choiceId === 'date') {
    applyLoss(state, 3, 'event', overtime ? '急な残業を断った気まずさ' : '休日出勤を断った気まずさ');
    startDate(state, c);
    return;
  }
  const tier = c.nextDate?.tier ?? 'cafe';
  c.dates.push({ day: state.day, tier, costYen: 0, outcome: 'canceled', notes: [overtime ? '急な残業で、こちらから約束をキャンセルした' : '休日出勤で、こちらから約束をキャンセルした'], impression: 'bad' });
  c.nextDate = undefined;
  c.stage = c.meetings > 0 ? 'dating' : 'talking';
  c.interest -= 12;
  // こちらからキャンセルしたことをトークに残す（2026-11-09 指示）
  pushMsg(c, state.day, 'me', overtime
    ? '本当にごめんなさい、急に残業が入ってしまって今日行けなくなりました…。また改めて誘わせてください。'
    : '本当にごめんなさい、急に休日出勤になってしまって今日行けなくなりました…。また改めて誘わせてください。');
  npcSay(state, c, 'chat_cool', { text: 'そうなんですね…お仕事なら仕方ないです。', awaitMe: true });
  addFeed(state, overtime ? `急な残業で、${npc.name}との約束をキャンセルした。` : `休日出勤になり、${npc.name}との約束をキャンセルした。`, 'bad', c.npcId);
}

/** 当日ドタキャン（連絡あり）：待ち合わせの日の朝にキャンセルのメッセージが来る。やり取りは続くが気持ちは冷める */
const DAY_CANCEL_LINES = {
  toMale: ['ごめんなさい、急に仕事が入ってしまって今日行けなくなりました…', '本当にごめんなさい、朝から体調が悪くて今日はやめておきます', 'ごめんなさい！家の用事が入ってしまって…また連絡します'],
  toFemale: ['ごめん、急に休日出勤になって今日行けなくなった…', '本当にごめん、体調崩して今日は無理そう', 'ごめん！どうしても外せない用事が入っちゃって。また連絡する'],
};
export function dayCancel(state: GameState, c: Contact): boolean {
  const npc = state.npcs[c.npcId];
  if (c.stage !== 'scheduled' || c.nextDate?.day !== state.day) return false;
  const forced = devForce(state, `daycancel:${c.npcId}`);
  // 初めて会う日は、進み方の上限（reach）で決まる：約束まで（2）の相手は来ない。一部は連絡なしの待ちぼうけ
  const fated = typeof c.flags.reach === 'number' && c.meetings === 0 && isNormalPurpose(npc.purpose);
  if (fated && forced === undefined && c.flags.reach === 2 && withRng(state, (r) => r.chance(TUNE_FUNNEL.noshowShare))) {
    c.flags.forceNoshow = true;
    return false;
  }
  const p = fated ? (c.flags.reach === 2 ? 1 : 0) : (TUNE_DAY_CANCEL[npc.purpose] ?? 0) * (c.interest < 50 ? 1.5 : 1) * (npc.filteredPhoto ? 2 : 1);
  if (forced !== undefined ? forced !== '1' : !withRng(state, (r) => r.chance(p))) return false;
  if (fated) c.flags.reach = 1; // 仕切り直しても会えない
  const tier = c.nextDate.tier;
  const text = withRng(state, (r) => sayLines(state, npc, DAY_CANCEL_LINES, r));
  // 返事はキャンセルへの返し方を選ぶ（2026-11-16 修正：ふつうの会話の選択肢が出ていた）
  npcSay(state, c, 'day_cancel', { text: text + (isNormalPurpose(npc.purpose) && withRng(state, (r) => r.chance(0.4)) ? ' また会ってくださると嬉しいです！' : ''), awaitMe: true });
  c.dates.push({ day: state.day, tier, costYen: 0, outcome: 'canceled', notes: [`${TUNE_VENUES[tier].label}の約束の日の朝、キャンセルの連絡が来た`], impression: 'bad' });
  c.nextDate = undefined;
  c.stage = c.meetings > 0 ? 'dating' : 'talking';
  c.interest -= 12;
  seriesLoss(state, c, SPEC_LOSS.E05_NOTICE, 'E05', `当日ドタキャン（${npc.name}）`);
  addFeed(state, `${npc.name}から、今日の約束をキャンセルする連絡が来た。`, 'bad', c.npcId);
  return true;
}

export function resolveDateNoshow(state: GameState, c: Contact, choiceId: string, ev: PendingEvent): void {
  const npc = state.npcs[c.npcId];
  const transport = Number(ev.data?.transport ?? 0);
  spend(state, transport, 'transport', `待ち合わせ場所までの交通費（${npc.name}）`, { npcId: c.npcId });
  const tier = c.nextDate?.tier ?? 'cafe';
  if (tier === 'dinner' || tier === 'luxury') {
    spend(state, Math.round(TUNE_VENUES[tier].perPerson[0] * 0.5), 'date', '予約の当日キャンセル料', { npcId: c.npcId });
  }
  c.dates.push({ day: state.day, tier, costYen: transport, outcome: 'noshow', notes: [`${TUNE_VENUES[tier].label}で待ち合わせたが、相手は来なかった`], impression: 'bad' });
  endContact(state, c, {
    by: 'them', cause: '当日ドタキャン・待ちぼうけ', eventId: 'E05', base: SPEC_LOSS.E05,
    visible: choiceId === 'wait'
      ? `1時間待っても${npc.name}は来なかった。その日の夜、トークは「退会したユーザー」になっていた。`
      : `店に謝って帰った。${npc.name}からの連絡はそれきりだった。`,
  });
}

export function resolveDateE06(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  seriesLoss(state, c, SPEC_LOSS.E06, 'E06', `写真・年齢・職業の重大な偽装（${npc.name}）`);
  logEvent(state, 'E06', '重大な偽装が発覚', c.npcId);
  c.faceKnown = true;
  c.faceKnownVia ??= 'meeting';
  if (choiceId === 'end') {
    finishMeeting(state, c, npc, 0.5, 'cafe');
    note(c, '理由を伝えて早めに帰った');
    finalizeDate(state, c, 'bad');
    endContact(state, c, { by: 'me', cause: '重大な偽装を理由に自分から終了', visible: `${npc.name}には正直に理由を伝え、早めに帰った。` });
    return;
  }
  c.flags.distrust = true;
  pushTalk(state, c, npc, [{ who: 'narration', text: 'もやもやを抱えたまま、席についた。' }]);
}

export function resolveDateTalk(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  const ch = character(state);
  const line = fill((DATE_TALK as Record<string, { line: string }>)[choiceId]?.line ?? '', vars(state, npc));
  let mult = Number(c.flags.rejMult ?? 1);
  if (choiceId === 'listen') { mult *= 0.85; c.interest += 10; }
  if (choiceId === 'remember') { mult *= 0.8; c.interest += 12; }
  if (choiceId === 'self') { mult *= 1.1; c.interest += 2; }
  if (choiceId === 'interview') { mult *= npc.traits.future === 'soon' ? 1.0 : 1.3; c.interest -= 4; c.flags.interviewed = true; }
  if (choiceId === 'honest') { c.flags.conditionsShared = true; mult *= 1.0; c.interest += 3; }
  if (choiceId === 'kids') {
    c.flags.conditionsShared = true;
    if (!npc.traits.acceptsConstraints) { mult *= 1.25; c.flags.conditionsIssue = true; } else { mult *= 0.9; c.interest += 6; }
  }
  c.flags.rejMult = mult;
  c.faceKnown = true;
  c.faceKnownVia ??= 'meeting';
  note(c, `自分：${(DATE_TALK as Record<string, { label: string }>)[choiceId]?.label ?? ''}`);
  const lines: PendingEvent['lines'] = [{ who: 'me', text: line }];

  // 業者（E11）：会ってみたら勧誘が中心
  if (npc.purpose === 'business') {
    lines.push({ who: 'them', text: 'ところで…今日、すごく尊敬してる先輩も近くにいて。ちょっとだけ呼んでもいいですか？' });
    lines.push({ who: 'narration', text: '数分後、名刺を持った男性が同じテーブルに座った。話題は「副業」と「仲間」のことばかりになった。' });
    note(c, '途中で「先輩」が同席し、副業の勧誘の話になった');
    pushPending(state, {
      kind: 'date_e11', npcId: c.npcId, title: '「先輩」の話', lines,
      choices: [{ id: 'refuse', label: 'はっきり断って帰る' }, { id: 'listen', label: '話だけ聞いてみる' }],
    });
    return;
  }
  // 値踏み（E07）
  const vulnerable = ch.looks <= 2 || ch.incomeYen < 3_500_000 || !c.flags.faceWasKnownBeforeDate || ch.age >= 40;
  const forceRude = devForce(state, `rude:${c.npcId}`) === '1';
  if (forceRude || (npc.traits.rudeness > 0.7 && vulnerable && withRng(state, (r) => r.chance(0.6)))) {
    const remark = ch.incomeYen < 3_500_000
      ? '「え、年収そこなんだ。正直、将来とか考えると厳しくない？」'
      : !c.flags.faceWasKnownBeforeDate ? '「写真なかったから、もっと違う感じの人を想像してた」'
        : withRng(state, (r) => r.pick(['「思ってたより…まあ、いいや」', '「え、ニュースとか見ないタイプ？会話の引き出し少なそう」']));
    lines.push({ who: 'them', text: remark });
    note(c, `相手に言われた：${remark}`);
    pushPending(state, {
      kind: 'date_e07', npcId: c.npcId, title: '値踏みされる', lines,
      choices: [{ id: 'push', label: '失礼だと反論する' }, { id: 'leave', label: '早めに切り上げる' }, { id: 'let', label: '笑って受け流す' }],
    });
    return;
  }
  // トイレに行ったまま帰ってこない（体験談：バックれ）。初めて会って、相手がかなり冷めているとき
  const bailForced = devForce(state, `bail:${c.npcId}`);
  if (isNormalPurpose(npc.purpose) && c.meetings === 0 && (bailForced === '1'
    || (bailForced === undefined && c.interest < 40 && Number(c.flags.rejMult ?? 1) >= 1 && withRng(state, (r) => r.chance(0.2))))) {
    lines.push({ who: 'them', text: 'ちょっとお手洗い行ってきますね' });
    lines.push({ who: 'narration', text: `15分たっても${npc.name}が戻ってこない。店員に聞くと「お連れ様は先ほどお店を出られました」と言われた。` });
    note(c, `「お手洗いに」と席を立った${npc.name}が、そのまま帰ってしまった`);
    pushPending(state, { kind: 'date_bail', npcId: c.npcId, title: '戻ってこない', lines, choices: [{ id: 'pay', label: '2人分を払って店を出る' }] });
    return;
  }
  // 女性プレイヤー：結婚後の役割を押し付けられる（体験談）
  if (state.gender === 'F' && isNormalPurpose(npc.purpose) && !c.flags.roleTalk && withRng(state, (r) => r.chance(0.06))) {
    c.flags.roleTalk = true;
    lines.push({ who: 'them', text: '結婚したら、生活費はほとんど俺が出すから、家事は奥さんに任せたいんだよね' });
    pushPending(state, {
      kind: 'date_role', npcId: c.npcId, title: '結婚後の話', lines,
      choices: [
        { id: 'counter', label: '家事は分担したいと伝える' },
        { id: 'accept', label: '「それもいいかもね」と返す' },
        { id: 'leave', label: '「家政婦を雇ったほうが安いのでは」と言って帰る' },
      ],
    });
    return;
  }
  pushPay(state, c, npc, lines);
}

export function resolveDateBail(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  const tier = c.nextDate?.tier ?? 'cafe';
  const per = withRng(state, (r) => dateCost(c, tier, r));
  spend(state, per * 2, 'date', `${npc.name}との${TUNE_VENUES[tier].label}（2人分）`, { npcId: c.npcId });
  finishMeeting(state, c, npc, 1, tier);
  note(c, `2人分の${(per * 2).toLocaleString()}円を払って店を出た`);
  finalizeDate(state, c, 'bad');
  endContact(state, c, {
    by: 'them', cause: 'デートの途中で帰られた', eventId: 'E04', base: SPEC_LOSS.E04_AFTER_DATE,
    visible: `2人分の${(per * 2).toLocaleString()}円を払って店を出た。${npc.name}のアカウントは、もう見つからなかった。`,
  });
}

export function resolveDateRole(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'leave') {
    note(c, '結婚後の家事の話に引っかかり、そのまま帰った');
    finishMeeting(state, c, npc, 0.5, c.nextDate?.tier ?? 'cafe');
    finalizeDate(state, c, 'bad');
    endContact(state, c, { by: 'me', cause: '結婚後の役割を押し付けられて自分から終了', visible: '「家政婦を雇ったほうが安上がりだと思います」と伝えて店を出た。' });
    return;
  }
  const line = choiceId === 'counter' ? `「家事は二人で分担したいです」と伝えると、${npc.name}は少し考え込んだ。` : '「それもいいかもね」と笑って返した。';
  note(c, line);
  c.interest += choiceId === 'counter' ? -4 : 2;
  pushPay(state, c, npc, [{ who: 'narration', text: line }]);
}

/** 会計の選択肢（2026-11-06 指示）：男性はおごる前提、女性はおごられる前提 */
function payChoices(state: GameState): Choice[] {
  if (state.gender === 'M') {
    return [
      { id: 'all', label: 'ごちそうする', sub: '全額払う' },
      { id: 'more', label: '多めに払い、少しだけ出してもらう' },
      { id: 'split', label: '割り勘を提案する', sub: '印象が下がることがある' },
    ];
  }
  return [
    { id: 'treated', label: 'ごちそうになり、お礼を伝える' },
    { id: 'gesture', label: '財布を出すそぶりを見せる', sub: 'たいていは「いいよ」と言われる' },
    { id: 'split', label: '割り勘を申し出る' },
  ];
}

function pushPay(state: GameState, c: Contact, npc: Npc, pre: PendingEvent['lines']): void {
  const tier = c.nextDate?.tier ?? 'cafe';
  const per = withRng(state, (r) => dateCost(c, tier, r));
  c.flags.perPerson = per;
  const lines = [...pre, { who: 'narration' as const, text: `会計は2人で${(per * 2).toLocaleString()}円。` }];
  if (npc.purpose === 'profit' && tier === 'luxury') {
    lines.push({ who: 'narration', text: `${npc.name}は伝票の方を見ずに、スマホを触っている。` });
  }
  if (state.gender === 'M') {
    // 男性プレイヤー：おごる選択の前に、相手が財布を出すそぶりをしたかを見せる（2026-11-06 指示）
    const exp = npc.traits.payExpectation;
    const p = npc.purpose === 'profit' ? 0.05 : exp === 'split' ? 0.9 : exp === 'more' ? 0.65 : 0.15;
    const gesture = withRng(state, (r) => r.chance(p));
    c.flags.walletGesture = gesture;
    if (gesture) {
      lines.push({ who: 'narration', text: `${npc.name}がバッグから財布を出した。` }, { who: 'them', text: 'いくらでしたか？' });
    } else {
      lines.push({ who: 'narration', text: `${npc.name}は財布を出すそぶりを見せない。` });
      lines.push({ who: 'system', text: '注意：このまま続くと、この先のデートでも支出がかさみそうだ。' });
    }
  }
  pushPending(state, { kind: 'date_pay', npcId: c.npcId, title: 'お会計', lines, choices: payChoices(state) });
}

export function resolveDateE07(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  seriesLoss(state, c, SPEC_LOSS.E07, 'E07', `容姿・年収などを露骨に値踏みされた（${npc.name}）`);
  logEvent(state, 'E07', '値踏み', c.npcId);
  c.flags.e07 = true;
  c.flags.rejMult = 3; // 失礼な相手はほぼ再会を望まない
  const line = choiceId === 'push' ? '「そういう言い方は失礼だと思います」と伝えると、空気が冷えた。'
    : choiceId === 'leave' ? '「今日はこのへんで」と早めに席を立った。'
      : '笑ってやり過ごしたが、帰り道ずっとその言葉が頭に残った。';
  note(c, line);
  pushPay(state, c, npc, [{ who: 'narration', text: line }]);
}

export function resolveDateE11(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  finishMeeting(state, c, npc, 1, c.nextDate?.tier ?? 'cafe');
  if (choiceId === 'refuse') {
    note(c, '勧誘をはっきり断って帰った');
    finalizeDate(state, c, 'bad');
    endContact(state, c, {
      by: 'me', cause: '恋愛のつもりで会ったら勧誘だった', eventId: 'E11', base: SPEC_LOSS.E11_AFTER,
      visible: `「興味ありません」と伝えて店を出た。${npc.name}からの連絡はそれきり途絶えた。`,
    });
    return;
  }
  pushPending(state, {
    kind: 'e11_seminar', npcId: c.npcId, title: 'セミナーへの誘い',
    lines: [
      { who: 'them', text: '今度の週末、先輩のセミナーがあるんです。参加費3万円だけど、人生変わりますよ。' },
      { who: 'narration', text: '恋愛の話は、もう一度も出てこなかった。' },
    ],
    choices: [{ id: 'pay', label: '参加費を払う' }, { id: 'refuse', label: 'その場で断る' }],
  });
}

export function resolveDateBar(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'go') {
    const bill = withRng(state, (r) => Math.round(r.range(80_000, 150_000) / 1000) * 1000);
    spend(state, bill, 'special', `${npc.name}に連れて行かれたバーの請求`, { npcId: c.npcId, special: true });
    note(c, `食事のあと「知り合いのバー」に連れて行かれ、${bill.toLocaleString()}円を請求された`);
    finalizeDate(state, c, 'bad');
    endContact(state, c, {
      by: 'them', cause: 'ぼったくりバーで高額を請求された', eventId: 'E08', base: SPEC_LOSS.E08_BAR,
      visible: `ビルの地下の小さなバーだった。${npc.name}が頼んだシャンパンが次々に開き、会計は${bill.toLocaleString()}円。${npc.name}は「また来てね」と言って店に残った。翌日からトークは既読にならない。`,
    });
    return;
  }
  note(c, 'バーへの誘いを断って帰った');
  finalizeDate(state, c, 'bad');
  const paidHigh = !!c.flags.luxuryChosen && Number(c.flags.paidShare ?? 0) >= 1.4;
  endContact(state, c, {
    by: 'them', cause: paidHigh ? '高額な食事の支払い後に関係を切られた' : 'デート後の既読無視', eventId: paidHigh ? 'E08' : 'E03', base: paidHigh ? SPEC_LOSS.E08 : SPEC_LOSS.E03,
    visible: `「そっか、じゃあまたね」と${npc.name}は一人で歩いていった。その夜送ったお礼は、既読のまま返事が来なかった。`,
  });
}

export function resolveE25(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  const yenCost = choiceId === 'lawyer' ? 200_000 : choiceId === 'settle' ? 500_000 : 300_000;
  const base = choiceId === 'lawyer' ? SPEC_LOSS.E25_LAWYER : choiceId === 'settle' ? SPEC_LOSS.E25_SETTLE : SPEC_LOSS.E25_IGNORE;
  spend(state, yenCost, 'special', choiceId === 'settle' ? `示談金（${npc.name}）` : `弁護士費用（${npc.name}の件）`, { npcId: c.npcId, special: true });
  const visible = choiceId === 'lawyer'
    ? 'やり取りの記録をそろえて弁護士に相談し、話し合いで終わった。費用は20万円。それから、アプリを開く手が重くなった。'
    : choiceId === 'settle'
      ? '示談金50万円を払い、書面にサインした。本当にあれでよかったのか、今も分からない。'
      : '放っておくと、数週間後に警察から連絡が来た。結局弁護士に頼むことになり、費用は30万円。仕事にも手がつかない日が続いた。';
  if (c.stage === 'ended') {
    seriesLoss(state, c, base, 'E25', `不同意性交だったと訴えられた（${npc.name}）`);
    logEvent(state, 'E25', '不同意性交だったと訴えられた', c.npcId);
    addFeed(state, visible, 'bad', c.npcId);
    return;
  }
  endContact(state, c, { by: 'them', cause: '不同意性交だったと訴えられた', eventId: 'E25', base, visible });
}

export function resolveE11Seminar(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'pay') spend(state, 30000, 'special', `勧誘されたセミナーの参加費（${npc.name}）`, { npcId: c.npcId, special: true });
  note(c, choiceId === 'pay' ? 'セミナーの参加費3万円を払った' : 'セミナーの誘いを断った');
  finalizeDate(state, c, 'bad');
  endContact(state, c, {
    by: choiceId === 'pay' ? 'them' : 'me', cause: '恋愛のつもりで会ったら勧誘だった', eventId: 'E11', base: SPEC_LOSS.E11_AFTER,
    visible: choiceId === 'pay' ? 'セミナーは「仲間を増やす方法」の話だった。帰りに送ったメッセージに返事はない。' : `勧誘を断ると、${npc.name}は急に興味をなくしたようだった。`,
  });
}

/** 会計の解決 → 美人局・夜の誘い・デートの終わりへ */
export function resolveDatePay(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  const per = Number(c.flags.perPerson ?? 0);
  const exp = npc.traits.payExpectation;
  // 財布を出すそぶり：相手の考え次第で、そのままごちそうになるか、少し・半分出す
  const share = choiceId === 'all' ? 2 : choiceId === 'more' ? 1.4 : choiceId === 'split' ? 1
    : choiceId === 'gesture' ? (exp === 'split' ? 1 : exp === 'more' ? 0.4 : 0) : 0;
  const tier = c.nextDate?.tier ?? 'cafe';
  const pay = Math.round((per * share) / 10) * 10;
  const highByChoice = tier === 'luxury' || (tier === 'dinner' && share >= 1.4);
  spend(state, pay, 'date', `${npc.name}との${TUNE_VENUES[tier].label}`, { npcId: c.npcId, playerChosenHigh: highByChoice });
  let mult = Number(c.flags.rejMult ?? 1);
  if (state.gender === 'M') {
    // おごられる前提の相手に割り勘を提案すると印象が下がる
    if (exp === 'treat' && choiceId === 'split') { mult *= 1.2; c.interest -= 8; }
    if (exp === 'more' && choiceId === 'split') { mult *= 1.08; c.interest -= 3; }
    if (exp === 'treat' && choiceId === 'more') { mult *= 1.04; }
  } else {
    // 割り勘派の相手に何も言わずごちそうになると、少し引っかかる
    if (exp === 'split' && choiceId === 'treated') { mult *= 1.12; c.interest -= 4; }
    if (choiceId === 'gesture') { mult *= 0.98; }
    if (exp === 'treat' && choiceId === 'split') { mult *= 0.97; }
  }
  c.flags.rejMult = mult;
  c.flags.paidShare = share;
  finishMeeting(state, c, npc, 1, tier);
  note(c, `会計 ${(per * 2).toLocaleString()}円（自分の負担 ${pay.toLocaleString()}円）`);
  const payLines = payResultLines(state, c, npc, choiceId, pay);
  const rec = [...c.dates].reverse().find((d) => d.day === state.day);
  if (rec) rec.costYen += pay;

  // 夜職の相手（2026-11-09）：食事のあと「知り合いのバー」に誘う。ついていくと高額を請求される
  if (npc.nightWork === 'bar' && !c.flags.barInvited) {
    c.flags.barInvited = true;
    pushPending(state, {
      kind: 'date_bar', npcId: c.npcId, title: '店を出たあと',
      lines: [
        ...payLines,
        { who: 'them', text: withRng(state, (r) => r.pick([
          'ねえ、まだ早いし、知り合いがやってるバーで1杯だけ飲まない？すぐそこなの',
          'この近くに友達のお店あるんだけど、ちょっと顔出してもいい？一緒に行こうよ〜',
        ])) },
        { who: 'narration', text: `${npc.name}は、もう店の方へ歩き出している。` },
      ],
      choices: [{ id: 'go', label: 'ついていく' }, { id: 'refuse', label: '今日は帰ると伝える' }],
    });
    return;
  }
  // 美人局（E10）
  if (npc.purpose === 'bijin') {
    pushPending(state, {
      kind: 'date_e10', npcId: c.npcId, title: '店を出たあと',
      lines: [...payLines, ...(state.gender === 'M'
        ? ([
          { who: 'narration', text: `駅へ向かう途中、${npc.name}が急に足を止めた。背後から知らない男が近づいてくる。` },
          { who: 'them', text: '（男）「俺の女に何してんだよ。どう落とし前つけるつもり？」' },
          { who: 'narration', text: `${npc.name}は目を合わせようとしない。` },
        ] as PendingEvent['lines'])
        : [
          { who: 'narration', text: `店を出ると、${npc.name}の「知り合い」を名乗る男たちが待っていた。` },
          { who: 'them', text: '（男）「こいつに貢がせた分、返してもらえる？」' },
        ] as PendingEvent['lines'])],
      choices: [
        { id: 'help', label: '店員や警察に助けを求める' },
        { id: 'leave', label: '人の多い方へその場を離れる' },
        { id: 'later', label: 'その場は払って、後で相談する' },
      ],
    });
    return;
  }
  // 夜の誘い（身体目的の相手は早い段階で。誠実な相手も3回目以降にまれに）
  const bodyInvite = npc.purpose === 'body' && c.meetings <= 3 && !c.flags.nightDone;
  const sincereInvite = isNormalPurpose(npc.purpose) && c.meetings >= 3 && !c.flags.nightDone && withRng(state, (r) => r.chance(0.2));
  // 女性プレイヤー：2回目以降のデートで、体の関係を持つかを聞かれる（2026-11-03 指示）
  const askFemale = state.gender === 'F' && isNormalPurpose(npc.purpose) && c.meetings >= 2 && !c.flags.nightDone && withRng(state, (r) => r.chance(0.35));
  if (bodyInvite || sincereInvite || askFemale) {
    c.flags.nightDone = true;
    const female = state.gender === 'F';
    pushPending(state, {
      kind: 'night_invite', npcId: c.npcId, title: female ? '帰り道：体の関係を持つ？' : '帰り道',
      lines: [
        ...payLines,
        { who: 'them', text: withRng(state, (r) => sayLines(state, npc, NIGHT_INVITE, r)) },
        ...(female ? [{ who: 'narration' as const, text: `まだ付き合おうとは言われていない。${npc.name}の家に行けば、体の関係を持つことになりそうだ。` }] : []),
      ],
      choices: female
        ? [
          { id: 'go', label: '家に行く（体の関係を持つ）', sub: '相手の本気度は分からない' },
          { id: 'home', label: '今日は帰る' },
          { id: 'confirm', label: '付き合ってからにしたいと伝える' },
        ]
        : [
          { id: 'go', label: 'ついていく' },
          { id: 'home', label: '今日は帰る' },
          { id: 'confirm', label: '先に二人の関係をはっきりさせたいと言う' },
        ],
    });
    return;
  }
  pushDateEnd(state, c, npc, payLines);
}

/** 会計の結果（相手の一言と自分の支払い額）。財布を出すそぶりの結果を明確に見せる */
function payResultLines(state: GameState, c: Contact, npc: Npc, choiceId: string, pay: number): PendingEvent['lines'] {
  const exp = npc.traits.payExpectation;
  const out: PendingEvent['lines'] = [];
  const them = (text: string) => out.push({ who: 'them', text });
  if (state.gender === 'F') {
    if (choiceId === 'gesture') {
      out.push({ who: 'narration', text: '財布を出すそぶりを見せた。' });
      if (exp === 'split') them('じゃあ割り勘でいい？');
      else if (exp === 'more') them(`じゃあ${pay.toLocaleString()}円だけもらっていい？`);
      else them('いいよいいよ、今日は出させて。');
    } else if (choiceId === 'treated') {
      if (exp === 'split') { them('……あ、うん。いいよ。'); out.push({ who: 'narration', text: `${npc.name}は一瞬だけ間を置いて、会計を済ませた。` }); }
      else them('今日はごちそうさせて。楽しかった！');
    } else if (choiceId === 'split') {
      them(exp === 'treat' ? 'え、いいの？じゃあ割り勘で。' : 'ありがとう、じゃあ半分ずつで。');
    }
  } else {
    if (choiceId === 'all') them(c.flags.walletGesture ? 'え、いいんですか？ありがとうございます、ごちそうさまです！' : 'ごちそうさまです！');
    else if (choiceId === 'more') them(exp === 'treat' ? '……あ、はい。' : 'ありがとうございます、じゃあこれだけ出しますね。');
    else if (choiceId === 'split') them(exp === 'treat' ? '……あ、割り勘ですね。わかりました。' : 'もちろんです！');
  }
  out.push({ who: 'system', text: pay > 0 ? `自分の支払い：${pay.toLocaleString()}円` : '自分の支払い：0円（ごちそうになった）' });
  return out;
}

/** デート中に見えたこと（デートタブの記録） */
function note(c: Contact, text: string): void {
  (c.dateNotes ??= []).push(text);
}

/** その日のデート記録に、起きたことと感触を書き込む */
function finalizeDate(state: GameState, c: Contact, impression: Impression): void {
  const rec = [...c.dates].reverse().find((d) => d.day === state.day);
  if (!rec) return;
  rec.notes = [...(c.dateNotes ?? [])];
  rec.impression = impression;
}

/**
 * デートの感触：プレイヤーが受け取った印象。相手の興味と会話・会計の選び方から決まるが揺らぎがあり、
 * 目的を偽っている相手ほど愛想が良い。感触が良くても断られることがある（相手の本心は表示しない）。
 */
function impressionOf(state: GameState, c: Contact, npc: Npc): Impression {
  const charm = npc.purpose === 'body' || npc.purpose === 'profit' || npc.purpose === 'married' || npc.purpose === 'bijin' ? 0.15 : 0;
  const score = c.interest / 100 - (Number(c.flags.rejMult ?? 1) - 1) * 0.6 + charm + withRng(state, (r) => r.normal(0, 0.12));
  return score > 0.68 ? 'good' : score > 0.45 ? 'okay' : 'awkward';
}

/** 会った回数と時間の記録 */
function finishMeeting(state: GameState, c: Contact, _npc: Npc, _w: number, tier: VenueTier): void {
  if (c.flags.meetingCounted === state.day) return;
  c.flags.meetingCounted = state.day;
  state.week.meetings = (state.week.meetings ?? 0) + 1;
  const transport = Number(c.flags.dateTransport ?? 0);
  spend(state, transport, 'transport', `交通費（${_npc.name}）`, { npcId: c.npcId });
  spend(state, TUNE_PREP_YEN[state.gender], 'prep', '身支度', { npcId: c.npcId });
  c.meetings += 1;
  state.stats.dates += 1;
  c.dates.push({ day: state.day, tier, costYen: transport + TUNE_PREP_YEN[state.gender], outcome: 'met', notes: [...(c.dateNotes ?? [])] });
  if (c.meetings === 2 && isNormalPurpose(_npc.purpose) && c.stage !== 'relationship') c.ambiguousSince ??= state.day;
}

export function resolveDateE10(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  const amount = withRng(state, (r) => choiceId === 'help' ? (r.chance(0.6) ? 0 : r.int(1, 2) * 10_000)
    : choiceId === 'leave' ? r.int(0, 5) * 10_000 : r.int(5, 10) * 10_000);
  if (amount > 0) spend(state, amount, 'special', `恐喝による金銭被害（${npc.name}の関係者）`, { npcId: c.npcId, special: true });
  const visible = choiceId === 'help'
    ? `店員が警察に通報してくれた。${amount > 0 ? `それでも${amount.toLocaleString()}円を失い、` : ''}手の震えはしばらく止まらなかった。${npc.name}のアカウントは消えていた。`
    : choiceId === 'leave'
      ? `人通りの多い方へ逃げた。${amount > 0 ? `財布から抜かれた${amount.toLocaleString()}円は戻らない。` : ''}${npc.name}とは二度と連絡がつかなかった。`
      : `言われるままに${amount.toLocaleString()}円を渡した。後日、相談窓口に連絡したが、恐怖はすぐには消えない。`;
  note(c, '店を出たあと、知らない男に金銭を要求された');
  finalizeDate(state, c, 'bad');
  endContact(state, c, { by: 'them', cause: '美人局・恐喝の被害', eventId: 'E10', base: SPEC_LOSS.E10, visible });
}

export function resolveNightInvite(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  note(c, choiceId === 'go' ? '帰り道に誘われ、ついていった' : choiceId === 'confirm' ? '帰り道に誘われ、先に関係をはっきりさせたいと伝えた' : '帰り道に誘われたが、今日は帰った');
  if (choiceId === 'go') {
    c.flags.intimate = true;
    // 不同意性交だったと訴えられる（E25。男性プレイヤー・2%。2026-11-09 指示）：数日〜2週間後に代理人から連絡が来る
    const accuse = devForce(state, `accuse:${c.npcId}`);
    if (state.gender === 'M' && !c.flags.accuseDay && (accuse !== undefined ? accuse === '1' : withRng(state, (r) => r.chance(0.02)))) {
      c.flags.accuseDay = state.day + withRng(state, (r) => r.int(5, 14));
    }
    if (npc.purpose === 'body') {
      // 暗転。後日、連絡が減って切られる（E09）
      c.flags.e09Day = state.day + withRng(state, (r) => r.int(3, 10));
      c.warningSignDay ??= state.day;
    } else if (npc.purpose === 'ambiguous' && withRng(state, (r) => r.chance(0.35))) {
      // 曖昧な相手：体の関係の後に連絡が減り、そのまま途絶える
      c.flags.e03Day = state.day + withRng(state, (r) => r.int(4, 9));
      c.flags.e03Reason = '体の関係を持った後に連絡が途絶えた';
    } else {
      c.interest += 5;
    }
    pushDateEnd(state, c, npc, [{ who: 'narration', text: '――その夜のことは、ここでは語らない。' }], true);
    return;
  }
  // 断れないヤリ捨て：家に行くのを断っても、その場で付き合おうと言ってくる
  if (sneakyBody(state, npc)) {
    fakeCommit(state, c, npc, choiceId === 'confirm' ? '「付き合ってからにしたい」と伝えると、その場で付き合おうと言われた' : '帰ろうとすると、「ちゃんと付き合おう」と言われた');
    return;
  }
  if (choiceId === 'confirm') {
    if (npc.purpose === 'body') {
      const fake = withRng(state, (r) => r.chance(0.6));
      if (fake) {
        // 家に行くのは付き合ってから、と伝えたら「じゃあ付き合おう」と言われた。デートを締めてから交際へ
        note(c, '「付き合ってからにしたい」と伝えると、その場で付き合おうと言われた');
        finalizeDate(state, c, 'good');
        c.nextDate = undefined;
        pushMsg(c, state.day, 'them', 'もちろん。ちゃんと付き合おう');
        startRelationship(state, c);
        return;
      }
      c.interest -= 25;
      pushDateEnd(state, c, npc, [{ who: 'them', text: 'え、そういうの重いかも…' }], true);
      return;
    }
    // 誠実な相手でも答え方は様々。この日は家に行かず、関係のことは次に会うときに（じゃあまたデート、の流れ）
    pushDateEnd(state, c, npc, [
      { who: 'them', text: c.interest >= 60 ? '…うん、ちゃんと考えてるよ。じゃあ今日は帰ろっか。また会おうね' : 'ごめん、まだそこまでは考えられてないかも。今日は帰ろっか' },
      { who: 'narration', text: '家には行かず、駅で別れた。' },
    ], false);
    return;
  }
  if (npc.purpose === 'body') c.interest -= 30;
  pushDateEnd(state, c, npc, [{ who: 'narration', text: '「今日は帰るね」と改札で手を振った。' }], true);
}

/** 別れ際に相手からLINE交換を持ちかけるか（まだ交換していない相手） */
function offersLineAtDate(state: GameState, c: Contact, npc: Npc): boolean {
  let p: number;
  if (isNormalPurpose(npc.purpose)) {
    const wantsMore = c.meetings === 1 ? c.postDateDecision === 'continue' : c.interest >= 55;
    p = wantsMore ? TUNE_LINE.atDateOffer[state.gender === 'M' ? 'toMale' : 'toFemale'] * (c.interest >= 60 ? 1.2 : 0.8) : 0;
  } else {
    p = npc.purpose === 'body' || npc.purpose === 'bijin' || npc.purpose === 'business' ? 0.7 : npc.purpose === 'profit' ? 0.2 : 0;
  }
  return withRng(state, (r) => r.chance(p));
}

function pushDateEnd(state: GameState, c: Contact, npc: Npc, pre: PendingEvent['lines'], _afterNight = false): void {
  const lines = [...pre];
  // 2026-11-14 指示：「また会いたい」を社交辞令で伝えるか、本気で伝えるか（＋LINE交換・＋日程の提案）で、振られたときのライフの減り方が変わる
  const choices: Choice[] = [
    { id: 'more_polite', label: '「また機会があれば」と社交辞令で伝える', sub: '断られても傷は浅い' },
    { id: 'more', label: 'また会いたいと本気で伝える' },
    { id: 'end', label: '今回で終わりにする' },
  ];
  if (c.meetings >= 2 && c.stage !== 'relationship') choices.splice(2, 0, { id: 'propose', label: '付き合ってほしいと伝える', sub: '断られたら傷はいちばん深い' });
  // 次の日程まで自分から提案する（以前は女性だけ。体験談の成功パターン：相手の気持ちも少し上がる）
  if (c.stage !== 'relationship') choices.splice(2, 0, { id: 'next_plan', label: 'また会いたいと伝えて、次の日程まで提案する', sub: '断られたら傷は深い' });
  // まだLINEを交換していなければ、別れ際に交換する場面がある（相手から言われる／自分から聞く）
  if (!c.lineExchanged && channelOf(c) === 'app') {
    if (c.meetings === 1) decidePostFirstDate(state, c, npc);
    if (offersLineAtDate(state, c, npc)) {
      c.flags.lineOfferedAtDate = state.day;
      lines.push({ who: 'them', text: 'あの、よかったらLINE交換しませんか？' });
      choices.splice(1, 1, { id: 'more_line', label: 'LINEを交換して、また会いたいと本気で伝える' }, { id: 'more', label: '交換はせず、また会いたいと本気で伝える' });
    } else {
      choices.splice(2, 0, { id: 'ask_line', label: 'LINEを聞いて、また会いたいと本気で伝える', sub: 'LINEは断られることもある' });
    }
  }
  void _afterNight;
  pushPending(state, {
    kind: 'date_end', npcId: c.npcId, title: 'デートの終わり',
    lines: [...lines, { who: 'narration', text: `${npc.name}と別れて、帰りの電車で今日のことを思い返す。` }],
    choices,
  });
}

/** 別れ際にこちらからLINEを聞いた時、相手が応じるか */
function acceptsLineAtDate(state: GameState, c: Contact, npc: Npc): boolean {
  let p: number;
  if (isNormalPurpose(npc.purpose)) {
    const decision = c.meetings === 1 ? c.postDateDecision ?? 'continue' : c.interest >= 50 ? 'continue' : 'reject';
    p = TUNE_LINE.atDateAccept[decision];
  } else {
    p = TUNE_LINE.purposeAccept[npc.purpose] ?? 0.5;
  }
  return withRng(state, (r) => r.chance(p));
}

/** 対面後の継続意思（通常NPCの初回だけ、1回決める） */
export function decidePostFirstDate(state: GameState, c: Contact, npc: Npc): void {
  if (c.postDateDecision || !isNormalPurpose(npc.purpose)) return;
  const ch = character(state);
  const faceUnknownBefore = !c.flags.faceWasKnownBeforeDate;
  const hiddenRates = ch.rates;
  const publicRates = ch.ratesPhotoPublic ?? ch.rates;
  // 写真を見て会った相手には公開後の表、顔を知らずに会った相手には写真なし時の表
  const r = ch.photoInitiallyVisible ? ch.rates.postDateRejection
    : faceUnknownBefore ? hiddenRates.postDateRejection : publicRates.postDateRejection;
  const mult = Number(c.flags.rejMult ?? 1);
  // 将来を考える相手は「将来性」を気にして断りやすい（蓮）
  const futureWorry = ch.futureConcern && npc.traits.future !== 'undecided' ? ch.futureConcern : 0;
  const rEff = Math.min(0.97, Math.max(0.02, r * mult + futureWorry));
  const forced = devForce(state, `decision:${c.npcId}`);
  const reject = forced !== undefined ? forced === 'reject' : withRng(state, (rng) => rng.chance(rEff));
  c.postDateDecision = reject ? 'reject' : 'continue';
  c.flags.rejP = Math.round(rEff * 1000) / 1000;
  if (reject) {
    // 理由の内訳：顔を知らずに会った写真なし開始の人物では、外見の相性による終了が含まれる
    let reason: Contact['rejectReason'] = c.flags.conditionsIssue || c.flags.interviewed ? 'conditions' : 'chemistry';
    if (futureWorry && withRng(state, (rng) => rng.chance(0.75))) reason = 'future';
    if (faceUnknownBefore && !ch.photoInitiallyVisible && ch.ratesPhotoPublic) {
      const d = derivedPhotoLeaveRate(hiddenRates.postDateRejection, publicRates.postDateRejection);
      if (withRng(state, (rng) => rng.chance(d / hiddenRates.postDateRejection))) reason = 'appearance';
    }
    c.rejectReason = reason;
  }
}

/**
 * デートの後に伝えた気持ちの強さ（振られたときのライフの減り方の倍率。2026-11-14 指示）：
 * 社交辞令 0.5／本気 1／本気＋LINE交換 1.3／本気＋次の日程の提案 1.6／付き合ってほしい 1.8。次に会うまで有効
 */
export const WISH_MULT: Record<string, number> = { more_polite: 0.5, more: 1, more_line: 1.3, ask_line: 1.3, next_plan: 1.6, propose: 1.8 };

export function resolveDateEnd(state: GameState, c: Contact, rawChoiceId: string): void {
  const npc = state.npcs[c.npcId];
  let choiceId = rawChoiceId;
  if (WISH_MULT[rawChoiceId] !== undefined) c.flags.wishMult = WISH_MULT[rawChoiceId];
  const polite = rawChoiceId === 'more_polite';
  if (polite) choiceId = 'more';
  if (rawChoiceId === 'next_plan') {
    choiceId = 'more';
    c.interest += 6;
    c.flags.rejMult = Number(c.flags.rejMult ?? 1) * 0.9;
    // 初回の継続意思がもう決まっていたら、少しだけ覆ることがある
    if (c.meetings === 1 && c.postDateDecision === 'reject' && isNormalPurpose(npc.purpose) && withRng(state, (r) => r.chance(0.15))) c.postDateDecision = 'continue';
    note(c, '解散後、自分から「また遊ぼう」と連絡して次の予定を決めた');
  }
  if (rawChoiceId === 'more_line' || rawChoiceId === 'ask_line') {
    choiceId = 'more';
    if (c.lineExchanged) {
      // 既に交換済み（念のため）：LINEの話はしない
    } else if (rawChoiceId === 'more_line' || acceptsLineAtDate(state, c, npc)) {
      note(c, rawChoiceId === 'more_line' ? '別れ際に相手からLINE交換を持ちかけられ、交換した' : '別れ際にLINEを聞いて、交換した');
      c.lineExchanged = true;
      pushMsg(c, state.day, 'system', 'デートの別れ際にLINEを交換しました。ここからのやり取りはLINEで続きます。');
      // トークで出していたLINEの提案への返事は、ふつうの返事に変える
      if (c.pendingReply?.kind === 'line_answer') c.pendingReply.kind = 'chat';
    } else {
      note(c, 'LINEを聞いたが「また連絡しますね」とはぐらかされた');
      c.flags.lineDeclined = true;
      c.flags.lineDeclinedAt = c.meetings;
      if (npc.purpose === 'married') c.warningSignDay ??= state.day;
      pushMsg(c, state.day, 'system', '別れ際にLINEを聞いたが、「また連絡しますね」とはぐらかされた。');
    }
  } else if (c.flags.lineOfferedAtDate === state.day && rawChoiceId !== 'end') {
    note(c, '相手からのLINE交換の申し出は、今回は見送った');
  }
  note(c, choiceId === 'end' ? '今回で終わりにすると決めた' : choiceId === 'propose' ? '付き合ってほしいと伝えた' : 'また会いたいと伝えた');
  finalizeDate(state, c, impressionOf(state, c, npc));
  const first = c.meetings === 1 && !c.flags.firstDateResolved;
  if (first) {
    c.flags.firstDateResolved = true;
    decidePostFirstDate(state, c, npc);
    if (isNormalPurpose(npc.purpose)) {
      if (!c.flags.faceWasKnownBeforeDate) state.stats.faceUnknownFirstDates += 1;
      if (choiceId !== 'end') {
        state.stats.firstDates += 1;
        if (c.postDateDecision === 'reject') state.stats.firstDateRejections += 1;
      }
    }
  }
  // 2回目のデート後：通常NPCが交際へ進む気持ちになれるかを1回決める（仮置き。初回の「対面後お断り率」とは別の段階）
  if (c.meetings === 2 && isNormalPurpose(npc.purpose) && !c.flags.secondDecision) {
    const mult = Math.max(0.6, Number(c.flags.rejMult ?? 1));
    // 成功の流れ（体験談）：1週間以内の2回目・少し長めのデート（ディナーなど）で距離が縮まる。間が空くと冷める
    const met = c.dates.filter((d) => d.outcome === 'met');
    const gap = met.length >= 2 ? met[met.length - 1].day - met[met.length - 2].day : 0;
    const pace = gap > 0 && gap <= 7 ? 1.12 : gap > 21 ? 0.85 : 1;
    const longer = met[met.length - 1]?.tier === 'dinner' ? 1.05 : 1;
    const p = Math.min(0.95, ((npc.purpose === 'sincere' ? 0.72 : 0.45) / mult) * pace * longer);
    const forced = devForce(state, `second:${c.npcId}`);
    c.flags.secondDecision = forced ?? (withRng(state, (r) => r.chance(p)) ? 'continue' : 'reject');
  }
  c.nextDate = undefined;
  if (c.stage === 'scheduled') c.stage = 'dating';
  if (choiceId === 'end') {
    endContact(state, c, { by: 'me', cause: '自分から終了', visible: `${npc.name}には、丁寧にお礼と終わりを伝えた。` });
    return;
  }
  c.playerWantsMore = true;
  if (choiceId === 'propose') {
    c.flags.proposePending = true;
    c.flags.playerProposed = true;
  }
  pushMsg(c, state.day, 'me', choiceId === 'propose' ? '今日はありがとう。ちゃんと付き合ってほしいと思ってる。'
    : polite ? '今日はありがとうございました！またタイミングが合えばぜひ。'
      : rawChoiceId === 'next_plan' ? '今日はありがとう！すごく楽しかったです。また会いたいです。来週末とか空いてますか？'
        : '今日はありがとう！楽しかったです。また会いたいです。');
  // 相手の反応は1〜2日後
  const delay = withRng(state, (r) => r.int(1, 2));
  c.pendingReply = { day: state.day + delay, kind: 'after_date', willReply: true, expireDay: state.day + 7 };
  c.awaitingMe = false;
}

/** デート後の相手の反応（返信予定日に呼ばれる） */
export function afterDateReply(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  const proposing = !!c.flags.proposePending;
  c.flags.proposePending = false;

  // 目的偽装の相手
  if (npc.purpose === 'profit') {
    if (sneakyMeshi(state, npc)) {
      // 断れないメシ目：ふつうの店でもおごらせて、そのまま消える（2026-11-13）
      endContact(state, c, {
        by: 'them', cause: 'ふつうの店でおごらせた後に関係を切られた', eventId: 'E08', base: SPEC_LOSS.E08_SNEAKY,
        visible: `「ごちそうさまでした！楽しかったです」の一言のあと、${npc.name}とのトークは既読のまま動かなくなった。`,
      });
      return;
    }
    if (c.flags.luxuryChosen && Number(c.flags.paidShare ?? 0) >= 1.4) {
      endContact(state, c, {
        by: 'them', cause: '高額な食事の支払い後に関係を切られた', eventId: 'E08', base: SPEC_LOSS.E08,
        visible: `「ごちそうさまでした！」の一言のあと、${npc.name}とのトークは既読のまま動かなくなった。`,
      });
    } else {
      endContact(state, c, {
        by: 'them', cause: 'デート後の既読無視', eventId: 'E03', base: SPEC_LOSS.E03,
        visible: `${npc.name}にお礼を送ったが、既読のまま返事は来なかった。`,
      });
    }
    return;
  }
  if (npc.purpose === 'body') {
    if (c.flags.intimate) {
      // E09は後日（e09Day）に確定
      npcSay(state, c, 'body_hint', { text: '昨日はありがとう！また会おうね', awaitMe: false });
      return;
    }
    if (c.interest < 30) {
      endContact(state, c, {
        by: 'them', cause: 'デート後の既読無視', eventId: 'E03', base: SPEC_LOSS.E03,
        visible: `${npc.name}からの返事は来なかった。`,
      });
      return;
    }
    if (proposing && withRng(state, (r) => r.chance(0.7))) {
      pushMsg(c, state.day, 'them', 'もちろん！付き合おう');
      startRelationship(state, c);
      return;
    }
    npcSay(state, c, 'body_hint', { awaitMe: true });
    c.stage = 'dating';
    return;
  }
  if (npc.purpose === 'married') {
    if (proposing && withRng(state, (r) => r.chance(0.5))) {
      pushMsg(c, state.day, 'them', 'うん、嬉しい。よろしくね。でも周りにはまだ内緒にしてほしいな');
      startRelationship(state, c);
      return;
    }
    npcSay(state, c, 'married_hint', { awaitMe: true });
    c.stage = 'dating';
    return;
  }
  if (!isNormalPurpose(npc.purpose)) {
    endContact(state, c, { by: 'them', cause: 'デート後の既読無視', eventId: 'E03', base: SPEC_LOSS.E03, visible: `${npc.name}からの返事は来なかった。` });
    return;
  }

  // 通常NPC：初回後の継続意思は1回だけ決まっている
  if (c.postDateDecision === 'reject' && c.meetings === 1) {
    const delivery = devForce(state, `delivery:${c.npcId}`) ?? withRng(state, (r) => r.weighted(TUNE_REJECT_DELIVERY[npc.traits.delivery]));
    const reason = c.rejectReason === 'appearance' ? '対面後のお断り（外見の相性・内部判定）' : c.rejectReason === 'future' ? '対面後のお断り（将来性に不安）' : '対面後のお断り';
    if (c.rejectReason === 'appearance') state.stats.appearanceEndings += 1;
    if (delivery === 'E17' || c.rejectReason === 'future') {
      const text = c.rejectReason === 'future'
        ? withRng(state, (r) => r.pick([
          'この前はありがとうございました。すごく楽しかったです。ただ、将来のことを考えると、お給料とか働き方のことが少し不安になってしまって…。ごめんなさい。',
          '楽しかったです！でも、そろそろ結婚も考えたくて、将来のことを考えるとちょっと違うかなって思ってしまいました。ごめんなさい。',
          '一緒にいて楽しかったんですけど、将来のイメージがうまく持てなくて…。正直に伝えておきますね。',
        ]))
        : withRng(state, (r) => sayLines(state, npc, CHAT.reject_polite, r));
      pushMsg(c, state.day, 'them', text);
      endContact(state, c, { by: 'them', cause: reason, eventId: 'E17', base: SPEC_LOSS.E17, visible: `${npc.name}から、丁寧なお断りのメッセージが届いた。` });
    } else if (delivery === 'E03') {
      for (const m of c.messages) if (m.from === 'me') m.read = true;
      c.flags.e03Day = state.day + 4;
      c.flags.e03Reason = reason;
      c.stage = 'dating';
    } else {
      endContact(state, c, { by: 'them', cause: reason, eventId: 'E04', base: SPEC_LOSS.E04_AFTER_DATE, visible: `${npc.name}にお礼を送ったが、既読がつかない。数日後、連絡先が消えていた。` });
    }
    return;
  }

  // 2回目の後に気持ちが追いつかなかった（誠実な相手でも起こる）
  if (c.meetings === 2 && c.flags.secondDecision === 'reject' && !c.flags.secondHandled) {
    c.flags.secondHandled = true;
    if (npc.purpose === 'ambiguous' && withRng(state, (r) => r.chance(0.5))) {
      pushMsg(c, state.day, 'them', withRng(state, (r) => sayLines(state, npc, CHAT.chosen_other, r)));
      endContact(state, c, { by: 'them', cause: '2回会った後、別の本命を選ばれた', eventId: 'E16', base: SPEC_LOSS.E16, visible: `${npc.name}から「別の人と付き合うことになった」と連絡が来た。` });
    } else if (npc.traits.delivery === 'ghost') {
      for (const m of c.messages) if (m.from === 'me') m.read = true;
      c.flags.e03Day = state.day + 4;
      c.flags.e03Reason = '2回会った後の既読無視';
    } else {
      pushMsg(c, state.day, 'them', withRng(state, (r) => sayLines(state, npc, CHAT.reject_polite, r)));
      endContact(state, c, { by: 'them', cause: '2回会った後、相手の気持ちが追いつかなかった', eventId: 'E17', base: SPEC_LOSS.E17, visible: `${npc.name}から「いい人だと思うけど、恋愛として考えられなかった」と連絡が来た。` });
    }
    return;
  }

  // 継続：互いに再会を望んでいる
  c.stage = 'dating';
  c.interest += npc.purpose === 'sincere' ? 10 : 5;
  if (c.meetings === 1) {
    recoverOnce(state, 'firstMutualDate', SPEC_FIRST_MUTUAL_DATE_RECOVERY, '初めて互いに再会を望むデート');
    logEvent(state, 'E24', '互いに再会を望むデート', c.npcId);
  }
  if (proposing) {
    answerProposal(state, c, npc);
    return;
  }
  // 相手から交際の申し込み
  if (npc.purpose === 'sincere' && c.meetings >= 2 && c.interest >= 70 && withRng(state, (r) => r.chance(0.5))) {
    pushPending(state, {
      kind: 'rel_propose_them', npcId: c.npcId, title: `${npc.name}からの言葉`,
      lines: [{ who: 'them', text: state.gender === 'M' ? 'あの…よかったら、ちゃんとお付き合いしてもらえませんか？' : 'ちゃんと付き合ってほしい。真剣に考えてる。' }],
      choices: [{ id: 'yes', label: '「よろしくお願いします」と答える' }, { id: 'think', label: '少し考えさせてほしいと答える' }, { id: 'no', label: '断る' }],
    });
    return;
  }
  npcSay(state, c, 'after_date_good', { awaitMe: true });
}

export function answerProposal(state: GameState, c: Contact, npc: Npc): void {
  let yes = false;
  if (npc.purpose === 'sincere') yes = c.interest >= 55;
  else if (npc.purpose === 'ambiguous') yes = c.interest >= 75 && withRng(state, (r) => r.chance(0.35));
  else if (npc.purpose === 'body') yes = withRng(state, (r) => r.chance(0.75));
  else if (npc.purpose === 'married') yes = withRng(state, (r) => r.chance(0.5));
  if (yes) {
    pushMsg(c, state.day, 'them', withRng(state, (r) => sayLines(state, npc, CHAT.relationship_yes, r)));
    startRelationship(state, c);
    return;
  }
  if (npc.purpose === 'ambiguous') {
    c.ambiguousSince ??= state.day;
    npcSay(state, c, 'keep', { awaitMe: true });
    return;
  }
  if (npc.purpose === 'sincere') {
    npcSay(state, c, 'chat_normal', { text: 'ありがとう。嬉しいけど、もう少し会ってから決めたいな', awaitMe: true });
    return;
  }
  npcSay(state, c, 'keep', { awaitMe: true });
}

export function resolveRelProposeThem(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'yes') {
    startRelationship(state, c);
  } else if (choiceId === 'think') {
    c.interest -= 5;
    npcSay(state, c, 'chat_normal', { text: 'うん、待ってるね', awaitMe: true });
  } else {
    endContact(state, c, { by: 'me', cause: '交際の申し込みを自分から断った', visible: `${npc.name}の申し込みを断った。` });
  }
}

/** 毎日：交際前に会っている相手の時間経過（E03確定・E09・E15・E16・E18・既婚発覚・身体目的の離脱） */
export function processDatingDaily(state: GameState): void {
  // E25：関係が終わっていても、交際中でも届く
  for (const c of Object.values(state.contacts)) {
    if (c.flags.accuseDay !== state.day) continue;
    delete c.flags.accuseDay;
    const npc = state.npcs[c.npcId];
    pushPending(state, {
      kind: 'e25', npcId: c.npcId, title: '弁護士からの連絡',
      lines: [
        { who: 'narration', text: `知らない番号から電話があった。${npc.name}の代理人を名乗る弁護士だった。` },
        { who: 'them', text: `（弁護士）「${npc.name}さんは、先日の夜のことを同意のない性交だったと考えています。示談でのご解決をご検討ください」` },
        { who: 'narration', text: 'あの夜、はっきりと同意を確かめた覚えはない。その場の流れだった。' },
      ],
      choices: [
        { id: 'lawyer', label: '自分も弁護士に相談する', sub: '費用20万円' },
        { id: 'settle', label: '言われるまま示談に応じる', sub: '示談金50万円' },
        { id: 'ignore', label: '身に覚えがないので放っておく' },
      ],
    });
  }
  for (const c of Object.values(state.contacts)) {
    if (c.stage !== 'dating' && c.stage !== 'scheduled' && c.stage !== 'talking') continue;
    const npc = state.npcs[c.npcId];
    if (c.flags.e03Day === state.day) {
      endContact(state, c, { by: 'them', cause: String(c.flags.e03Reason ?? '対面後のお断り'), eventId: 'E03', base: SPEC_LOSS.E03, visible: `${npc.name}に送った「また会いたい」は、既読のまま返事が来ない。` });
      continue;
    }
    if (c.flags.e09Day === state.day && npc.purpose === 'body') {
      endContact(state, c, {
        by: 'them', cause: '真剣な好意を装った相手に関係を切られた', eventId: 'E09', base: SPEC_LOSS.E09,
        visible: `${npc.name}からの返信は日に日に短くなり、やがてLINEがつながらなくなった。`,
      });
      continue;
    }
    if (c.flags.fadeAfterAlt === state.day) {
      fadeBeforeMeeting(state, c, noteE02);
      continue;
    }
    // サクラサイト：プレイヤーが1通ごとにポイントを払ってやり取りを続け（chat.ts）、会えないまま発覚する
    if (typeof c.flags.sakuraUntil === 'number') {
      if (state.day === c.flags.sakuraUntil) {
        const paid = Number(c.flags.sakuraPaid ?? 0);
        endContact(state, c, {
          by: 'them', cause: '外部の有料サイトへ誘導された（サクラ）', eventId: 'E13', base: paid > 0 ? SPEC_LOSS.E13_FOUND : SPEC_LOSS.E13_DECLINED,
          visible: `何度約束しても${npc.name}とは会えなかった。調べると、同じ文面の相談がいくつも見つかった。使ったポイントは${paid.toLocaleString()}円。`,
        });
      }
      continue;
    }
    if (c.stage !== 'dating') continue;
    const forcedWeekly = devForce(state, `weekly:${c.npcId}`);
    // 週1回の判定（曜日をずらして決定的に）
    if (!forcedWeekly && (state.day + c.npcId.charCodeAt(c.npcId.length - 1)) % 7 !== 0) continue;
    withRng(state, (rng) => {
      if (npc.purpose === 'married' && c.meetings >= 3 && (forcedWeekly === 'married' || rng.chance(0.3))) {
        pushPending(state, {
          kind: 'married_reveal', npcId: c.npcId, title: '知ってしまったこと',
          lines: [
            { who: 'narration', text: `${npc.name}のSNSを偶然見つけた。そこには指輪と、家族旅行の写真があった。` },
            { who: 'narration', text: '土日に会えなかった理由が、ようやく分かった。' },
          ],
          choices: [{ id: 'confront', label: '問いただす' }, { id: 'leave', label: '何も言わずに区切る' }],
        });
        return;
      }
      if (isNormalPurpose(npc.purpose) && c.meetings >= 1) {
        const p = npc.purpose === 'ambiguous' ? 0.06 + (npc.popularity > 0.8 ? 0.03 : 0) : 0.025;
        if (forcedWeekly === 'e16' || (!forcedWeekly && rng.chance(p))) {
          const text = sayLines(state, npc, CHAT.chosen_other, rng);
          pushMsg(c, state.day, 'them', text);
          endContact(state, c, { by: 'them', cause: '別の本命を選ばれた', eventId: 'E16', base: SPEC_LOSS.E16, visible: `${npc.name}から「別の人と付き合うことになった」と連絡が来た。` });
          return;
        }
      }
      // E15：曖昧な関係が14日以上（2026-11-13 指示で30日ごと−8から14日ごと−6に）
      if (c.ambiguousSince !== undefined && state.day - c.ambiguousSince >= 14) {
        const last = c.lastKeepPenaltyDay ?? c.ambiguousSince;
        if (state.day - last >= 14) {
          c.lastKeepPenaltyDay = state.day;
          applyLoss(state, SPEC_LOSS.E15_PER14, 'event', `関係を決めてもらえないまま14日（${npc.name}）`, { eventId: 'E15', npcId: c.npcId });
          logEvent(state, 'E15', 'キープ状態が14日続いた', c.npcId);
          pushPending(state, {
            kind: 'e15', npcId: c.npcId, title: '「今のままがいい」',
            lines: [
              { who: 'narration', text: `${npc.name}とは${c.meetings}回会った。楽しいのに、恋人とは言ってくれない。` },
              { who: 'them', text: sayLines(state, npc, CHAT.keep, rng) },
            ],
            choices: [{ id: 'wait', label: 'もう少し待つ' }, { id: 'confirm', label: 'はっきり関係を確認する' }, { id: 'end', label: '終わりにする' }],
          });
          return;
        }
      }
      // E18：交際前から誘い・会計・調整を任され続ける
      if (npc.traits.passive && c.meetings >= 2 && !c.flags.burdenResolved) {
        const weeks = Number(c.flags.burdenWeeks ?? 0) + 1;
        c.flags.burdenWeeks = weeks;
        if (weeks % 2 === 0) {
          applyLoss(state, SPEC_LOSS.E18_PER2W, 'event', `誘い・会計・調整を任され続けた2週間（${npc.name}）`, { eventId: 'E18', npcId: c.npcId });
          logEvent(state, 'E18', '負担の偏り（交際前）', c.npcId);
        }
      }
      // 進展がないまま相手の気持ちが冷める
      if (npc.purpose === 'sincere' && c.interest < 35 && rng.chance(0.3)) {
        endContact(state, c, { by: 'them', cause: '相手の気持ちが離れた', eventId: 'E17', base: SPEC_LOSS.E17, visible: `${npc.name}から「ごめんなさい、気持ちが追いつかなくて」と連絡が来た。` });
      }
    });
  }
}

export function resolveE15(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'wait') return;
  if (choiceId === 'end') {
    endContact(state, c, { by: 'me', cause: '曖昧な関係を自分から終えた', visible: `${npc.name}との関係を自分から終えた。` });
    return;
  }
  const roll = withRng(state, (r) => r.next());
  if (npc.purpose === 'ambiguous') {
    if (roll < 0.35) {
      pushMsg(c, state.day, 'them', 'ちゃんと考えた。付き合おう');
      startRelationship(state, c);
    } else if (roll < 0.65) {
      endContact(state, c, { by: 'them', cause: '関係の確認で終わった', eventId: 'E16', base: SPEC_LOSS.E16, visible: `「実は他にも会っている人がいて…」と${npc.name}は言った。` });
    } else {
      npcSay(state, c, 'keep', { awaitMe: true });
    }
  } else {
    answerProposal(state, c, npc);
  }
}

export function resolveMarriedReveal(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  endContact(state, c, {
    by: 'them', cause: '既婚・本命がいると発覚', eventId: 'E14', base: SPEC_LOSS.E14,
    visible: choiceId === 'confront'
      ? `問いただすと、${npc.name}は「言うつもりだった」とだけ言った。関係はここで終わった。`
      : `${npc.name}の連絡先を、黙って非表示にした。`,
  });
}

/** E12の誘い（チャット経由） */
export function maybeScamPitch(state: GameState, c: Contact): boolean {
  const npc = state.npcs[c.npcId];
  if (npc.purpose !== 'scam' || c.exchanges < 3 || c.flags.scamPitched) return false;
  c.flags.scamPitched = true;
  pushScamPitch(state, c, npc);
  return true;
}
