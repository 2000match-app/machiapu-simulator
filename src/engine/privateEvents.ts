// プライベートの出来事（2026-11-03 指示）。アプリの外の生活が、ライフ・予算・いいね・トークに影響する。
// 1〜2週間に1回ほど、人物の条件に合うものがランダムに起きる（各出来事は1周に1回）。
// 起きた時は場面（何が起きて何が変わるか）を出し、選んだ時点で効果を反映してお知らせにも残す。
// ライフは回復しない。数値は仮置き（docs/仮置き値.md）。
import { endContact, pushMsg } from './contact';
import { applyLoss, spend } from './life';
import { addFeed, character, isInRelationship, monthIndex, pushPending, withRng } from './state';
import { Rng } from './rng';
export { monthBudget } from './life';
import type { Choice, GameState, PendingEvent } from './types';

/** 出来事どうしの間隔（日）と、1日あたりの発生確率 */
/** 2026-11-09 指示（マイナスの出来事が多い）で間隔を14日→28日、確率を0.07→0.04に */
export const TUNE_PRIVATE = { minGap: 28, startDay: 4, dailyChance: 0.04 };

type Effects = NonNullable<GameState['player']['effects']>;

function effects(state: GameState): Effects {
  return (state.player.effects ??= {});
}

function until(state: GameState, key: keyof Effects): number {
  return Number(effects(state)[key] ?? -1);
}

/** 疲れてアプリを開かずに寝てしまった日か（健人・大輔の平日の夜。2026-11-11 指示） */
export function isTiredDay(state: GameState): boolean {
  return state.day === until(state, 'tiredDay');
}

/**
 * 毎日の始め：今日が「疲れて寝てしまう日」かを決める。週ごとに平日から perWeek 日を選ぶ（シードと週で決まり、他の乱数に影響しない）。
 * デートの日・交際中・アプリを閉じている日は起きない。
 */
export function tiredNightDaily(state: GameState): void {
  const t = character(state).tiredNights;
  if (!t || state.flags.noPrivateEvents || isInRelationship(state)) return;
  const week = Math.floor(state.day / 7);
  const r = Rng.fromSeed(state.seed, 'tired-night', week);
  const days = r.shuffle([0, 1, 2, 3, 4]).slice(0, t.perWeek);
  if (!days.includes(state.day % 7)) return;
  if (unavailableReason(state)) return;
  if (Object.values(state.contacts).some((c) => c.nextDate?.day === state.day)) return;
  const why = r.pick(t.reasons);
  effects(state).tiredDay = state.day;
  effects(state).tiredWhy = why;
  addFeed(state, `${why}。`, 'neutral');
  // 2026-11-13：場面は出さず、その日の夜は「残業・飲み会（帰って寝落ち）」の予定として時間が進む（clock.ts）
}

/** いまアプリを触れない（体調不良・子どもの看病・アプリを閉じている）。寝落ちの日は夜の予定として扱う（2026-11-13） */
export function unavailableReason(state: GameState): string | null {
  if (state.day <= until(state, 'sickUntil')) return '体調を崩していて、アプリを開く余裕がない';
  if (state.day <= until(state, 'kidUntil')) return '子どもの看病で、アプリを開く余裕がない';
  if (state.day <= until(state, 'closedUntil')) return 'アプリを閉じている';
  return null;
}

/** 体調不良・看病などでアプリも使えない間のデートは、自分からキャンセルする（2026-11-11 指示：熱の3日間にデートできていた） */
export function cancelDatesUntil(state: GameState, lastDay: number, message: string): number {
  let n = 0;
  for (const c of Object.values(state.contacts)) {
    if (!c.nextDate || c.nextDate.day > lastDay || c.stage === 'ended') continue;
    pushMsg(c, state.day, 'me', message);
    c.nextDate = undefined;
    if (c.stage === 'scheduled') c.stage = c.meetings > 0 ? 'dating' : 'talking';
    c.interest -= 10;
    n += 1;
  }
  return n;
}

/** その日のいいねの上限（繁忙期は2回、触れない日は0回） */
export function likesForToday(state: GameState, base: number): number {
  if (unavailableReason(state)) return 0;
  if (state.day <= until(state, 'busyUntil')) return Math.min(base, 2);
  return base;
}

