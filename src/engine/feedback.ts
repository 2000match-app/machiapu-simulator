// 結果画面のフィードバック（仕様v0.3 §14）。
// 表示順：失敗タイプ → 事実 → 自分で変更できた選択 → 相手や運による要因 → 次周の具体的な一手（最大3件）。
// 犯罪・欺瞞が主因なら先に示す。「高望み」は試行数・人気集中・相互条件・成立率の条件を満たす時だけ。
import { getCharacter } from './data/characters';
import { EVENTS } from './data/events';
import { SPEC_CLEAR_DAYS } from './data/rules';
import { yenLabel } from './life';
import { estimateCandidates } from './npc';
import { PREFECTURES } from './data/areas';
import type { FeedbackItem, GameState, ResultSummary } from './types';

const DECEPTION_IDS = new Set(EVENTS.filter((e) => e.deception || e.crime).map((e) => e.id));

interface Candidate extends FeedbackItem {
  weight: number;
  suggestion?: string;
  choice?: string;
  external?: string;
}

function sumLoss(state: GameState, pred: (e: GameState['ledger'][number]) => boolean): number {
  return state.ledger.filter((e) => e.delta < 0 && pred(e)).reduce((s, e) => s - e.delta, 0);
}

export function analyze(state: GameState): Candidate[] {
  const ch = getCharacter(state.characterId);
  const s = state.stats;
  const out: Candidate[] = [];
  const contacts = Object.values(state.contacts);
  const months = Math.max(1, Math.round(state.day / 30));

  // 相手の欺瞞・犯罪被害（会う前・送金前に断れたものは「被害」ではなく回避として扱う）
  const AVOIDED = /会う前に断った|誘導を断った|送金前に関係を閉じた|自分から見送った/;
  const deceptionLoss = sumLoss(state, (e) => !!e.eventId && DECEPTION_IDS.has(e.eventId) && !AVOIDED.test(e.note));
  const seenNpc = new Set<string>();
  const deceptionEvents = state.eventLog.filter((e) => {
    if (!DECEPTION_IDS.has(e.eventId) || AVOIDED.test(e.note)) return false;
    const k = `${e.npcId}:${e.eventId}`;
    if (seenNpc.has(k)) return false;
    seenNpc.add(k);
    return true;
  });
  if (deceptionEvents.length > 0) {
    const crime = deceptionEvents.some((e) => e.eventId === 'E10' || e.eventId === 'E12');
    out.push({
      type: 'deception',
      title: crime ? '相手の欺瞞・犯罪被害' : '相手の目的の偽装',
      facts: deceptionEvents.map((e) => `${e.day}日目：${e.note}`),
      weight: deceptionLoss + (crime ? 20 : 0),
      external: '相手が関係の目的を偽っていました。被害そのものを、あなたの高望みや容姿のせいにはできません。',
      suggestion: '早いLINE移行・外部サイトへの誘導・高額店の指定・投資の話が出たら、一度立ち止まる',
    });
  }

  // 高望みで機会損失
  const sentMutualOk = contacts.filter((c) => c.sentLikeDay !== undefined && !c.flags.prefMismatch).length;
  const topShare = s.likesSent > 0 ? s.likesSentTopPopular / s.likesSent : 0;
  const matchRate = s.likesSent > 0 ? s.likesSentMatched / s.likesSent : 0;
  const currentCandidates = estimateCandidates(ch, state.player.age, state.player.prefs);
  const relaxGain = estimateCandidates(ch, state.player.age, { ...state.player.prefs, ageMin: state.player.prefs.ageMin - 2, ageMax: state.player.prefs.ageMax + 2, prefectures: [...PREFECTURES] })
    - currentCandidates;
  const mutualFew = (s.likesSent > 0 && sentMutualOk / s.likesSent < 0.6) || currentCandidates < 300;
  if (s.likesSent >= 50 && topShare >= 0.8 && matchRate < 0.03 && mutualFew && relaxGain > 0) {
    out.push({
      type: 'highAim',
      title: '高望みで機会損失',
      facts: [`いいね${s.likesSent}件のうち${Math.round(topShare * 100)}%が人気上位10%の相手`, `送信からの成立は${(matchRate * 100).toFixed(1)}%`, `条件を緩めると候補が約${relaxGain.toLocaleString()}人増える状態だった`],
      weight: sumLoss(state, (e) => e.category === 'weekly'),
      choice: '人気層だけを狙い、相手から選ばれる条件の確認が不足していました。',
      suggestion: '希望年齢・年収の条件か、見た目で選ぶ基準のどれか1つを見直す',
    });
  }

  // 条件を重ねすぎ
  if (s.strictFilterDays >= 30 && s.candidateShortageDays >= 30) {
    out.push({
      type: 'tooStrict',
      title: '条件を重ねすぎ',
      facts: [`自分の条件に残る候補が探索対象の5%未満の状態が${s.strictFilterDays}日`, `候補不足の日が${s.candidateShortageDays}日`],
      weight: sumLoss(state, (e) => e.category === 'weekly' || e.category === 'monthly') * 0.6,
      choice: '年齢・年収・身長・居住地などの条件を重ね、会う前に候補をほとんど消していました。',
      suggestion: '条件を1つだけ緩め、候補数がどれだけ増えるかを検索画面で確かめる',
    });
  }

  // 出費先行
  const over15 = s.monthlySpend.filter((m) => m.budget > 0 && m.spend > m.budget * 1.5).length;
  const normalSpend = state.money.filter((m) => !m.special).reduce((a, m) => a + m.yen, 0);
  const highChosen = state.money.filter((m) => m.playerChosenHigh && !m.special).reduce((a, m) => a + m.yen, 0);
  if (over15 >= 2 && s.relationships === 0 && normalSpend > 0 && highChosen / normalSpend >= 0.25) {
    out.push({
      type: 'overspend',
      title: '出費先行',
      facts: [`予算の1.5倍を超えた月が${over15}回`, `自分で選んだ高額支出が${yenLabel(highChosen)}（支出の${Math.round((highChosen / normalSpend) * 100)}%）`],
      weight: sumLoss(state, (e) => e.category === 'budget'),
      choice: '好意を確かめる前に支払いを増やしすぎました。高い店や贈り物は交際の意思を保証しません。',
      suggestion: '初回の予算を決め、カフェや気軽な店から会う',
    });
  }

  // 少ない反応に賭けすぎ
  const totalDateSpend = state.money.filter((m) => !m.special && m.npcId).reduce((a, m) => a + m.yen, 0);
  const heavy = contacts.find((c) => c.endedBy === 'them' && c.warningSignDay !== undefined && (c.endedDay ?? state.day) - c.warningSignDay >= 14
    && totalDateSpend > 0 && c.spentYen / totalDateSpend >= 0.5);
  if (heavy) {
    out.push({
      type: 'overInvest',
      title: '少ない反応に賭けすぎ',
      facts: [`${state.npcs[heavy.npcId]?.name ?? '一人の相手'}に支出の${Math.round((heavy.spentYen / totalDateSpend) * 100)}%が集中`, `気になるサインが見えてから${(heavy.endedDay ?? state.day) - (heavy.warningSignDay ?? 0)}日続けた`],
      weight: heavy.series.maxLoss,
      choice: 'その人を失う怖さから、自分の条件を何度も後回しにしていました。',
      suggestion: '無返信や目的の食い違いが見えたら、期限を決めて確認する',
    });
  }

  // 連投
  const maxFollow = Number(state.flags.maxFollowUps7 ?? 0);
  if (maxFollow >= 3) {
    out.push({
      type: 'spam',
      title: '連投で負担を増やした',
      facts: [`返答がない同じ相手へ7日間に${maxFollow}回確認を送った`],
      weight: 8,
      choice: '返事を得ようと送信を増やしましたが、相手の気持ちは操作できません。',
      suggestion: '返事がない相手への確認は1回までにして区切る',
    });
  }

  // 比較して時間切れ：互いに前向きだった相手に、自分から交際の確認をしないまま終わった場合だけ
  const mutual = contacts.filter((c) => c.postDateDecision === 'continue' && c.playerWantsMore);
  const lostMutual = mutual.filter((c) => c.stage === 'ended' && !c.relationship && !c.flags.playerProposed && c.endedBy === 'them');
  if (mutual.length >= 2 && s.relationships === 0 && lostMutual.length >= 2) {
    out.push({
      type: 'comparison',
      title: '比較して時間切れ',
      facts: [`互いに前向きだった相手が${mutual.length}人いたが、そのうち${lostMutual.length}人とは交際の確認をしないまま終わった`],
      weight: lostMutual.reduce((a, c) => a + c.series.maxLoss, 0),
      choice: 'もっと良い人を探す間に、関係を深める時間を使えませんでした。',
      suggestion: '前向きな相手がいる時は、再会と関係の確認を先延ばしにしない',
    });
  }

  // 曖昧な関係に時間を使いすぎ
  const amb = contacts.find((c) => c.ambiguousSince !== undefined && ((c.endedDay ?? state.day) - c.ambiguousSince) >= 60 && !c.relationship);
  if (amb) {
    out.push({
      type: 'ambiguous',
      title: '曖昧な関係に時間を使いすぎ',
      facts: [`${state.npcs[amb.npcId]?.name ?? '相手'}と恋人の合意がないまま${(amb.endedDay ?? state.day) - (amb.ambiguousSince ?? 0)}日`],
      weight: sumLoss(state, (e) => e.eventId === 'E15') + amb.series.maxLoss,
      choice: '会えていることを進展と数え、交際の意思を確かめないまま時間が過ぎました。',
      suggestion: '曖昧な関係は30日を目安に確認する',
    });
  }

  // 顔写真なし：対面に判断が集中
  const noPhotoStart = !ch.photoInitiallyVisible;
  if (noPhotoStart && s.faceUnknownFirstDates >= 2 && s.appearanceEndings >= 1) {
    out.push({
      type: 'noPhotoAfterMeeting',
      title: '顔写真なしで対面に判断が集中',
      facts: [`顔を知らない相手との初回対面が${s.faceUnknownFirstDates}回`, `そのうち外見の相性による終了（この周回の内部判定）が${s.appearanceEndings}回`],
      weight: s.appearanceEndings * 10,
      choice: '会うまで容姿の相性が分からず、対面した後に断られる結果が重なりました。',
      suggestion: state.player.photoVisible ? undefined : '14日経過後に顔写真をプロフィールへ載せる（マッチ数は減る場合もあるが、会ってからの損失を減らせる可能性がある）',
    });
  }
  if (noPhotoStart && s.photoRequestDrops >= 2) {
    out.push({
      type: 'noPhotoBeforeMeeting',
      title: '顔写真なしで会う前に止まる',
      facts: [`顔写真を求めた相手が会う前に離れた記録が${s.photoRequestDrops}件`],
      weight: s.photoRequestDrops * 3,
      choice: '顔が分からない相手とは会わないという候補が多く、会話から対面へ進めませんでした。',
      suggestion: state.player.photoVisible ? undefined : '14日経過後に顔写真をプロフィールへ載せる',
    });
  }

  // 生活条件の不一致
  const lifeLoss = sumLoss(state, (e) => e.eventId === 'E19' || e.eventId === 'E22' || e.eventId === 'E18');
  const scheduleFails = contacts.reduce((a, c) => a + Number(c.flags.scheduleFails ?? 0), 0);
  if (lifeLoss >= 15 || scheduleFails >= 4) {
    out.push({
      type: 'lifestyle',
      title: '生活条件の不一致',
      facts: [lifeLoss > 0 ? `仕事・子ども・費用の衝突による損失 −${lifeLoss}` : '', scheduleFails > 0 ? `日程が合わなかった回数 ${scheduleFails}` : ''].filter(Boolean),
      weight: lifeLoss + scheduleFails * 2,
      external: '魅力の不足ではなく、続けられる生活条件が揃いませんでした。',
      suggestion: '育児・勤務・予算の条件を最初のやり取りで伝える',
    });
  }

  if (out.length === 0 || (out.length === 1 && out[0].type === 'deception' && deceptionLoss < 20)) {
    const weeklyLoss = sumLoss(state, (e) => e.category === 'weekly');
    const sentIds = contacts.filter((c) => c.sentLikeDay !== undefined);
    const mismatchShare = sentIds.length > 0 ? sentIds.filter((c) => c.flags.prefMismatch).length / sentIds.length : 0;
    const facts = [`恋愛目的の相手との初回対面${s.firstDates}回（自分から終えたものを除く）のうち、相手から再会を断られたのは${s.firstDateRejections}回`];
    void months;
    if (weeklyLoss > 0) facts.push(`送ったいいねやメッセージに反応がなかった週のライフ消耗 −${weeklyLoss}`);
    if (mismatchShare >= 0.3 && sentIds.length >= 20) facts.push(`送ったいいねの${Math.round(mismatchShare * 100)}%は、相手の希望条件（年齢・年収・子ども・学歴）に入っていない相手だった`);
    out.push({
      type: 'luck',
      title: '不運・相互の好みの不一致',
      facts,
      weight: 1,
      external: '今回の候補とは相互に選び合う関係が成立しませんでした。結果だけで選び方が誤りだったとは言えません。',
      suggestion: mismatchShare >= 0.3 && sentIds.length >= 20
        ? '相手のプロフィールの「相手の希望」に自分が入っている人へ送る'
        : weeklyLoss >= 30 && state.recovery.restsUsed < 3
          ? '反応がない週が続いたら、7日間の休息を挟む'
          : '休息を挟みながら、相互に反応のある相手との会話を続ける',
    });
  }
  return out;
}

