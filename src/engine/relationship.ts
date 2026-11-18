// 交際開始と60日の維持パート（仕様v0.3 §2・§13。クリアは2026-11-03 指示で90日→60日）。
import { endContact, pushMsg } from './contact';
import { findDateDays } from './dates';
import { applyLoss, recoverOnce, seriesLoss, spend } from './life';
import { npcSay } from './messaging';
import {
  SPEC_CLEAR_DAYS, SPEC_CLEAR_REL_DATES, TUNE_TRIP, TUNE_TRIP_YEN, SPEC_FIRST_RELATIONSHIP_RECOVERY, SPEC_LOSS, SPEC_MILESTONE_RECOVERY, TUNE_VENUES, isNormalPurpose,
} from './data/rules';
import { addFeed, character, devForce, logEvent, pushPending, withRng } from './state';
import { getArea } from './data/areas';
import { dateWithWeekday } from './calendar';
import type { Choice, Contact, GameState, Npc, PendingEvent, VenueTier } from './types';

export function relDay(state: GameState, c: Contact): number {
  return c.relationship ? state.day - c.relationship.startDay : 0;
}

export function startRelationship(state: GameState, c: Contact): void {
  const npc = state.npcs[c.npcId];
  const genuine = isNormalPurpose(npc.purpose);
  c.stage = 'relationship';
  state.partnerId = c.npcId;
  state.flags.closedOthers = false;
  c.ambiguousSince = undefined;
  c.relationship = {
    startDay: state.day,
    genuine,
    health: npc.purpose === 'sincere' ? 72 : genuine ? 58 : 70,
    phaseEventsDone: [],
    agreedExclusive: false,
    burdenWeeks: 0,
    unresolvedClash: false,
    playerUsedAppDays: 0,
    // 仮置き：相性。誠実な相手でも生活や価値観が合うとは限らない
    compat: withRng(state, (rng) => npc.purpose === 'sincere' ? rng.range(0.35, 0.95) : npc.purpose === 'ambiguous' ? rng.range(0.2, 0.7) : 0.8),
  };
  if (!genuine) {
    // 偽交際はクリア（交際60日）より前に必ず決着する
    const r = withRng(state, (rng) => {
      switch (npc.purpose) {
        case 'body': return rng.int(10, 40);
        case 'married': return rng.int(20, 75);
        case 'scam': return rng.int(7, 25);
        default: return rng.int(7, 20);
      }
    });
    c.relationship.fakeResolveDay = state.day + Math.min(SPEC_CLEAR_DAYS - 5, r);
  }
  state.stats.relationships += 1;
  recoverOnce(state, 'firstRelationship', SPEC_FIRST_RELATIONSHIP_RECOVERY, '初めて交際の合意');
  logEvent(state, 'E24', '交際の合意', c.npcId);
  addFeed(state, `${npc.name}と付き合うことになった。今日が交際0日目。`, 'good', c.npcId);
  c.messages.push({ day: state.day, from: 'system', text: '交際スタート（0日目）' });
  // 付き合うことになったのを、はっきり場面で見せる（2026-11-10 指示：何の切り替えもなく交際になっていた）
  const lastThem = [...c.messages].reverse().find((m) => m.from === 'them' && m.day === state.day);
  pushPending(state, {
    kind: 'rel_start', npcId: c.npcId, title: '交際スタート',
    lines: [
      ...(lastThem ? [{ who: 'them' as const, text: lastThem.text }] : []),
      { who: 'narration', text: `${npc.name}と、正式に付き合うことになった。今日が交際0日目。` },
      { who: 'system', text: `交際してから${SPEC_CLEAR_REL_DATES}回デートすればクリア。` },
    ],
    choices: [{ id: 'ok', label: '「これからよろしくね」と返す' }],
  });
  // 「ほかの相手とのやり取り」は、交際スタートの場面を閉じてから出す（2026-11-16 修正：時刻の割り振りで先に出ていた）
}

/** 交際スタートの後：まだやり取りが残っている相手をどうするか（rel_start を閉じたときに呼ぶ） */
export function pushRelOthers(state: GameState, c: Contact): void {
  const others = Object.values(state.contacts).filter(
    (o) => o.npcId !== c.npcId && ['matched', 'talking', 'scheduled', 'dating'].includes(o.stage),
  );
  if (others.length > 0) {
    pushPending(state, {
      kind: 'rel_others', npcId: undefined, title: 'ほかの相手とのやり取り',
      lines: [{ who: 'narration', text: `まだ${others.length}人とのトークが残っている。` }],
      choices: [
        { id: 'close', label: 'ほかの相手とのやり取りを終える' },
        { id: 'keep', label: 'しばらく残しておく', sub: '比較を続けると交際に影響することがある' },
      ],
    });
  }
}

export function endRelationship(state: GameState, c: Contact, by: 'me' | 'them', why: string): void {
  const npc = state.npcs[c.npcId];
  endContact(state, c, {
    by, cause: why, eventId: 'E23', base: SPEC_LOSS.E23,
    visible: by === 'them' ? `${npc.name}から「別れたい」と伝えられた。` : `${npc.name}に別れを伝えた。`,
  });
}