/** 画面上部に出す「いま効いている状態」 */
export function activeStatuses(state: GameState): { label: string; tone: 'bad' | 'neutral' | 'good' }[] {
  const out: { label: string; tone: 'bad' | 'neutral' | 'good' }[] = [];
  const left = (k: keyof Effects) => until(state, k) - state.day + 1;
  if (state.day <= until(state, 'busyUntil')) out.push({ label: `繁忙期 あと${left('busyUntil')}日（毎日残業）`, tone: 'bad' });
  if (state.day <= until(state, 'sickUntil')) out.push({ label: `体調不良 あと${left('sickUntil')}日（アプリを使えない）`, tone: 'bad' });
  if (state.day <= until(state, 'kidUntil')) out.push({ label: `子どもの看病 あと${left('kidUntil')}日`, tone: 'bad' });
  if (isTiredDay(state)) out.push({ label: `今日は${effects(state).tiredWhy}（アプリを使えない）`, tone: 'neutral' });
  if (state.day <= until(state, 'closedUntil')) out.push({ label: `アプリを閉じている あと${left('closedUntil')}日`, tone: 'neutral' });
  if (state.day <= until(state, 'anxiousUntil')) out.push({ label: `焦り あと${left('anxiousUntil')}日（断られると痛い）`, tone: 'bad' });
  if (state.day <= until(state, 'seasonUntil')) out.push({ label: `年末の焦り あと${left('seasonUntil')}日`, tone: 'bad' });
  const adj = state.player.budgetAdjust;
  if (adj && adj.month === monthIndex(state.day)) out.push({ label: `今月の予算 ${adj.yen > 0 ? '+' : ''}${(adj.yen / 10_000).toFixed(adj.yen % 10_000 ? 1 : 0)}万円`, tone: adj.yen > 0 ? 'good' : 'bad' });
  return out;
}

interface Def {
  id: string;
  title: string;
  /** 起きてよいか（人物の条件） */
  ok?: (state: GameState) => boolean;
  lines: (state: GameState) => PendingEvent['lines'];
  choices: Choice[];
  resolve: (state: GameState, choiceId: string) => void;
}

const sys = (text: string) => ({ who: 'system' as const, text });
const nar = (text: string) => ({ who: 'narration' as const, text });

function loss(state: GameState, n: number, note: string): void {
  applyLoss(state, n, 'event', note);
}

