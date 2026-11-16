// トークの温度（トーク仕様案 v0.2・設定仕様案 v0.1、2026-11-11 実装）。
// ・魅力度：同じ性別の中での市場の位置（0〜1）。プレイヤーは人物の値から、NPCは人気スコアから計算する
// ・格差：相手が重視すること（人格テンプレ）で補正したプレイヤーの魅力度 − NPCの魅力度。男女の需給差・人気会員の補正つき。5段階（−2〜+2）
// ・温度：返信の形の5段（1 一言／2 短い答え／3 ふつう／4 乗り気／5 前のめり）。マッチ後に格差と対応タイプから1回だけ決め、選択で1段ずつ動く
// 会えるかどうか（到達上限 reach）と好感度は既存の仕組みのまま。温度は返信の文面・速さと、誘いへの返事の言い方、見切り（既読無視）に効く。
import { MALE_JOBS } from './data/npcPool';
import { PERSONAS, type Persona, type ResponseType } from './data/personas';
import { playerHobbies } from './conversation';
import { normCdf } from './npc';
import { character, withRng } from './state';
import type { Contact, GameState, Npc } from './types';

export type Tier = -2 | -1 | 0 | 1 | 2;
export type Level = 1 | 2 | 3 | 4 | 5;
/** 選んだ手の良し悪し（トーク仕様案 v0.2 §3.4） */
export type Quality = 'hit' | 'good' | 'normal' | 'sloppy' | 'violation';