function venueCost(state: GameState, npc: Npc, tier: VenueTier): number {
  const v = TUNE_VENUES[tier];
  const per = Math.round((v.perPerson[0] + v.perPerson[1]) / 2);
  // 交際中の会計：男性プレイヤーは多く出し、女性プレイヤーは出してもらうことが多い（2026-11-06）
  const exp = npc.traits.payExpectation;
  const share = state.gender === 'M' ? (exp === 'split' ? 1.2 : exp === 'more' ? 1.5 : 1.8) : (exp === 'treat' ? 0.3 : exp === 'more' ? 0.6 : 1);
  return Math.round((per * share) / 100) * 100;
}

function partnerTier(npc: Npc): VenueTier {
  return npc.traits.moneySense === 'lavish' ? 'dinner' : npc.traits.moneySense === 'frugal' ? 'cafe' : 'casual';
}

/** 毎日：交際中の相手に関する処理 */
export function processRelationshipDaily(state: GameState): void {
  const id = state.partnerId;
  if (!id) return;
  const c = state.contacts[id];
  if (!c || c.stage !== 'relationship' || !c.relationship) return;
  const rel = c.relationship;
  const npc = state.npcs[id];
  const d = relDay(state, c);

  if (!rel.genuine && rel.fakeResolveDay === state.day) {
    resolveFake(state, c, npc);
    return;
  }
  // 交際中のデートの日（カレンダーで選んだ日）
  if (c.flags.relDateDay === state.day && character(state).constraints.weekendWorkCalls && (state.day % 7 >= 5)
    && withRng(state, (r) => r.chance(0.18))) {
    // 土日に急に仕事が入った（健人・大輔）
    rel.health -= 3;
    c.flags.relDateDay = -1;
    addFeed(state, `休日出勤になり、${npc.name}とのデートをキャンセルした。`, 'bad', c.npcId);
  }
  if (c.flags.relDateDay === state.day) {
    const tier = (c.flags.relDateTier as VenueTier | undefined) ?? 'cafe';
    const cost = Number(c.flags.relDateCost ?? 0);
    const pref = rel.agreedContact ?? npc.traits.contactPref;
    spend(state, cost, 'date', `${npc.name}とのデート`, { npcId: c.npcId });
    c.meetings += 1;
    rel.health += c.flags.relDateCheap && npc.traits.moneySense === 'lavish' ? 0 : pref === 'high' ? 4 : 3;
    const trip = !!c.flags.relDateTrip;
    const dayTrip = !!c.flags.relDateDayTrip;
    const place = String(c.flags.tripPlace ?? '');
    const note = trip ? '交際中の一泊二日の旅行' : dayTrip ? `交際中の日帰り旅行（${place}）` : `交際中のデート（${TUNE_VENUES[tier].label}）`;
    c.dates.push({ day: state.day, tier, costYen: cost, outcome: 'met', notes: [note], impression: 'good' });
    addFeed(state, trip ? `${npc.name}と${place}に一泊二日の旅行に行った。` : dayTrip ? `${npc.name}と日帰りで${place}に行った。` : `${npc.name}と${TUNE_VENUES[tier].label}でデートした。`, 'good', c.npcId);
    c.flags.relDateDay = -1;
    c.flags.relDateTrip = false;
    c.flags.relDateDayTrip = false;
    // 交際後のデートの回数（3回でクリア。2026-11-18 指示）。本気の相手との泊まりの旅行はデート2回分（近道）
    const before = Number(c.flags.relDates ?? 0);
    const n = (c.flags.relDates = before + (trip && rel.genuine ? TUNE_TRIP.stayCounts : 1));
    if (trip) {
      c.flags.tripDone = true;
      if (rel.genuine) rel.health += TUNE_TRIP.health.go;
    }
    // 3回目に届いたとき、関係が固まったと分かるひと言（2026-11-18 指示）
    if (rel.genuine && before < SPEC_CLEAR_REL_DATES && n >= SPEC_CLEAR_REL_DATES) {
      const line = withRng(state, (r) => r.pick([
        'これからもよろしくね。ちゃんと大事にしたいって思ってる',
        '今度、友達に紹介してもいい？',
        'アプリ、もう消そうと思う。一緒に消さない？',
      ]));
      pushMsg(c, state.day, 'them', line);
      addFeed(state, `${npc.name}との関係が、はっきり形になった。`, 'good', c.npcId);
    }
    // ヤリ目は旅行の後に振る。ほかの偽交際も、3回目のデートより前に決着させる
    if (!rel.genuine && (npc.purpose === 'body' ? trip : n >= SPEC_CLEAR_REL_DATES - 1)) rel.fakeResolveDay = state.day + 1;
    // 1回目のデートの後、必ず一泊二日の旅行の提案がある
    if (n === 1 && !c.flags.tripOffered && state.status === 'playing') {
      c.flags.tripOffered = true;
      pushTripOffer(state, c, npc);
    }
  }
  if (d === 30) recoverOnce(state, 'milestone30', SPEC_MILESTONE_RECOVERY, '交際30日を通過');
  if (d === 60) recoverOnce(state, 'milestone60', SPEC_MILESTONE_RECOVERY, '交際60日を通過');
  if (d >= 90) return;

  // 交際中の節目の出来事は15日ごと（2026-11-13 指示。クリアが交際60日なので、以前の30日ごと＝6・36・66日目では3つ目が起きなかった）
  const phaseDays = [6, 21, 36];
  const phase = phaseDays.indexOf(d);
  if (phase >= 0 && !rel.phaseEventsDone.includes(phase)) {
    rel.phaseEventsDone.push(phase);
    pushPhaseEvent(state, c, npc, phase);
    return;
  }
  if (d > 0 && d % 7 === 3) {
    // 旅行を断ったあとは、しばらく相手から誘ってこない（2026-11-18 指示）
    if (Number(c.flags.relCoolUntil ?? -1) > state.day) {
      addFeed(state, `${npc.name}から週末の話が出なかった。旅行を断ってから、少し距離ができた気がする。`, 'neutral', c.npcId);
    } else {
      pushWeekPlan(state, c, npc);
    }
  }
  if (d > 0 && d % 7 === 5) {
    weeklyInternal(state, c, npc);
  }
}