const DEFS: Def[] = [
  {
    id: 'wedding', title: '友人の結婚式の招待状',
    ok: (s) => s.characterId !== 'F03', // 美咲には人物固有の招待状がある
    lines: () => [nar('学生時代の友人から、結婚式の招待状が届いた。「来てくれたら嬉しい！」と手書きの一言。'), sys('変化：ライフ −20／ご祝儀 30,000円（今月の支出）')],
    choices: [{ id: 'ok', label: 'おめでとうと返事を出す' }],
    resolve: (s) => {
      loss(s, 20, '友人の結婚式の招待状が届いた');
      spend(s, 30_000, 'life', '友人の結婚式のご祝儀');
      addFeed(s, '友人の結婚式の招待状が届いた。ご祝儀30,000円。ライフ −20。', 'bad');
    },
  },
  {
    id: 'busy', title: '仕事が繁忙期に入った',
    lines: () => [nar('大きな案件が重なり、しばらく終電近くまで仕事が続きそうだ。'), sys('変化：10日間、毎日21:30まで残業（アプリを開けない）／返信が遅れ、やり取り中の誰か1人とのトークが途切れる')],
    choices: [{ id: 'ok', label: '仕方ない' }],
    resolve: (s) => {
      effects(s).busyUntil = s.day + 9;
      const talking = Object.values(s.contacts).filter((c) => ['matched', 'talking', 'dating'].includes(c.stage) && c.stage !== 'relationship' && s.partnerId !== c.npcId);
      if (talking.length > 0) {
        const c = withRng(s, (r) => r.pick(talking));
        const npc = s.npcs[c.npcId];
        pushMsg(c, s.day, 'them', withRng(s, (r) => r.pick(['忙しそうですね。落ち着いたらまた…', 'お仕事大変そうだね。無理しないでね'])));
        endContact(s, c, { by: 'them', cause: '仕事が忙しく返信できないうちに途切れた', visible: `返信できないうちに、${npc.name}とのやり取りが途切れた。` });
        loss(s, 4, `仕事が忙しく、${npc.name}とのやり取りが途切れた`);
        addFeed(s, `繁忙期に入った（10日間、毎日残業）。返信できないうちに${npc.name}とのやり取りが途切れた。`, 'bad');
      } else {
        addFeed(s, '繁忙期に入った（10日間、毎日残業）。', 'bad');
      }
    },
  },
  {
    id: 'sick', title: '体調を崩した',
    lines: () => [nar('朝から熱っぽい。今日はベッドから起き上がれそうにない。'), sys('変化：3日間アプリを使えない（いいね・返信ができない）／返事を待たせた相手は気持ちが冷める／ライフ −5')],
    choices: [{ id: 'ok', label: '休む' }],
    resolve: (s) => {
      effects(s).sickUntil = s.day + 2;
      for (const c of Object.values(s.contacts)) if (c.awaitingMe && c.stage !== 'ended') c.interest -= 8;
      const canceled = cancelDatesUntil(s, s.day + 2, 'ごめんなさい、熱が出てしまって…今回の約束はキャンセルさせてください。');
      if (canceled > 0) addFeed(s, `熱が出たので、3日以内のデート${canceled}件をキャンセルした。`, 'bad');
      loss(s, 5, '体調を崩した');
      addFeed(s, '体調を崩して3日間アプリを使えない。返事を待たせた相手の気持ちが冷めた。ライフ −5。', 'bad');
    },
  },
  {
    id: 'kid_fever', title: '子どもが熱を出した',
    ok: (s) => character(s).children > 0,
    lines: () => [nar('保育園から電話。子どもが熱を出したので迎えに来てほしいとのこと。'), sys('変化：2日間アプリを使えない／3日以内のデートは自分からキャンセル（相手の気持ちが冷める）／ライフ −5')],
    choices: [{ id: 'ok', label: '迎えに行く' }],
    resolve: (s) => {
      effects(s).kidUntil = s.day + 1;
      for (const c of Object.values(s.contacts)) {
        if (c.nextDate && c.nextDate.day - s.day <= 3) {
          pushMsg(c, s.day, 'me', 'ごめんなさい、子どもが熱を出してしまって…今回の約束はキャンセルさせてください。');
          c.nextDate = undefined;
          if (c.stage === 'scheduled') c.stage = c.meetings > 0 ? 'dating' : 'talking';
          c.interest -= 15;
        }
      }
      loss(s, 5, '子どもが熱を出した');
      addFeed(s, '子どもの看病で2日間アプリを使えない。近いデートはキャンセルした。ライフ −5。', 'bad');
    },
  },
  {
    id: 'parents', title: '親からの電話',
    lines: (s) => [nar('母から電話。「それで、いい人はいないの？」近所の誰それが結婚した話が続く。'), sys(s.gender === 'F' ? '変化：ライフ −8／交際開始の希望期限が1か月早まる' : '変化：ライフ −8')],
    choices: [{ id: 'ok', label: '「そのうちね」と切る' }],
    resolve: (s) => {
      loss(s, 8, '親から「いい人いないの？」と聞かれた');
      if (s.gender === 'F') s.player.deadlineMonths -= 1;
      addFeed(s, `親から「いい人いないの？」と言われた。ライフ −8${s.gender === 'F' ? '、希望期限が1か月早まった' : ''}。`, 'bad');
    },
  },
  {
    id: 'friend_engaged', title: '友人の婚約',
    lines: () => [nar('飲み会で、仲の良い友人が婚約したと報告した。みんなで乾杯しながら、なぜか自分だけ取り残された気がする。'), sys('変化：ライフ −8／7日間、断られたり途切れたりした時のダメージ +3')],
    choices: [{ id: 'ok', label: 'おめでとうと言う' }],
    resolve: (s) => {
      loss(s, 8, '友人が婚約した');
      effects(s).anxiousUntil = s.day + 6;
      addFeed(s, '友人が婚約した。ライフ −8。しばらくは断られると余計にこたえる。', 'bad');
    },
  },
  {
    id: 'expense', title: '急な出費',
    lines: () => [nar('洗濯機が動かなくなった。修理より買い替えのほうが安いと言われた。'), sys('変化：今月の支出 +30,000円（予算を超えるとライフが減る）')],
    choices: [{ id: 'ok', label: '買い替える' }],
    resolve: (s) => {
      spend(s, 30_000, 'life', '洗濯機の買い替え');
      addFeed(s, '洗濯機が壊れて買い替えた。今月の支出 +30,000円。', 'bad');
    },
  },
  {
    id: 'bonus', title: 'ボーナスが出た',
    lines: () => [nar('思っていたより少しだけ多いボーナスが出た。'), sys('変化：今月の活動予算 +20,000円（ライフは回復しない）')],
    choices: [{ id: 'ok', label: 'デート代に回す' }],
    resolve: (s) => {
      s.player.budgetAdjust = { month: monthIndex(s.day), yen: 20_000 };
      addFeed(s, 'ボーナスが出た。今月の活動予算 +20,000円。', 'good');
    },
  },
  {
    id: 'birthday', title: '一人で迎える誕生日',
    lines: () => [nar('今日は誕生日。届いたのは家族のスタンプと、ショップのクーポンメールだけだった。'), sys('変化：ライフ −8／年齢が1つ上がる（相手の希望年齢から外れる人が出る）')],
    choices: [{ id: 'ok', label: 'コンビニのケーキを買う' }],
    resolve: (s) => {
      s.player.age += 1;
      loss(s, 8, '一人で誕生日を迎えた');
      addFeed(s, `一人で誕生日を迎え、${s.player.age}歳になった。ライフ −8。`, 'bad');
    },
  },
  {
    id: 'season', title: '年末が近づいてきた',
    ok: (s) => !isInRelationship(s),
    lines: () => [nar('街にイルミネーションが灯り始めた。「クリスマスどうする？」という会話があちこちから聞こえる。'), sys('変化：ライフ −8／14日間、停滞の週のダメージ +3')],
    choices: [{ id: 'ok', label: '気にしないようにする' }],
    resolve: (s) => {
      loss(s, 8, '年末が近づき、焦りが出てきた');
      effects(s).seasonUntil = s.day + 13;
      addFeed(s, '年末が近づき、焦りが出てきた。ライフ −8。', 'bad');
    },
  },
  {
    id: 'ex_married', title: '元恋人の結婚',
    lines: () => [nar('SNSを開くと、元恋人の結婚報告が流れてきた。式場の写真に「いいね」が並んでいる。'), sys('変化：ライフ −10')],
    choices: [{ id: 'ok', label: '画面を閉じる' }],
    resolve: (s) => {
      loss(s, 10, '元恋人の結婚を知った');
      addFeed(s, '元恋人の結婚をSNSで知った。ライフ −10。', 'bad');
    },
  },
  {
    id: 'goukon', title: '合コンの誘い',
    lines: () => [nar('同僚から「人数が足りないから来てくれない？」と合コンに誘われた。'), sys('行く：会費6,000円・その日は疲れる（ライフ −4）。断る：変化なし')],
    choices: [{ id: 'go', label: '行ってみる' }, { id: 'no', label: '今回は断る' }],
    resolve: (s, choiceId) => {
      if (choiceId !== 'go') {
        addFeed(s, '合コンの誘いを断った。', 'neutral');
        return;
      }
      spend(s, 6_000, 'life', '合コンの会費');
      loss(s, 4, '合コンに参加して疲れた');
      const met = withRng(s, (r) => r.chance(0.1));
      addFeed(s, met ? '合コンで連絡先を交換したが、2、3回やり取りして終わった。会費6,000円、ライフ −4。' : '合コンは盛り上がらなかった。会費6,000円、ライフ −4。', 'bad');
    },
  },
  {
    id: 'fee_up', title: 'アプリの料金改定',
    ok: (s) => s.gender === 'M',
    lines: () => [nar('アプリからお知らせ。「サービス向上のため、有料会員の料金を改定します」'), sys('変化：有料会員が 4,000円 → 4,500円／30日（次の加入から）')],
    choices: [{ id: 'ok', label: '確認した' }],
    resolve: (s) => {
      s.player.feeYen = 4_500;
      addFeed(s, '有料会員の料金が4,500円／30日に上がった。', 'bad');
    },
  },
  {
    id: 'quit_night', title: '「もう退会しようか」と思う夜',
    lines: () => [nar('寝る前にアプリを開いて、何も変わらない画面を眺めた。「もう退会しようかな」とつぶやく。'), sys('閉じる：7日間アプリを使えない（ライフは回復しないが、その週は停滞を数えない）。続ける：変化なし')],
    choices: [{ id: 'keep', label: '続ける' }, { id: 'close', label: '1週間アプリを閉じる' }],
    resolve: (s, choiceId) => {
      if (choiceId === 'close') {
        effects(s).closedUntil = s.day + 6;
        addFeed(s, '1週間アプリを閉じることにした。', 'neutral');
      } else {
        addFeed(s, 'もう少しだけ続けることにした。', 'neutral');
      }
    },
  },
];

