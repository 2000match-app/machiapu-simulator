// 魅力度：相手から見た「自分」の魅力（0..1）。
// 人物ごとのマッチ率（仕様の表）を男女別の幅で0..1に直したものを土台にし、相手個人の好みと人気で揺らす。
// 返信の来やすさ・最初の興味・そっけない返事の出やすさに使う。マッチ率そのものは変えない。
import { TUNE_APPEAL, TUNE_CURT, TUNE_FIRST_REPLY, isNormalPurpose } from './data/rules';
import { hensachiOf } from './npc';
import { character, currentRates } from './state';
import type { Contact, GameState, Npc } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 人物そのものの魅力度（写真公開で表が切り替われば変わる） */
export function baseAppeal(state: GameState): number {
  const r = TUNE_APPEAL.rateRange[state.gender];
  const rate = Math.max(r.lo, currentRates(state).sendSuccess);
  return clamp(Math.log(rate / r.lo) / Math.log(r.hi / r.lo), 0, 1);
}

/** この相手から見た魅力度 */
export function appealTo(state: GameState, c: Contact, npc: Npc): number {
  const a = baseAppeal(state)
    + (npc.taste - 1) * TUNE_APPEAL.tasteWeight
    - (npc.popularity - 0.5) * TUNE_APPEAL.popularityWeight
    + (c.fromReceived ? TUNE_APPEAL.receivedBonus : 0);
  return clamp(a, 0.03, 0.97);
}

/** マッチした時点の興味 */
export function initialInterest(state: GameState, c: Contact, npc: Npc): number {
  return Math.round(TUNE_APPEAL.interestBase + TUNE_APPEAL.interestSpan * appealTo(state, c, npc));
}

/** 初回メッセージ・相手からの最初の一通にかかる魅力度の倍率（恋愛目的の相手だけ） */
export function firstReplyAppealMultiplier(state: GameState, c: Contact, npc: Npc): number {
  if (!isNormalPurpose(npc.purpose)) return 1;
  const slope = TUNE_FIRST_REPLY.appealSlope[state.gender];
  return 1 - slope / 2 + slope * appealTo(state, c, npc);
}

/** 話を広げない返事（「はい」「そうなんですね」）になる確率 */
/**
 * 親身さ（0〜1）：自分の偏差値が相手より高いほど、相手は親身に受け答えする傾向（2026-11-09 指示）。
 * あくまで傾向なので、相手の3割はこの傾向に従わない（0のまま）。差が3以下なら0、差18でほぼ1
 */
/** プレイヤー自身の人気（0〜1）：偏差値55で0、80で1。返信が来ない・遅い・そっけない虚無感をやわらげる（2026-11-09 健人の指摘） */
export function playerPopularity(state: GameState): number {
  const ch = character(state);
  const h = hensachiOf({ gender: ch.gender, looks: ch.looks, heightCm: ch.heightCm, education: ch.education, incomeYen: ch.incomeYen, age: state.player.age, faceHidden: !state.player.photoVisible });
  return clamp((h - 55) / 25, 0, 1);
}

export function attentiveness(state: GameState, npc: Npc): number {
  let h = 0;
  for (const ch of npc.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  if (h % 10 >= 7) return 0;
  const ch = character(state);
  const gap = hensachiOf({ gender: ch.gender, looks: ch.looks, heightCm: ch.heightCm, education: ch.education, incomeYen: ch.incomeYen, age: state.player.age, faceHidden: !state.player.photoVisible }) - hensachiOf(npc);
  return clamp((gap - 3) / 15, 0, 1);
}

export function curtChance(state: GameState, c: Contact, npc: Npc): number {
  const g = state.gender === 'M' ? TUNE_CURT.toMale : TUNE_CURT.toFemale;
  let p = g.base + g.lowAppeal * (1 - appealTo(state, c, npc));
  if (npc.traits.warmth < 0.35) p += TUNE_CURT.coldBonus;
  if (c.interest < 40) p += TUNE_CURT.lowInterestBonus;
  else if (c.interest >= 70) p -= TUNE_CURT.highInterestCut;
  if (!isNormalPurpose(npc.purpose)) p *= TUNE_CURT.deceptiveFactor;
  p -= 0.4 * attentiveness(state, npc); // 格上のこちらには親身
  return clamp(p, 0.03, 0.9);
}