/** 数値はすべて仮置き（自動プレイで合わせる） */
export const TUNE_TEMP = {
  /** 男女の需給差（NPCの魅力度が人気会員の線より下のとき）：男性プレイヤーは −、女性プレイヤーは + */
  supplyOffset: 0.15,
  popularLine: 0.75,
  popularPremium: 0.2,
  /** 格差の段の境目（−2 | −1 | 0 | +1 | +2） */
  tierEdges: [-0.3, -0.1, 0.1, 0.3],
  /** 対応タイプの割合（女性NPC・男性NPC） */
  typeShare: { F: { sync: 45, passive: 28, polite: 12, salty: 10, moody: 5 }, M: { sync: 62, passive: 8, polite: 12, salty: 12, moody: 6 } } as Record<'F' | 'M', Record<ResponseType, number>>,
  /** 基準の温度の分布（連動の場合。格差ごとに L1〜L5 の重み） */
  baseDist: { '-2': [55, 40, 5, 0, 0], '-1': [30, 45, 20, 5, 0], '0': [10, 30, 40, 18, 2], '1': [0, 15, 40, 33, 12], '2': [0, 5, 30, 40, 25] } as Record<string, number[]>,
  range: { sync: [1, 5], passive: [1, 4], polite: [3, 4], salty: [1, 2], moody: [1, 5] } as Record<ResponseType, [number, number]>,
  /** 選択の効き（格差 −2〜+2 の順） */
  hit: 0.6,
  good: [0.05, 0.15, 0.3, 0.3, 0.3],
  sloppy: [0.6, 0.5, 0.5, 0.35, 0.25],
  /** 並行トークの冷め：格差0以下・会う前・この往復数を超えたら毎回この確率で −1 */
  fadeAfter: 4,
  fadeChance: 0.3,
  noise: 0.1,
  moodyNoise: 0.5,
  /** 見切り：一言が続いたら既読無視のまま終わる（会う約束まで進まない相手だけ） */
  ghostStreak: 2,
  ghostChance: 0.5,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** プレイヤーキャラの職業の格（NPCの職業の素材にない名前） */
const PLAYER_PRESTIGE: Record<string, number> = {
  総合商社: 0.85, 弁護士: 0.9, フリーター: 0.1, 美容師: 0.2, 事務職: 0.35, コンサルタント: 0.8, 派遣ITサポート: 0.15, 中小企業会社員: 0.35, 非正規の清掃職: 0.1,
};
function prestigeOf(job: string): number {
  return PLAYER_PRESTIGE[job] ?? MALE_JOBS.find((j) => j.name === job || job.startsWith(j.name.replace(/（.*）/, '')))?.prestige ?? 0.4;
}

/** プレイヤーの魅力度（設定仕様案 §1.2。写真を載せていなければ容姿は男性2・女性3以下扱い＋減点） */
export function playerAppeal(state: GameState): number {
  const ch = character(state);
  const visible = state.player.photoVisible;
  const age = state.player.age;
  const looks = visible ? ch.looks : Math.min(ch.looks, ch.gender === 'M' ? 2 : 3);
  let z = (looks - 3) * 0.9;
  if (ch.gender === 'M') {
    z += Math.log(Math.max(150, ch.incomeYen / 10_000) / 450) * 0.9 + (ch.heightCm - 171) / 12 + (prestigeOf(ch.job) - 0.4) * 0.8 - Math.max(0, age - 35) * 0.06;
    if (!visible) z -= 0.5;
  } else {
    z += (30 - age) * 0.06 - Math.max(0, age - 35) * 0.06 - (ch.children > 0 ? 0.3 : 0);
    if (!visible) z -= 0.2;
  }
  return normCdf(z / 1.45);
}

/** NPCの魅力度：人気スコアに、年齢（35歳超）と子どもの有無を足す */
export function npcAppeal(npc: Npc): number {
  let a = npc.popularity - Math.max(0, npc.age - 35) * 0.015;
  if (npc.gender === 'F' && npc.hasChildren) a -= 0.08;
  return clamp(a, 0.02, 0.98);
}

/** 相手が重視することで補正した、相手から見たプレイヤーの魅力度（設定仕様案 §1.4 の1） */
function perceivedAppeal(state: GameState, c: Contact, npc: Npc, p: Persona): number {
  const ch = character(state);
  const w = p.weights;
  let a = playerAppeal(state);
  if (state.player.photoVisible || c.faceKnown) a += (ch.looks - 3) * 0.05 * w.looks;
  if (ch.gender === 'M') {
    const inc = ch.incomeYen / 10_000;
    a += (inc >= 1000 ? 0.15 : inc >= 800 ? 0.1 : inc >= 600 ? 0.05 : inc < 400 ? -0.05 : 0) * w.income;
  }
  const age = state.player.age;
  const outside = age < npc.prefs.ageMin ? npc.prefs.ageMin - age : age > npc.prefs.ageMax ? age - npc.prefs.ageMax : 0;
  a -= Math.min(0.3, Math.floor(outside / 3) * 0.1) * Math.min(1.5, w.age);
  const shared = playerHobbies(state).filter((h) => npc.hobbies.includes(h)).length;
  a += Math.min(0.1, shared * 0.05) * w.interest_match;
  return a;
}

/** 格差の値（プレイヤー − NPC。設定仕様案 §1.4） */
export function gapValue(state: GameState, c: Contact, npc: Npc): number {
  const p = personaOf(state, c, npc);
  const na = npcAppeal(npc);
  let g = perceivedAppeal(state, c, npc, p) - na;
  if (na >= TUNE_TEMP.popularLine) g -= TUNE_TEMP.popularPremium;
  else g += (state.gender === 'M' ? -1 : 1) * TUNE_TEMP.supplyOffset;
  return g;
}

export function tierOfGap(g: number): Tier {
  const [a, b, c2, d] = TUNE_TEMP.tierEdges;
  return g <= a ? -2 : g <= b ? -1 : g < c2 ? 0 : g < d ? 1 : 2;
}

/** 相手の人格テンプレ（初めて必要になった時に、年齢帯・目的・子ども・結婚歴と対応タイプの割合で選ぶ。やり取り中の相手と重ならないように） */
export function personaOf(state: GameState, c: Contact, npc: Npc): Persona {
  const known = PERSONAS.find((x) => x.id === c.flags.persona);
  if (known) return known;
  const used = new Set(Object.values(state.contacts).filter((o) => o !== c && o.stage !== 'ended' && o.stage !== 'like_failed').map((o) => o.flags.persona));
  const fits = (p: Persona, strict: boolean) => p.gender === npc.gender && (!strict || (
    npc.age >= p.ageBand[0] - 2 && npc.age <= p.ageBand[1] + 2 && p.purposes.includes(npc.purpose)
    && (!p.needsChildren || npc.hasChildren) && (!p.needsDivorced || npc.marital === 'divorced')));
  let pool = PERSONAS.filter((p) => fits(p, true) && !used.has(p.id));
  if (pool.length === 0) pool = PERSONAS.filter((p) => fits(p, true));
  if (pool.length === 0) pool = PERSONAS.filter((p) => fits(p, false) && npc.age >= p.ageBand[0] - 5 && npc.age <= p.ageBand[1] + 5);
  if (pool.length === 0) pool = PERSONAS.filter((p) => fits(p, false));
  const share = TUNE_TEMP.typeShare[npc.gender];
  const count = (t: ResponseType) => PERSONAS.filter((p) => p.gender === npc.gender && p.type === t).length || 1;
  // 子どもがいる相手は、シングルペアレントのテンプレが合えば優先する
  const weight = (p: Persona) => (share[p.type] / count(p.type)) * (p.needsChildren && npc.hasChildren ? 4 : 1);
  const chosen = withRng(state, (r) => r.weighted(pool.map((p) => [p, weight(p)] as const)));
  c.flags.persona = chosen.id;
  initLevel(state, c, npc, chosen);
  return chosen;
}

function clampType(x: number, t: ResponseType): Level {
  const [lo, hi] = TUNE_TEMP.range[t];
  return clamp(Math.round(x), lo, hi) as Level;
}

/** 基準の温度をマッチ後に1回だけ決める（トーク仕様案 v0.2 §3.2） */
function initLevel(state: GameState, c: Contact, npc: Npc, p: Persona): void {
  const tier = tierOfGap(gapValue(state, c, npc));
  const level = withRng(state, (r) => {
    if (p.type === 'polite') return tier >= 0 ? (r.chance(0.6) ? 4 : 3) : (r.chance(0.7) ? 3 : 4);
    if (p.type === 'salty') return r.chance(0.5) ? 1 : 2;
    const d = TUNE_TEMP.baseDist[String(tier)];
    return r.weighted(d.map((w, i) => [i + 1, w] as const));
  });
  c.flags.tier = tier;
  c.flags.baseLevel = clampType(level, p.type);
  c.flags.level = c.flags.baseLevel;
}

export function levelOf(state: GameState, c: Contact, npc: Npc): Level {
  personaOf(state, c, npc);
  return Number(c.flags.level ?? 3) as Level;
}

export function tierOf(state: GameState, c: Contact, npc: Npc): Tier {
  personaOf(state, c, npc);
  return Number(c.flags.tier ?? 0) as Tier;
}

/** こちらの選択のあと、温度を動かす（トーク仕様案 v0.2 §3.4）。会う前だけ */
export function stepLevel(state: GameState, c: Contact, npc: Npc, q: Quality): void {
  if (c.meetings > 0) return;
  const p = personaOf(state, c, npc);
  const t = Number(c.flags.tier ?? 0);
  const base = Number(c.flags.baseLevel ?? 3);
  let x = Number(c.flags.level ?? base);
  withRng(state, (r) => {
    if (q === 'hit') {
      if (r.chance(TUNE_TEMP.hit)) x += 1;
      if (t === -2) x = Math.min(x, 3);
    } else if (q === 'good') {
      if (r.chance(TUNE_TEMP.good[t + 2])) x += 1;
    } else if (q === 'sloppy') {
      if (r.chance(TUNE_TEMP.sloppy[t + 2])) x -= 1;
    } else if (q === 'violation') {
      x -= t === 2 ? 1 : 2;
    }
    // 並行トークの冷め：同じくらい以下の相手は、会う予定がないまま往復が続くと冷める
    if ((p.type === 'sync' || p.type === 'passive') && t <= 0 && c.exchanges > TUNE_TEMP.fadeAfter && !c.nextDate && r.chance(TUNE_TEMP.fadeChance)) x -= 1;
    if (p.type === 'sync' && r.chance(TUNE_TEMP.noise)) x += r.chance(0.5) ? 1 : -1;
    if (p.type === 'moody' && r.chance(TUNE_TEMP.moodyNoise)) x += r.chance(0.5) ? 2 : -2;
  });
  if (p.type !== 'moody') x = Math.min(x, base + 2);
  c.flags.level = clampType(x, p.type);
}

/** 返信までの日数（温度が高いほど早い）。会う前の返信だけ */
export function delayByLevel(level: Level, r: { int: (a: number, b: number) => number }): number {
  return level >= 4 ? 1 : level === 3 ? r.int(1, 2) : level === 2 ? r.int(1, 3) : r.int(2, 4);
}

// 1通1文に分ける処理は textSplit.ts（どのモジュールからも使えるように分けた）
export { isQuestion, splitSentences } from './textSplit';