export const PRIVATE_EVENT_IDS = DEFS.map((d) => d.id);

/** 毎日：条件に合う出来事を、間隔を空けてランダムに1つ起こす */
export function privateEventsDaily(state: GameState, force?: string): void {
  const done = new Set(state.player.privateEventsDone ?? []);
  const last = state.player.lastPrivateEventDay ?? -999;
  if (!force) {
    if (state.flags.noPrivateEvents) return; // 開発用の再現ケースでは起こさない
    if (state.day < TUNE_PRIVATE.startDay || state.day - last < TUNE_PRIVATE.minGap || state.pending.length > 0) return;
    if (!withRng(state, (r) => r.chance(TUNE_PRIVATE.dailyChance))) return;
  }
  const pool = DEFS.filter((d) => (force ? d.id === force : !done.has(d.id) && (d.ok?.(state) ?? true)));
  if (pool.length === 0) return;
  const def = withRng(state, (r) => r.pick(pool));
  state.player.privateEventsDone = [...done, def.id];
  state.player.lastPrivateEventDay = state.day;
  pushPending(state, { kind: `pe_${def.id}`, title: def.title, lines: def.lines(state), choices: def.choices });
}

/**
 * 健人・大輔の持ち株（2026-11-18 指示）：ときどき値動きの通知が届き、その月のデートに使える予算が増減する。
 * 1日あたり約3割で、評価額の変化は −5万〜＋5万円（月の予算の増減は、その半分。予算は1万円より下がらない）
 */