/** 一泊二日の旅行の提案（交際後1回目のデートの後。2026-11-18 指示） */
function pushTripOffer(state: GameState, c: Contact, _npc: Npc): void {
  const place = withRng(state, (r) => r.pick(['箱根', '熱海', '鎌倉', '日光', '軽井沢', '草津']));
  pushPending(state, {
    kind: 'rel_trip', npcId: c.npcId, title: `交際${relDay(state, c)}日目：旅行の誘い`,
    lines: [{ who: 'them', text: `今日楽しかった！今度、一泊二日で${place}とか行かない？` }],
    choices: [
      { id: 'go', label: `泊まりで行く（自分の負担 約${TUNE_TRIP_YEN.toLocaleString()}円）` },
      { id: 'day', label: `日帰りならと提案する（約${TUNE_TRIP.dayTripYen.toLocaleString()}円）` },
      { id: 'no', label: 'まだ早いかなと、やんわり断る' },
    ],
    data: { place },
  });
}

function resolveFake(state: GameState, c: Contact, npc: Npc): void {
  switch (npc.purpose) {
    case 'body':
      endContact(state, c, {
        by: 'them', cause: c.flags.tripDone ? '一泊二日の旅行の後に関係を切られた' : '交際を装った相手との関係が切られた', eventId: 'E09',
        // 泊まりの後に振られるのがいちばん痛く、日帰りや断ったところで離れられるのは軽い（2026-11-18 指示）
        base: SPEC_LOSS.E09 * (c.flags.tripDone ? TUNE_TRIP.bodyLossMult.go
          : c.flags.tripChoice === 'day' || c.flags.tripChoice === 'no' ? TUNE_TRIP.bodyLossMult[c.flags.tripChoice] : 1),
        visible: c.flags.tripDone
          ? `旅行から帰った次の日から、${npc.name}の返信がそっけなくなった。数日後、「なんか違ったかも、ごめん」とだけ届いて、それきりになった。`
          : `${npc.name}からの連絡が少しずつ減り、ある日を境に既読がつかなくなった。`,
      });
      break;
    case 'married':
      pushPending(state, {
        kind: 'married_reveal', npcId: c.npcId, title: '知ってしまったこと',
        lines: [
          { who: 'narration', text: `${npc.name}のスマホに表示された通知。家族のグループ名と、子どもの写真のアイコン。` },
          { who: 'narration', text: '土日に会えなかった理由、夜に電話できなかった理由が、一本の線でつながっていく。' },
        ],
        choices: [
          { id: 'confront', label: '問いただす' },
          { id: 'leave', label: '何も言わずに区切る' },
        ],
      });
      break;
    case 'scam':
      pushScamPitch(state, c, npc);
      break;
    default:
      endContact(state, c, {
        by: 'them', cause: '交際中に連絡不能になった', eventId: 'E04', base: SPEC_LOSS.E04_RELATIONSHIP,
        visible: `${npc.name}とのLINEに既読がつかなくなった。`,
      });
  }
}

export function pushScamPitch(state: GameState, c: Contact, npc: Npc): void {
  pushPending(state, {
    kind: 'scam_pitch', npcId: c.npcId, title: '二人の将来のために',
    lines: [
      { who: 'them', text: '実は叔父に教わっている投資があって、毎月かなり増えてるの。二人の将来のために一緒に始めない？' },
      { who: 'them', text: 'まずは10万円からで大丈夫。このアプリに入金するだけだよ。' },
      { who: 'narration', text: `${npc.name}から送られてきたのは、聞いたことのない取引アプリのリンクだった。` },
    ],
    choices: [
      { id: 'send', label: '言われた金額を入金する' },
      { id: 'close', label: '送金せず、関係を閉じる' },
    ],
  });
}