export function buildResult(state: GameState): ResultSummary {
  const ch = getCharacter(state.characterId);
  const lossByCategory: Record<string, number> = {};
  const lossByEvent: Record<string, number> = {};
  for (const e of state.ledger) {
    if (e.delta >= 0) continue;
    lossByCategory[e.category] = (lossByCategory[e.category] ?? 0) - e.delta;
    const key = e.eventId ?? e.category;
    lossByEvent[key] = (lossByEvent[key] ?? 0) - e.delta;
  }
  const totalSpend = state.money.reduce((a, m) => a + m.yen, 0);
  const specialLoss = state.money.filter((m) => m.special).reduce((a, m) => a + m.yen, 0);

  if (state.status === 'cleared') {
    const npc = state.partnerId ? state.npcs[state.partnerId] : undefined;
    return {
      outcome: 'cleared', day: state.day, partnerId: state.partnerId, totalSpend, specialLoss, lossByCategory, lossByEvent,
      secondary: [], playerChoices: [], externalFactors: [], suggestions: [],
      headline: `${npc?.name ?? '相手'}との交際が${SPEC_CLEAR_DAYS}日続きました（残りライフ${state.life}）`,
    };
  }

  const cands = analyze(state);
  const deception = cands.find((c) => c.type === 'deception');
  const deceptionLoss = deception?.weight ?? 0;
  let primary: Candidate | undefined;
  // 犯罪・欺瞞による大損失が直接の敗因なら主表示
  const lastBig = [...state.ledger].reverse().find((e) => e.delta <= -15);
  if (deception && (deceptionLoss >= 30 || (lastBig?.eventId && DECEPTION_IDS.has(lastBig.eventId)))) {
    primary = deception;
  } else {
    primary = [...cands].filter((c) => c.type !== 'deception' || deceptionLoss >= 30).sort((a, b) => b.weight - a.weight)[0];
  }
  const secondary = cands.filter((c) => c !== primary).sort((a, b) => b.weight - a.weight).slice(0, 3);
  const all = [primary, ...secondary].filter((c): c is Candidate => !!c);
  const suggestions = [...new Set(all.map((c) => c.suggestion).filter((x): x is string => !!x))].slice(0, 3);
  // 件数・期間・支出などの全体の経過は結果画面の「経過」に出すため、ここでは失敗タイプに直結する事実だけを並べる
  return {
    outcome: 'gameover', day: state.day, totalSpend, specialLoss, lossByCategory, lossByEvent,
    primary: primary ? { type: primary.type, title: primary.title, facts: primary.facts } : undefined,
    secondary: secondary.map((c) => ({ type: c.type, title: c.title, facts: c.facts })),
    playerChoices: all.map((c) => c.choice).filter((x): x is string => !!x),
    externalFactors: all.map((c) => c.external).filter((x): x is string => !!x),
    suggestions,
    headline: `${primary?.title ?? 'マチアプ疲れ'}でライフが尽きました（${ch.name}）`,
  };
}

/** 初めて会った相手の人数（目的を偽っていた相手を含む） */
export function countMetPeople(state: GameState): number {
  return Object.values(state.contacts).filter((c) => c.meetings > 0).length;
}