export const STOCK_HOLDERS = ['M01', 'M07'];
export function stockDaily(state: GameState): void {
  if (!STOCK_HOLDERS.includes(state.characterId)) return;
  const r = Rng.fromSeed(state.seed, 'stock', state.day);
  if (!r.chance(0.3)) return;
  const pct = Math.round((r.normal(0, 2.2)) * 10) / 10;
  if (pct === 0) return;
  const holding = state.characterId === 'M01' ? 2_400_000 : 1_200_000;
  const yen = Math.round((holding * pct) / 100 / 1000) * 1000;
  const m = monthIndex(state.day);
  const cur = state.player.budgetAdjust && state.player.budgetAdjust.month === m ? state.player.budgetAdjust.yen : 0;
  const base = character(state).monthlyBudgetYen;
  const next = Math.max(10_000 - base, cur + Math.round(yen / 2 / 1000) * 1000);
  state.player.budgetAdjust = { month: m, yen: next };
  state.flags.stockNote = `${state.day}|${pct > 0 ? '+' : ''}${pct}%|${yen > 0 ? '+' : ''}${yen.toLocaleString()}円`;
  addFeed(state, `持ち株が${pct > 0 ? '上がった' : '下がった'}（${pct > 0 ? '+' : ''}${pct}%、評価額 ${yen > 0 ? '+' : ''}${yen.toLocaleString()}円）。今月のデートに使える予算が${yen > 0 ? '増えた' : '減った'}。`, yen > 0 ? 'good' : 'bad');
}

export function resolvePrivateEvent(state: GameState, kind: string, choiceId: string): boolean {
  const def = DEFS.find((d) => `pe_${d.id}` === kind);
  if (!def) return false;
  def.resolve(state, choiceId);
  return true;
}