function pushPhaseEvent(state: GameState, c: Contact, npc: Npc, phase: number): void {
  const ch = character(state);
  const usedApp = (state.flags.appUseSinceRelationship as number | undefined) ?? 0;
  let ev: Omit<PendingEvent, 'uid' | 'day'>;
  if (phase === 0) {
    const choices: Choice[] = [
      { id: 'agree', label: 'お互いの希望を話して決める' },
      { id: 'adapt', label: '相手の希望に合わせる' },
      { id: 'own', label: '自分のペースを優先する' },
    ];
    if (ch.datingExperience === 'なし') choices.unshift({ id: 'pace', label: '初めての交際だと伝え、ペースを相談する' });
    ev = {
      kind: 'rel_phase', npcId: c.npcId, title: `交際${relDay(state, c)}日目：連絡と会い方を決める`,
      lines: [
        { who: 'them', text: npc.traits.contactPref === 'high' ? '毎日少しでも連絡取りたいな。週末はなるべく会いたい！' : npc.traits.contactPref === 'low' ? '連絡はお互い無理のないペースがいいな。会うのは月に何回かでも大丈夫。' : '連絡は1日1回くらい？週末はどっちか会えたら嬉しい。' },
        { who: 'them', text: usedApp > 0 ? 'あと…アプリってもう退会した？まだログインしてるの見えたんだけど。' : 'アプリはもう退会しようと思ってる。そっちは？' },
      ],
      choices,
      data: { phase },
    };
  } else if (phase === 1) {
    const lines: PendingEvent['lines'] = [{ who: 'narration', text: '付き合って3週間。生活の実態が見えてくる時期。' }];
    if (ch.constraints.childcare) lines.push({ who: 'them', text: '子どもの予定って、いつ頃なら会える感じ？' });
    else if (ch.constraints.shiftWork || ch.constraints.busy) lines.push({ who: 'them', text: '最近ほとんど会えてないよね。仕事の予定、もう少し早めに教えてほしいな。' });
    else lines.push({ who: 'them', text: 'デート代とか、どうしようか。毎回だとちょっと気になってて。' });
    ev = {
      kind: 'rel_phase', npcId: c.npcId, title: `交際${relDay(state, c)}日目：生活と分担`,
      lines,
      choices: [
        { id: 'share', label: '負担と頻度を具体的に分担する' },
        { id: 'endure', label: '自分が多めに負担して合わせる' },
        { id: 'avoid', label: '話し合いを先延ばしにする' },
      ],
      data: { phase },
    };
  } else {
    ev = {
      kind: 'rel_phase', npcId: c.npcId, title: `交際${relDay(state, c)}日目：将来の話`,
      lines: [
        { who: 'them', text: npc.traits.future === 'soon' ? 'このまま続いたら、結婚とかも考えたいなって思ってる。どう思う？' : npc.traits.future === 'undecided' ? '将来のことって、正直まだよく分からないんだよね。' : 'いつかは一緒に住んだりするのかな、ってたまに考える。' },
        { who: 'narration', text: '同じ週、前に少しやり取りした相手から「久しぶり、元気？」と通知が来ていた。' },
      ],
      choices: [
        { id: 'talk', label: '将来の考えを伝え合う' },
        { id: 'tempt', label: '前の相手に返信してしまう' },
        { id: 'hold', label: '今は考えないようにする' },
      ],
      data: { phase },
    };
  }
  pushPending(state, ev);
}

function pushWeekPlan(state: GameState, c: Contact, npc: Npc): void {
  const tier = partnerTier(npc);
  const cost = venueCost(state, npc, tier);
  const cheap = venueCost(state, npc, 'cafe');
  // 誘い・調整を任せがちな相手（E18の前兆）は自分から具体的な提案をしない
  const passive = npc.traits.passive && !c.flags.burdenResolved;
  const suggestion = withRng(state, (rng) => rng.pick(passive
    ? ['週末どうする？決めてくれたら合わせるよ', 'どこでもいいよ〜任せる', '今週会えそう？場所はおまかせで']
    : [
      `今週末、${npc.hobbies[0]}の話してたところ行ってみない？`,
      '最近会えてないから、どこか行きたいな',
      '週末どうする？こっちで店調べておこうか？',
      `${TUNE_VENUES[tier].label}で行ってみたいところがあるんだけど`,
    ]));
  const choices: Choice[] = [
    { id: 'meet', label: `会う（${TUNE_VENUES[tier].label}・自分の負担 約${cost.toLocaleString()}円）` },
  ];
  if (tier !== 'cafe') choices.push({ id: 'cheap', label: `予算内のプランを提案して会う（約${cheap.toLocaleString()}円）` });
  choices.push({ id: 'call', label: '電話とメッセージで過ごす' }, { id: 'skip', label: '今週は会えないと伝える' });
  pushPending(state, {
    kind: 'rel_week', npcId: c.npcId, title: `交際${relDay(state, c)}日目：今週の過ごし方`,
    lines: [{ who: 'them', text: suggestion }],
    choices,
    data: { cost, cheap },
  });
}

function weeklyInternal(state: GameState, c: Contact, npc: Npc): void {
  const rel = c.relationship!;
  const ch = character(state);
  const forced = devForce(state, 'relweekly');
  const ended = withRng(state, (rng) => {
    // 交際中にプレイヤーがアプリを使った
    const used = (state.flags.appUseWeek as number | undefined) ?? 0;
    if (used > 0 && !forced) {
      state.flags.appUseWeek = 0;
      if (rng.chance(0.45)) {
        pushPending(state, {
          kind: 'rel_app', npcId: c.npcId, title: '「まだアプリやってるの？」',
          lines: [{ who: 'them', text: 'ねえ、昨日アプリで「オンライン」になってたよね。どういうこと？' }],
          choices: [
            { id: 'apologize', label: '謝って退会する' },
            { id: 'explain', label: '惰性で開いただけと説明する' },
            { id: 'continue', label: '比較はやめられないと言う' },
          ],
        });
        return false;
      }
    }
    // E18：誘い・会計・調整を全部任される
    if ((npc.traits.passive && !c.flags.burdenResolved && !forced) || forced === 'e18') {
      rel.burdenWeeks += 1;
      if (rel.burdenWeeks % 2 === 0 || forced === 'e18') {
        pushPending(state, {
          kind: 'e18', npcId: c.npcId, title: '気づけば全部こちらが決めている',
          lines: [
            { who: 'narration', text: '店も日程も、会計も。ここ2週間、提案するのはいつも自分だった。' },
            { who: 'them', text: 'どこでもいいよ、任せる〜' },
          ],
          choices: [
            { id: 'talk', label: '負担が偏っていると相談する' },
            { id: 'bear', label: 'このまま続ける' },
            { id: 'end', label: '関係を終える' },
          ],
        });
        return false;
      }
    }
    // E19：子ども・仕事・居住地を軽視される
    const remote = !!getArea(ch.areaId).remote;
    const hasConstraint = ch.constraints.childcare || ch.constraints.shiftWork || ch.constraints.busy || remote;
    if (forced === 'e19' || (!forced && hasConstraint && !npc.traits.acceptsConstraints && !c.flags.e19Done && rng.chance(0.35))) {
      c.flags.e19Done = true;
      const line = ch.constraints.childcare
        ? '子どもは実家に預ければいいんじゃない？もっと二人の時間がほしい'
        : ch.constraints.shiftWork ? 'シフトの仕事なんて、転職すればいいのに'
          : remote ? `${getArea(ch.areaId).name}って遠すぎない？こっちに引っ越せば？`
            : `仕事ばっかりで、${state.gender === 'M' ? '私' : '俺'}のこと後回しだよね`;
      pushPending(state, {
        kind: 'e19', npcId: c.npcId, title: '譲れない条件',
        lines: [{ who: 'them', text: line }],
        choices: [
          { id: 'discuss', label: '自分の事情を話し合う' },
          { id: 'leave', label: '条件を守って別れる' },
          { id: 'force', label: '無理をして相手に合わせる' },
        ],
      });
      return false;
    }
    // E21：交際中も相手がアプリで探索
    const e21Chance = npc.purpose === 'ambiguous' ? 0.1 : npc.purpose === 'body' || npc.purpose === 'married' ? 0.12 : 0.015;
    if (forced === 'e21' || (!forced && !c.flags.e21Done && rng.chance(e21Chance))) {
      c.flags.e21Done = true;
      pushPending(state, {
        kind: 'e21', npcId: c.npcId, title: '「オンライン」の表示',
        lines: [{ who: 'narration', text: `退会したはずの${npc.name}のアカウントが、昨夜も「オンライン」になっていた。` }],
        choices: [
          { id: 'ask', label: '誤解かもしれないので聞いてみる' },
          { id: 'reconfirm', label: '付き合っている認識を確認する' },
          { id: 'leave', label: '別れる' },
        ],
      });
      return false;
    }
    // E22：生活・金銭感覚の衝突
    const mismatch = npc.traits.moneySense === 'lavish' && character(state).monthlyBudgetYen < 50_000;
    if (forced === 'e22' || (!forced && (mismatch || rel.unresolvedClash) && !c.flags.clashResolved && rng.chance(rel.unresolvedClash ? 1 : 0.35))) {
      if (rel.unresolvedClash && forced !== 'e22') {
        const weeks = Number(c.flags.clashWeeks ?? 0) + 1;
        c.flags.clashWeeks = weeks;
        if (weeks >= 3) {
          // 3週たつと、ぶつかり合いながらも落ち着く（2026-11-03 改善：ずっと減り続けないように）
          rel.unresolvedClash = false;
          c.flags.clashResolved = true;
          rel.health -= 3;
          addFeed(state, `${npc.name}との衝突は、話し合いを重ねるうちに少しずつ落ち着いた。`, 'neutral', c.npcId);
          return false;
        }
        applyLoss(state, SPEC_LOSS.E22_WEEK, 'event', `交際中の衝突が未解消のまま1週間（${npc.name}）`, { eventId: 'E22', npcId: c.npcId });
        rel.health -= 4;
        pushPending(state, {
          kind: 'e22', npcId: c.npcId, title: 'まだ解消していない衝突',
          lines: [
            { who: 'narration', text: `${npc.name}とのお金と休日の感覚のずれが、この1週間もぎくしゃくしたまま続いた。` },
            { who: 'system', text: `変化：ライフ −${SPEC_LOSS.E22_WEEK}（未解消のまま。話し合うほど解決しやすい。3週たつと落ち着く）` },
          ],
          choices: [
            { id: 'adjust', label: 'もう一度、分担と頻度を話し合う' },
            { id: 'follow', label: '相手に合わせて支払う' },
            { id: 'postpone', label: '今週も流す' },
            { id: 'leave', label: '感覚が合わないので別れる' },
          ],
        });
        return false;
      } else {
        rel.unresolvedClash = true;
        pushPending(state, {
          kind: 'e22', npcId: c.npcId, title: 'お金と休日の感覚',
          lines: [{ who: 'them', text: '次の記念日、ちょっといいホテルのディナーにしない？毎回安いお店だと寂しいな' }],
          choices: [
            { id: 'adjust', label: '分担と頻度を調整しようと提案する' },
            { id: 'follow', label: '相手に合わせて支払う' },
            { id: 'postpone', label: '今は話し合わずに流す' },
            { id: 'leave', label: '感覚が合わないので別れる' },
          ],
        });
        return false;
      }
    }
    // 健全度の自然な変化（相性の良い組は穏やかに上向く）
    const compat = rel.compat ?? 0.7;
    const drift = npc.purpose === 'sincere' ? (compat >= 0.6 ? 2 : -1) : npc.purpose === 'ambiguous' ? -1 : 0;
    rel.health = Math.max(-10, Math.min(100, rel.health + drift));
    if (forced === 'feelings') return 'feelings';
    if (!rel.genuine) return false;
    if (rel.health < 30 && rng.chance(0.35)) return 'health';
    if (rel.health <= 0) return 'health';
    // 31〜89日：気持ちの変化（相性が低い組だけ。仮置き）
    const d = relDay(state, c);
    if (d >= 31 && compat < 0.5 && rng.chance(0.12)) return 'feelings';
    return false;
  });
  if (ended === 'health') endRelationship(state, c, 'them', '関係の不一致が改善しなかった');
  if (ended === 'feelings') endRelationship(state, c, 'them', '相手の気持ちが変わった');
  if (c.stage === 'relationship' && withRng(state, (r) => r.chance(0.5))) {
    const text = withRng(state, (r) => r.pick(['今日ちょっと疲れた〜。声聞きたい', '来週の予定どうなってる？', `この前の${npc.hobbies[0]}楽しかったね`, 'おつかれさま！今日も一日がんばったね']));
    npcSay(state, c, 'chat_normal', { awaitMe: false, text });
  }
}

/** 交際パートの選択の解決 */
export function resolveRelationshipEvent(state: GameState, ev: PendingEvent, choiceId: string): void {
  const c = ev.npcId ? state.contacts[ev.npcId] : undefined;
  const npc = ev.npcId ? state.npcs[ev.npcId] : undefined;
  if (ev.kind === 'rel_others') {
    if (choiceId === 'close') {
      for (const o of Object.values(state.contacts)) {
        if (o.npcId !== state.partnerId && ['matched', 'talking', 'scheduled', 'dating'].includes(o.stage)) {
          endContact(state, o, { by: 'me', cause: '交際が始まったため自分から終了' });
        }
      }
      state.flags.closedOthers = true; // 交際中は「さがす」「いいね」を使わない
      addFeed(state, 'ほかの相手とのやり取りを丁寧に終えた。交際中は「さがす」「いいね」は使わない。', 'neutral');
    } else {
      state.flags.keptOthers = true;
    }
    return;
  }
  if (!c || !npc || !c.relationship) return;
  const rel = c.relationship;
  switch (ev.kind) {
    case 'rel_phase': {
      const phase = Number(ev.data?.phase ?? 0);
      const fit = npc.purpose === 'sincere' ? 1 : 0.6;
      // 話し合いが通じるかは相性次第。正しく振る舞っても考え方の違いが見えることがある
      const works = withRng(state, (r) => r.chance(rel.compat ?? 0.7));
      if (phase === 0) {
        if (choiceId === 'agree' || choiceId === 'pace') {
          rel.agreedContact = npc.traits.contactPref;
          rel.agreedExclusive = true;
          if (works) {
            rel.health += Math.round((choiceId === 'pace' ? 10 : 8) * fit);
            addFeed(state, '連絡と会う頻度、アプリの扱いを二人で決めた。', 'good', c.npcId);
          } else {
            rel.health -= 10;
            addFeed(state, `話し合ったが、${npc.name}の求める連絡の頻度とはまだ距離がある。`, 'bad', c.npcId);
          }
        } else if (choiceId === 'adapt') {
          rel.health += 4;
          if (character(state).constraints.busy || character(state).constraints.childcare) c.flags.overCommitted = true;
        } else {
          rel.health += npc.traits.contactPref === 'low' ? 2 : -6;
        }
      } else if (phase === 1) {
        if (choiceId === 'share' && works) {
          rel.health += Math.round(6 * fit);
          c.flags.clashResolved = true;
          c.flags.burdenResolved = true;
          addFeed(state, '負担と会う頻度を具体的に決めた。少し肩の力が抜けた。', 'good', c.npcId);
        } else if (choiceId === 'share') {
          rel.health -= 10;
          rel.unresolvedClash = true;
          addFeed(state, '分担の話をしたが、お互いの「普通」が違うことがはっきりした。', 'bad', c.npcId);
        } else if (choiceId === 'endure') {
          rel.health += 2;
          spend(state, venueCost(state, npc, 'dinner'), 'date', `${npc.name}との交際費（多めに負担）`, { npcId: c.npcId, playerChosenHigh: true });
        } else {
          rel.health -= 5;
        }
      } else {
        if (choiceId === 'talk' && works) {
          rel.health += npc.traits.future === 'undecided' ? 1 : Math.round(6 * fit);
          addFeed(state, `${npc.name}と将来の話をした。全部は決まらなくても、同じ方向を向けている気がした。`, 'good', c.npcId);
        } else if (choiceId === 'talk') {
          rel.health -= 14;
          addFeed(state, `将来の話をしたら、${npc.name}との考え方の違いが思った以上に大きかった。`, 'bad', c.npcId);
        } else if (choiceId === 'tempt') {
          rel.health -= 15;
          state.flags.temptReplied = ((state.flags.temptReplied as number) ?? 0) + 1;
        } else {
          rel.health -= 3;
        }
      }
      break;
    }
    case 'rel_week': {
      const pref = rel.agreedContact ?? npc.traits.contactPref;
      if (choiceId === 'meet' || choiceId === 'cheap') {
        // 交際後のデートも、交際前と同じくお互いに空いている日をカレンダーから選ぶ（2026-11-07 指示）
        const cost = Number(choiceId === 'meet' ? ev.data?.cost : ev.data?.cheap);
        const tier: VenueTier = choiceId === 'meet' ? partnerTier(npc) : 'cafe';
        const days = findDateDays(state, npc, state.day, 6).filter((d) => d <= state.day + 10);
        if (days.length === 0) {
          addFeed(state, `${npc.name}と今週は予定が合わなかった。電話で話して過ごした。`, 'neutral', c.npcId);
          break;
        }
        pushPending(state, {
          kind: 'rel_pick', npcId: c.npcId, title: `交際${relDay(state, c)}日目：会う日を決める`,
          lines: [{ who: 'narration', text: `${npc.name}と${TUNE_VENUES[tier].label}で会うことにした。お互いに空いている日から選ぼう。` }],
          choices: days.map((d) => ({ id: String(d), label: dateWithWeekday(d), sub: `${d - state.day}日後` })),
          data: { cost, tier, cheap: choiceId === 'cheap' },
        });
      } else if (choiceId === 'call') {
        rel.health += pref === 'low' ? 2 : pref === 'mid' ? 0 : -3;
      } else {
        const excused = !!rel.agreedExclusive && (character(state).constraints.childcare || character(state).constraints.busy || character(state).constraints.shiftWork);
        rel.health -= excused ? 0 : pref === 'high' ? 6 : pref === 'mid' ? 3 : 1;
      }
      break;
    }
    case 'rel_trip': {
      // 返事で損得が分かれる（2026-11-18 指示。TUNE_TRIP）
      const answer = (choiceId === 'go' || choiceId === 'day' ? choiceId : 'no') as 'go' | 'day' | 'no';
      const place = String(ev.data?.place ?? '');
      c.flags.tripChoice = answer;
      c.flags.tripPlace = place;
      // ヤリ目は泊まり以外なら冷めて離れる
      if (npc.purpose === 'body' && answer !== 'go') {
        rel.fakeResolveDay = state.day + 1;
        pushMsg(c, state.day, 'them', answer === 'day' ? '日帰りかー、じゃあまた今度でいいや' : 'そっか、わかった〜');
        break;
      }
      if (answer !== 'no') {
        const all = findDateDays(state, npc, state.day, 8).filter((d) => d <= state.day + 14);
        // 泊まりは金曜か土曜の出発にする（平日に一泊二日は不自然。合わなければ全部の候補から）
        const weekend = all.filter((d) => d % 7 === 4 || d % 7 === 5);
        const days = answer === 'go' && weekend.length > 0 ? weekend : all.slice(0, 6);
        if (days.length > 0) {
          pushMsg(c, state.day, 'them', answer === 'go' ? 'やった！宿探しとくね' : 'いいね！日帰りで行こう');
          pushPending(state, {
            kind: 'rel_pick', npcId: c.npcId, title: `交際${relDay(state, c)}日目：旅行の日を決める`,
            lines: [{ who: 'narration', text: `${npc.name}と${place}に${answer === 'go' ? '一泊二日' : '日帰り'}で行くことにした。お互いに空いている日から選ぼう。` }],
            choices: days.map((d) => ({ id: String(d), label: dateWithWeekday(d), sub: `${d - state.day}日後` })),
            data: answer === 'go'
              ? { cost: TUNE_TRIP_YEN, tier: 'dinner', trip: true }
              : { cost: TUNE_TRIP.dayTripYen, tier: 'casual', dayTrip: true },
          });
          break;
        }
        addFeed(state, `${npc.name}と旅行の日程が合わなかった。`, 'neutral', c.npcId);
        pushMsg(c, state.day, 'them', 'また都合のいいときに行こうね');
        break;
      }
      // 断った：本気の相手は残念がり、しばらく誘ってこない
      rel.health += TUNE_TRIP.health.no;
      c.flags.relCoolUntil = state.day + TUNE_TRIP.coolDays;
      pushMsg(c, state.day, 'them', 'そっか、わかった〜');
      break;
    }
    case 'rel_pick': {
      const day = Number(choiceId);
      if (!Number.isFinite(day) || day <= state.day) break;
      c.flags.relDateDay = day;
      c.flags.relDateCost = Number(ev.data?.cost ?? 0);
      c.flags.relDateTier = String(ev.data?.tier ?? 'cafe');
      c.flags.relDateCheap = !!ev.data?.cheap;
      c.flags.relDateTrip = !!ev.data?.trip;
      c.flags.relDateDayTrip = !!ev.data?.dayTrip;
      pushMsg(c, state.day, 'system', `予定：${dateWithWeekday(day)}・${day - state.day}日後（${TUNE_VENUES[c.flags.relDateTier as VenueTier].label}）`);
      addFeed(state, `${npc.name}と${day - state.day}日後に会う約束をした。`, 'good', c.npcId);
      break;
    }
    case 'rel_app': {
      if (choiceId === 'apologize') rel.health -= 8;
      else if (choiceId === 'explain') rel.health -= 12;
      else rel.health -= 30;
      if (choiceId === 'apologize') state.flags.quitApp = true;
      break;
    }
    case 'e18': {
      applyLoss(state, SPEC_LOSS.E18_PER2W, 'event', `誘い・会計・調整を任され続けた2週間（${npc.name}）`, { eventId: 'E18', npcId: c.npcId });
      logEvent(state, 'E18', '負担の偏り', c.npcId);
      if (choiceId === 'talk') {
        const improves = withRng(state, (r) => r.chance(0.6));
        if (improves) {
          c.flags.burdenResolved = true;
          rel.health += 4;
          npcSay(state, c, 'chat_normal', { awaitMe: false, text: `ごめん、甘えてた。次は${state.gender === 'M' ? '私' : '俺'}が店探すね` });
        } else {
          rel.health -= 6;
        }
      } else if (choiceId === 'end') {
        endRelationship(state, c, 'me', '負担の偏りが続いたため別れた');
      }
      break;
    }
    case 'e19': {
      seriesLoss(state, c, SPEC_LOSS.E19, 'E19', `子ども・仕事・居住地を軽視された（${npc.name}）`);
      logEvent(state, 'E19', '制約の軽視', c.npcId);
      if (choiceId === 'discuss') {
        const ok = withRng(state, (r) => r.chance(0.45));
        rel.health += ok ? 2 : -12;
        if (ok) npcSay(state, c, 'chat_normal', { awaitMe: false, text: '言い方が悪かった。ちゃんと事情を考えるね' });
      } else if (choiceId === 'leave') {
        endRelationship(state, c, 'me', '自分の条件を守って別れた');
      } else {
        rel.health -= 4;
        c.flags.overCommitted = true;
        spend(state, 6000, 'date', '無理に予定を合わせるための費用（預け先・交通）', { npcId: c.npcId });
      }
      break;
    }
    case 'e21': {
      seriesLoss(state, c, SPEC_LOSS.E21, 'E21', `交際中も相手がアプリで探索していた（${npc.name}）`);
      logEvent(state, 'E21', '交際中の探索', c.npcId);
      if (choiceId === 'leave') {
        endRelationship(state, c, 'me', '交際中の探索を知って別れた');
      } else {
        const sincereish = npc.purpose === 'sincere';
        rel.health += sincereish ? 0 : -15;
        rel.agreedExclusive = sincereish || choiceId === 'reconfirm';
      }
      break;
    }
    case 'e22': {
      if (choiceId === 'adjust') {
        // 話し合いを重ねるほど解決しやすい
        const tries = Number(c.flags.clashTalks ?? 0);
        c.flags.clashTalks = tries + 1;
        const ok = withRng(state, (r) => r.chance(Math.min(0.95, (npc.purpose === 'sincere' ? 0.75 : 0.45) + tries * 0.2)));
        if (ok) {
          rel.unresolvedClash = false;
          c.flags.clashResolved = true;
          rel.health += 3;
          addFeed(state, `${npc.name}と分担と頻度を話し合い、折り合いがついた。`, 'good', c.npcId);
        } else {
          applyLoss(state, SPEC_LOSS.E22_WEEK, 'event', `交際中の生活・金銭感覚の衝突（${npc.name}）`, { eventId: 'E22', npcId: c.npcId });
          rel.unresolvedClash = true;
          rel.health -= 5;
          addFeed(state, `${npc.name}との話し合いはまとまらなかった。次はもう少し歩み寄れるかもしれない。`, 'bad', c.npcId);
        }
      } else if (choiceId === 'follow') {
        spend(state, 30000, 'date', `${npc.name}に合わせた記念日のディナー`, { npcId: c.npcId, playerChosenHigh: true });
        rel.unresolvedClash = false;
        rel.health += 2;
        c.flags.followedSpending = ((c.flags.followedSpending as number) ?? 0) + 1;
      } else if (choiceId === 'postpone') {
        rel.health -= 2;
      } else {
        endRelationship(state, c, 'me', '生活・金銭感覚が合わず別れた');
      }
      logEvent(state, 'E22', '生活・金銭感覚の衝突', c.npcId);
      break;
    }
    default:
      break;
  }
  rel.health = Math.max(-10, Math.min(100, rel.health));
  if (c.stage === 'relationship' && rel.genuine && rel.health <= 0) {
    endRelationship(state, c, 'them', '関係の不一致が改善しなかった');
  }
}

/** E12の解決（チャットでも交際中でも使う） */
export function resolveScamPitch(state: GameState, c: Contact, choiceId: string): void {
  const npc = state.npcs[c.npcId];
  if (choiceId === 'send') {
    const amount = withRng(state, (r) => r.int(5, 30)) * 10_000;
    spend(state, amount, 'special', `投資名目の送金（${npc.name}）`, { npcId: c.npcId, special: true });
    endContact(state, c, {
      by: 'them', cause: '好意を装った相手に送金した', eventId: 'E12', base: SPEC_LOSS.E12_SENT,
      visible: `出金しようとすると「手数料」を求められ、${npc.name}とは連絡が取れなくなった。`,
    });
  } else {
    endContact(state, c, {
      by: 'me', cause: '送金前に関係を閉じた', eventId: 'E12', base: SPEC_LOSS.E12_CLOSED,
      visible: `送金はせず、${npc.name}とのやり取りを終えた。好意の言葉まで嘘だったと思うと、しばらく何も手につかなかった。`,
    });
  }
}
