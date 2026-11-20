// 相手NPCの生成と、マッチ率の較正。
// NPCの属性は (シード, 連番) から決定的に作るため、再読込や表示順で正体が変わらない。
import { Rng } from './rng';
import { FEMALE_PHOTOS, MALE_PHOTOS } from './data/npcPhotos';
import type { Drinking, Education, Gender, Holiday, Looks, Marital, Npc, NpcTraits, PlayableCharacter, Preference, Purpose, Smoking, UniversityGroup } from './types';
import { AREAS, getArea, travelMinutes } from './data/areas';
import {
  FEMALE_JOBS, FEMALE_NAMES, HOBBIES, MALE_JOBS, MALE_NAMES, PROFILE_TEXTS, UNIVERSITIES, UNIVERSITY_GROUP_WEIGHTS,
} from './data/npcPool';
import { SPEC_PURPOSE_MIX, TUNE_BODY_HANDSOME, TUNE_REQUIRES_FACE_RATE, tunePopularityMultiplier } from './data/rules';

export interface NpcContext {
  seed: string;
  character: PlayableCharacter;
  /** プレイヤーの現在の年齢（加齢で変わる） */
  playerAge: number;
}

// 2026-11-12 指示で 10:20:40:20:10 → 15:30:40:10:5（容姿4・5を減らす）
const LOOKS_DIST: [Looks, number][] = [[1, 15], [2, 30], [3, 40], [4, 10], [5, 5]];

/** 顔写真を出している割合：写真素材の中の顔ありの割合に合わせる（2026-11-12 指示：顔が分からない写真もすべて出す） */
const FACE_SHARE = {
  M: MALE_PHOTOS.filter((p) => p.faceVisible).length / MALE_PHOTOS.length,
  F: FEMALE_PHOTOS.filter((p) => p.faceVisible).length / FEMALE_PHOTOS.length,
};

function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** 学歴による年収の倍率（2026-11-06 指示：学歴と年収を相関させる） */
export function eduIncomeFactor(e: Education): number {
  if (e.kind === 'highschool') return 0.82;
  if (e.kind === 'vocational') return 0.9;
  return ({ 旧帝大: 1.2, 早慶: 1.2, MARCH: 1.07, 日東駒専: 0.98, 大東亜帝国: 0.92 } as Record<string, number>)[e.group] ?? 1;
}

/** 職業の最低年齢（2026-11-07） */
export const JOB_MIN_AGE: Record<string, number> = { 医師: 27, 弁護士: 26, 経営者: 28, 外資系金融: 23, コンサルタント: 23, 大手商社: 23, 薬剤師: 24, 教員: 22 };

/**
 * 医師の学歴：医学部のある大学だけ（2026-11-07 指示：「MARCH卒の医師」のような経歴を作らない。MARCHに医学部はない）。
 * 大学群の分類にある中で医学部があるのは旧帝大と慶應
 */
export function medicalEducation(rng: Rng): Education {
  const group = rng.weighted<UniversityGroup>([['旧帝大', 3], ['早慶', 1]]);
  const school = group === '早慶' ? '慶應義塾大学' : rng.pick(UNIVERSITIES['旧帝大']);
  return { kind: 'university', group, school }; // 学部までは書かない（2026-11-09 指示）
}

/** 学歴は年収と職業の格（prestige）で決まる。医師・弁護士・外資金融などはほぼ上位大学 */
function pickEducation(rng: Rng, gender: Gender, income: number, prestige = 0.4): Education {
  const uniBias = prestige >= 0.85 ? 1 : prestige >= 0.7 ? 0.95 : income >= 800 ? 0.9 : income >= 500 ? 0.7 : income >= 350 ? 0.5 : 0.3;
  const r = rng.next();
  if (r < uniBias) {
    let weights = UNIVERSITY_GROUP_WEIGHTS;
    const top = prestige >= 0.85 ? 6 : income >= 900 || prestige >= 0.7 ? 3 : income >= 600 ? 1.6 : income < 400 ? 0.5 : 1;
    weights = weights.map(([g, w]) => [g, g === '旧帝大' || g === '早慶' ? w * top : g === '大東亜帝国' || g === '日東駒専' ? w / Math.sqrt(top) : w] as [typeof g, number]);
    const group = rng.weighted(weights);
    return { kind: 'university', group, school: rng.pick(UNIVERSITIES[group]) };
  }
  if (r < uniBias + (1 - uniBias) * (gender === 'F' ? 0.5 : 0.4)) return { kind: 'vocational' };
  return { kind: 'highschool' };
}

const AREA_WEIGHTS = AREAS.map((a) => [a.id, a.weight] as const);

/** プロフィールの基本情報の分布（仮置き） */
function pickBasics(rng: Rng, gender: Gender, age: number): { smoking: Smoking; drinking: Drinking; marital: Marital; holiday: Holiday; hasChildren: boolean } {
  const smoking = rng.weighted<Smoking>(gender === 'M' ? [['none', 70], ['sometimes', 12], ['yes', 18]] : [['none', 85], ['sometimes', 8], ['yes', 7]]);
  const drinking = rng.weighted<Drinking>([['none', 20], ['sometimes', 50], ['yes', 30]]);
  const divorcedRate = age < 30 ? 0.02 : age < 40 ? 0.08 : 0.18;
  const marital: Marital = rng.chance(divorcedRate) ? 'divorced' : 'never';
  const hasChildren = marital === 'divorced' ? rng.chance(0.5) : rng.chance(0.01);
  const holiday = rng.weighted<Holiday>([['weekend', 65], ['weekday', 12], ['irregular', 23]]);
  return { smoking, drinking, marital, holiday, hasChildren };
}

/** 恋愛目的でない相手（トラブルになる相手）の割合の倍率。2026-11-09 指示（トラブルが多い）で仕様の表の半分に */
const TROUBLE_PURPOSE_SCALE = 0.5;

function npcPurpose(rng: Rng, playerGender: Gender): Purpose {
  const mix = playerGender === 'M' ? SPEC_PURPOSE_MIX.forMalePlayer : SPEC_PURPOSE_MIX.forFemalePlayer;
  // メシ目（高級店を指定しておごらせる相手）は減らさない（2026-11-09 指示）
  return rng.weighted(mix.map(([p, w]) => [p, p === 'sincere' || p === 'ambiguous' || p === 'profit' ? w : w * TROUBLE_PURPOSE_SCALE] as [Purpose, number]));
}

export function profileText(rng: Rng, purpose: Purpose, hobbies: string[], job: string): string {
  const pools: string[][] = [PROFILE_TEXTS.common, PROFILE_TEXTS.common];
  if (purpose === 'sincere' || purpose === 'married') pools.push(PROFILE_TEXTS.serious);
  if (purpose === 'body' || purpose === 'bijin') pools.push(PROFILE_TEXTS.light, PROFILE_TEXTS.serious);
  if (purpose === 'business' || purpose === 'scam') pools.push(PROFILE_TEXTS.networking);
  if (purpose === 'sakura') pools.push(PROFILE_TEXTS.shy);
  if (purpose === 'ambiguous') pools.push(PROFILE_TEXTS.light);
  const t = rng.pick(rng.pick(pools));
  return t.replace('{h1}', hobbies[0]).replace('{h2}', hobbies[1] ?? hobbies[0]).replace('{job}', job.replace(/（.*）/, ''));
}

/**
 * NPCを1人生成する。index ごとに独立した乱数列を使う。
 * 年齢は「プレイヤー年齢±10」（男性の相手は−8〜+22）、距離は地域の分布から引く（検索条件で絞る前の母集団）。
 */
export function generateNpc(ctx: NpcContext, index: number, source: 'search' | 'received', day: number): Npc {
  const ch = ctx.character;
  const rng = Rng.fromSeed(ctx.seed, 'npc', ch.id, index);
  const gender: Gender = ch.gender === 'M' ? 'F' : 'M';
  // 男性の相手は年上の幅を広げる（首都圏のアプリでは年上の男性が多い。2026-11-06）
  const age = gender === 'M'
    ? Math.max(20, Math.min(60, ctx.playerAge + (rng.chance(0.3) ? rng.int(8, 22) : rng.int(-8, 8))))
    : Math.max(20, Math.min(60, ctx.playerAge + rng.int(-10, 10)));
  const looks = rng.weighted(LOOKS_DIST);
  const jobs = gender === 'M' ? MALE_JOBS : FEMALE_JOBS;
  // 職業の最低年齢（医師・弁護士などは若すぎる年齢にしない）
  const job = rng.weighted(jobs.filter((j) => age >= (JOB_MIN_AGE[j.name] ?? 0)).map((j) => [j, j.weight] as const));
  const ageFactor = gender === 'M' ? Math.min(1.25, 0.75 + (age - 22) * 0.025) : 1;
  const baseIncome = (job.income[0] + rng.next() * (job.income[1] - job.income[0])) * ageFactor;
  const education = job.name === '医師' ? medicalEducation(rng) : pickEducation(rng, gender, baseIncome, gender === 'M' ? job.prestige : baseIncome >= 500 ? 0.7 : 0.4);
  const incomeMan = Math.round(baseIncome * eduIncomeFactor(education) / 10) * 10;
  const heightCm = Math.round(gender === 'M' ? rng.normal(171, 5.5) : rng.normal(158, 5));
  const areaId = rng.weighted(AREA_WEIGHTS);
  const distanceMin = travelMinutes(ch.areaId, areaId);
  const basics = pickBasics(rng, gender, age);
  let purpose = npcPurpose(rng, ch.gender);
  // ヤリ捨て（身体目的）は容姿4・5の男性だけ（2026-11-03 指示）。それ以外は曖昧な相手に置き換え、
  // 容姿4・5の男性は誠実・曖昧の一部を身体目的にする（別の乱数列を使い、ほかの属性の抽選順は変えない）
  if (purpose === 'body' && (gender === 'F' || looks < 4)) purpose = 'ambiguous';
  if (gender === 'M' && looks >= 4 && (purpose === 'sincere' || purpose === 'ambiguous')
    && Rng.fromSeed(ctx.seed, 'body', ch.id, index).chance(TUNE_BODY_HANDSOME)) purpose = 'body';
  const hobbyA = rng.pick(HOBBIES);
  let hobbyB = rng.pick(HOBBIES);
  if (hobbyB === hobbyA) hobbyB = HOBBIES[(HOBBIES.indexOf(hobbyA) + 7) % HOBBIES.length];
  const hobbies = [hobbyA, hobbyB];

  // 人気スコア：外見＋（男性NPCは年収・身長・職業、女性NPCは若さ）＋揺らぎ
  let z = (looks - 3) * 0.9 + rng.normal(0, 0.6);
  if (gender === 'M') {
    z += Math.log(Math.max(150, incomeMan) / 450) * 0.9 + (heightCm - 171) / 12 + (job.prestige - 0.4) * 0.8;
  } else {
    z += (30 - age) * 0.06;
  }
  const popularity = normCdf(z / 1.45);

  // 相手側の希望条件（プロフィールに一部表示される）
  // 相手の希望年齢の下限は18歳（乱数の順序は変えない）
  // 年上の男性ほど若い相手まで希望に入れる
  const ageMin = Math.max(18, gender === 'F' ? age - rng.int(2, 4) : age - (age >= 38 ? rng.int(10, 22) : rng.int(6, 12)));
  const ageMax = gender === 'F' ? age + rng.int(5, 10) : age + rng.int(2, 5);
  let minIncomeYen = 0;
  if (gender === 'F') {
    const tier = rng.weighted<number>([[0, 50], [300, 18], [400, 15], [500, 9], [600, 5], [800, 3]]);
    const bump = popularity > 0.85 && tier > 0 ? 100 : 0;
    minIncomeYen = (tier + bump) * 10_000;
  }
  const acceptsPartnerChildren = rng.chance(gender === 'F' ? 0.6 : 0.55);
  const universityOnly = rng.chance(0.08);
  const nonSmokerOnly = basics.smoking === 'none' && rng.chance(gender === 'F' ? 0.4 : 0.3);
  const acceptsDivorced = basics.marital === 'divorced' || rng.chance(0.75);
  const minHeight = gender === 'F' ? rng.weighted<number>([[0, 60], [165, 15], [170, 18], [175, 7]]) : 0;

  const isDeceptive = purpose !== 'sincere' && purpose !== 'ambiguous';
  const traits: NpcTraits = {
    warmth: Math.min(1, Math.max(0, rng.normal(purpose === 'sakura' || purpose === 'scam' ? 0.85 : 0.6, 0.18))),
    rudeness: rng.chance(purpose === 'profit' ? 0.25 : 0.08) ? rng.range(0.6, 1) : rng.range(0, 0.3),
    passive: rng.chance(purpose === 'ambiguous' ? 0.25 : 0.12),
    moneySense: rng.weighted([['frugal', 25], ['normal', 55], ['lavish', purpose === 'profit' ? 60 : 20]] as const),
    contactPref: rng.weighted([['low', 25], ['mid', 50], ['high', 25]] as const),
    future: rng.weighted([['soon', 30], ['someday', 45], ['undecided', 25]] as const),
    acceptsConstraints: rng.chance(0.6),
    requiresFace: rng.chance(TUNE_REQUIRES_FACE_RATE),
    misrepresented: rng.chance(isDeceptive ? 0.18 : 0.02),
    delivery: rng.weighted([['polite', 45], ['ghost', 40], ['block', 15]] as const),
    // 会計の考え方（2026-11-06：男性がおごる前提）。男性NPCはおごるつもりの人が多く、女性NPCはおごられるつもりの人が多い
    payExpectation: gender === 'M'
      ? rng.weighted([['split', 15], ['more', 25], ['treat', 60]] as const) // 男性NPC：treat＝自分がおごる
      : rng.weighted([['split', 10], ['more', 25], ['treat', 65]] as const), // 女性NPC：treat＝おごってほしい
    weekendFree: basics.holiday === 'weekend' ? true : basics.holiday === 'weekday' ? false : rng.chance(0.5),
  };

  const names = gender === 'M' ? MALE_NAMES : FEMALE_NAMES;
  const id = `N${String(index).padStart(5, '0')}`;
  const name = rng.pick(names);
  const photoVisible = rng.chance(FACE_SHARE[gender]);
  // 顔写真を出していない人の顔評価は基本的に3以下（2026-11-03 指示）。人気も下げ直す
  const shownLooks = photoVisible ? looks : (Math.min(looks, 3) as Looks);
  const popularityFinal = shownLooks === looks ? popularity : normCdf((z - (looks - shownLooks) * 0.9) / 1.45);
  return {
    id,
    gender,
    name,
    age,
    job: job.name,
    education,
    incomeYen: incomeMan * 10_000,
    heightCm,
    looks: shownLooks,
    profilePhotoVisible: photoVisible,
    portraitAssetStatus: 'not_created',
    futureImageRef: `npc/${ch.id}/${id}.png`,
    areaId,
    distanceMin,
    smoking: basics.smoking,
    drinking: basics.drinking,
    marital: basics.marital,
    holiday: basics.holiday,
    hasChildren: basics.hasChildren,
    hobbies,
    profileText: profileText(rng, purpose, hobbies, job.name),
    popularity: popularityFinal,
    prefs: { ageMin, ageMax, minIncomeYen, acceptsPartnerChildren, universityOnly, nonSmokerOnly, acceptsDivorced, minHeight },
    purpose: purpose === 'body' && shownLooks < 4 ? 'ambiguous' : purpose, // 顔写真を出していない人（3以下）は身体目的にしない
    traits,
    taste: Math.exp(rng.normal(0, 0.3)),
    source,
    createdDay: day,
  };
}

/**
 * 相手の「偏差値」（内部データ）：容姿・身長・学歴・年収を男女別の平均とばらつきで標準化して足し、50±10に直したもの。
 * ライフが30を切ると画面に出る（2026-11-03 指示）
 */
export function npcHensachi(npc: Npc): number {
  return hensachiOf(npc);
}

export const HENSACHI_TUNE = {
  // 男性
  maleRichIncomeMan: 600, maleRichLooksWeight: 3.5, maleShortCm: 169, maleShortMult: 0.7,
  /** 容姿2以下は、ほかがどれだけ良くても偏差値50まで（2026-11-16） */
  maleLowLooksCap: 50,
  // 女性
  femaleLooksWeight: 1.22,
  /** 容姿2以下はさらに下げる（容姿2と3の間に崖。2026-11-16） */
  femaleLowLooksPenalty: 1.2,
  /** 学歴の点（大学群）。女性は旧帝大を早慶と同じに、男性はMARCHと早慶の間に崖（2026-11-16） */
  // MARCH未満の大学（日東駒専・大東亜帝国・産近甲龍）は画面では「大卒」とだけ出すので、点もひとつにそろえる（2026-11-21 指示）
  eduScoreFemale: { 旧帝大: 2.5, 早慶: 2.5, MARCH: 1.8, 日東駒専: 1.2, 産近甲龍: 1.2, 大東亜帝国: 1.2 } as Record<string, number>,
  // 男性のMARCHと早慶の崖は、MARCHを下げて作る（早慶・旧帝大を上げると東大の大輔が上がりすぎた。2026-11-16）
  // MARCH は日東駒専（1.3）より上に戻す（2026-11-18。以前の1.2は日東駒専より低く逆転していた）
  eduScoreMale: { 旧帝大: 2.65, 早慶: 2.5, MARCH: 1.4, 日東駒専: 1.2, 産近甲龍: 1.2, 大東亜帝国: 1.2 } as Record<string, number>,
  femaleEdu: { highschool: -0.55, vocational: -0.4 } as Record<string, number>,
  /** 年齢の倍率（上から当てはまるもの）。28〜33歳0.95、34歳から崖で0.8、36〜40歳0.7、41歳以上0.6（2026-11-16） */
  femaleAge: [[41, 0.6], [36, 0.7], [34, 0.8], [28, 0.95]] as [number, number][],
  /** 女性の大学は倍率だけで数える（大学群の点と二重にしない。2026-11-16）：早慶・旧帝大1.2倍、MARCH1.1倍 */
  femaleUnivMult: { 旧帝大: 1.2, 早慶: 1.2, MARCH: 1.1 } as Record<string, number>,
  femaleShift: 10.5,
  /** 身長の倍率（cm以上, 倍率）。上から順に当てはまるもの。165〜170は1.2、160〜165は1.1、155以下0.9、150以下0.8、ほかは等倍 */
  // 山の形はそのまま、差を小さく（2026-11-16）：165〜170cm 1.1・160〜165cm 1.05・155cm以下0.95・150cm以下0.9
  femaleHeight: (cm: number) => (cm > 170 ? 1 : cm >= 165 ? 1.1 : cm >= 160 ? 1.05 : cm <= 150 ? 0.9 : cm <= 155 ? 0.95 : 1),
};
/** 顔写真を出していない人の容姿（偏差値の計算用。2026-11-16 指示：容姿2相当） */
export const FACELESS_LOOKS = 2;
/**
 * 偏差値（容姿・身長・学歴・年収）。NPCにもプレイヤーにも同じ式を使う。2026-11-16 の指示による補正：
 * - 男性：年収600万円以上で容姿3を上回るときは容姿の重み3.5倍（容姿5・年収600万＞容姿3・年収1000万）。
 *   身長169cm以下は0.7倍。容姿2以下は50まで
 * - 女性：容姿の重み1.22倍、身長は倍率（165〜170cm 1.2・160〜165cm 1.1・155cm以下0.9・150cm以下0.8）、高卒・専門卒の下げは弱め、
 *   年収は600万円以上ほぼ同じ・400〜600万円一定・400万円未満で下がる、全体を +11.2、
 *   28歳以上0.9倍・33歳以上0.85倍・36歳以上0.6倍、大学がMARCH以上なら1.1倍
 * 範囲は20〜80
 */
export function hensachiOf(npc: Pick<Npc, 'gender' | 'heightCm' | 'education' | 'incomeYen'> & {
  /** 容姿（主人公は 3.5 もある） */
  looks: number;
  age?: number;
  /** 顔写真を出していない（容姿は2相当として計算）。なければ profilePhotoVisible／photoInitiallyVisible から決める */
  faceHidden?: boolean; profilePhotoVisible?: boolean; photoInitiallyVisible?: boolean;
}): number {
  const male = npc.gender === 'M';
  const t = HENSACHI_TUNE;
  const hidden = npc.faceHidden ?? (npc.profilePhotoVisible === false || npc.photoInitiallyVisible === false);
  const looksValue = hidden ? FACELESS_LOOKS : npc.looks;
  const incMan = Math.max(100, npc.incomeYen / 10_000);
  const e = npc.education;
  const eduScore = e.kind === 'highschool' ? 0 : e.kind === 'vocational' ? 0.5
    : (male ? t.eduScoreMale : t.eduScoreFemale)[e.group] ?? 1;
  let h: number;
  if (male) {
    // 容姿の重みを大きくするのは容姿3を上回る側だけ（2026-11-16：年収600万以上で容姿1・2がかえって下がっていた）
    // 容姿の重みを大きくするのは、年収600万円以上で容姿3を上回るときだけ（2026-11-16：蓮（容姿5・年収400万）が高く出すぎた）
    const w = looksValue > 3 && incMan >= t.maleRichIncomeMan ? t.maleRichLooksWeight : 1;
    const looks = ((looksValue - 3) / 1.1) * w;
    const height = (npc.heightCm - 171) / 5.5;
    const edu = (eduScore - 1.1) / 0.9;
    const income = (Math.log(incMan) - Math.log(450)) / 0.45;
    h = 50 + 10 * ((looks + height + edu + income) / 2); // 4つの独立した標準値の和のばらつきは2
    if (npc.heightCm <= t.maleShortCm) h *= t.maleShortMult;
    if (looksValue <= 2) h = Math.min(h, t.maleLowLooksCap);
  } else {
    const looks = ((looksValue - 3) / 1.1) * t.femaleLooksWeight - (looksValue <= 2 ? t.femaleLowLooksPenalty : 0);
    const edu = t.femaleEdu[e.kind] ?? 0; // 大学は下の倍率で数える
    const income = incMan >= 600 ? 0.25 : incMan >= 400 ? 0 : Math.max(-2, Math.log(incMan / 400) / 0.5);
    h = 50 + 10 * ((looks + edu + income) / 2) + t.femaleShift;
    h *= t.femaleHeight(npc.heightCm);
    const hit = t.femaleAge.find(([a]) => (npc.age ?? 0) >= a);
    if (hit) h *= hit[1];
    if (e.kind === 'university') h *= t.femaleUnivMult[e.group] ?? 1;
  }
  return Math.max(20, Math.min(80, Math.round(h)));
}

/** NPCが見られる範囲のプレイヤー属性で、相手の必須条件を満たすか（容姿は含めない） */
export function passesNpcPrefs(npc: Npc, ch: PlayableCharacter, playerAge: number): boolean {
  if (playerAge < npc.prefs.ageMin || playerAge > npc.prefs.ageMax) return false;
  if (ch.incomeYen < npc.prefs.minIncomeYen) return false;
  if (ch.children > 0 && !npc.prefs.acceptsPartnerChildren) return false;
  if (npc.prefs.universityOnly && ch.education.kind !== 'university') return false;
  if (npc.prefs.nonSmokerOnly && ch.smoking !== 'none') return false;
  if (!npc.prefs.acceptsDivorced && ch.marital === 'divorced') return false;
  if (npc.prefs.minHeight > 0 && ch.heightCm < npc.prefs.minHeight) return false;
  return true;
}

/** プレイヤーの検索条件（絞り込み）に合うか */
export function passesPlayerPrefs(npc: Npc, prefs: Preference): boolean {
  if (npc.age < prefs.ageMin || npc.age > prefs.ageMax) return false;
  if (prefs.prefectures.length > 0 && !prefs.prefectures.includes(getArea(npc.areaId).pref)) return false;
  if (prefs.heightMin > 0 && npc.heightCm < prefs.heightMin) return false;
  if (prefs.heightMax > 0 && npc.heightCm > prefs.heightMax) return false;
  if (prefs.minIncomeYen > 0 && (npc.incomeYen < prefs.minIncomeYen || npc.incomeHidden)) return false; // 年収を書いていない人は、年収で絞ると出てこない
  if (prefs.universityOnly && npc.education.kind !== 'university') return false;
  if (prefs.neverMarriedOnly && npc.marital !== 'never') return false;
  if (prefs.noChildrenOnly && npc.hasChildren) return false;
  if (prefs.nonSmokerOnly && npc.smoking !== 'none') return false;
  if (prefs.drinking === 'none' && npc.drinking !== 'none') return false;
  if (prefs.drinking === 'noneOrSometimes' && npc.drinking === 'yes') return false;
  if (prefs.holiday === 'weekend' && npc.holiday !== 'weekend') return false;
  if (prefs.holiday === 'weekday' && npc.holiday !== 'weekday') return false;
  // 「顔写真がある人だけ」の絞り込みは廃止（2026-11-08 指示）。古いセーブで true でも見ない
  return true;
}

/** 基準条件（年齢±5歳・片道60分以内。郊外の人物は人物ごとの値）。仕様§6の比較条件 */
export function inBasePool(npc: Npc, playerAge: number, baseDistanceMin = 60): boolean {
  return Math.abs(npc.age - playerAge) <= 5 && npc.distanceMin <= baseDistanceMin;
}

function distanceMultiplier(distanceMin: number): number {
  if (distanceMin <= 60) return 1;
  if (distanceMin <= 120) return 0.7;
  return 0.5;
}

/** 較正前の相手ごとの倍率。人気・相手の必須条件・個人の好み・距離 */
export function rawSendMultiplier(npc: Npc, ch: PlayableCharacter, playerAge: number): number {
  if (!passesNpcPrefs(npc, ch, playerAge)) return 0;
  return tunePopularityMultiplier(npc.popularity) * npc.taste * distanceMultiplier(npc.distanceMin);
}

const calibrationCache = new Map<string, { calib: number; baseFraction: number; sample: Npc[]; baseRaw: number[] }>();
const capCalibCache = new Map<string, number>();

/** 1人あたりの上限 cap を含めて、基準候補群の平均が p0 になる較正係数を二分法で求める */
export function calibrationFor(ch: PlayableCharacter, playerAge: number, p0: number, cap = 0.95): number {
  const key = `${ch.id}:${playerAge}:${p0}:${cap}`;
  const hit = capCalibCache.get(key);
  if (hit !== undefined) return hit;
  const { baseRaw, calib } = calibration(ch, playerAge);
  if (baseRaw.length === 0) return calib;
  const meanAt = (c: number) => baseRaw.reduce((a, r) => a + Math.min(cap, p0 * c * r), 0) / baseRaw.length;
  let lo = 0;
  let hi = calib * 4;
  if (meanAt(hi) < p0) {
    capCalibCache.set(key, hi);
    return hi;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) < p0) lo = mid;
    else hi = mid;
  }
  capCalibCache.set(key, hi);
  return hi;
}

/**
 * 基準候補群（年齢±5・60分以内）で倍率の平均が1になるよう較正する。
 * これにより「表の送信成立率＝基準候補群全体の平均」が保たれ、
 * 年収・容姿・写真の効果を表の値へ二重に掛けない。
 */
export function calibration(ch: PlayableCharacter, playerAge: number): { calib: number; baseFraction: number; sample: Npc[]; baseRaw: number[] } {
  const key = `${ch.id}:${playerAge}`;
  const hit = calibrationCache.get(key);
  if (hit) return hit;
  const ctx: NpcContext = { seed: 'calibration-v1', character: ch, playerAge };
  const sample: Npc[] = [];
  const baseRaw: number[] = [];
  for (let i = 0; i < 6000; i++) {
    const npc = generateNpc(ctx, i, 'search', 0);
    sample.push(npc);
    if (inBasePool(npc, playerAge, ch.baseDistanceMin)) baseRaw.push(rawSendMultiplier(npc, ch, playerAge));
  }
  const mean = baseRaw.length > 0 ? baseRaw.reduce((a, b) => a + b, 0) / baseRaw.length : 1;
  const result = { calib: mean > 0 ? 1 / mean : 0, baseFraction: baseRaw.length / sample.length, sample, baseRaw };
  calibrationCache.set(key, result);
  return result;
}

/** 首都圏で活動中の異性（自分の年齢±10歳）の人数。仮置き */
export const TOTAL_ACTIVE_POPULATION = 60_000;

/** 条件に合う候補の推定人数（表示用） */
export function estimateCandidates(ch: PlayableCharacter, playerAge: number, prefs: Preference): number {
  const { sample } = calibration(ch, playerAge);
  const pass = sample.filter((n) => passesPlayerPrefs(n, prefs)).length;
  return Math.round(TOTAL_ACTIVE_POPULATION * (pass / sample.length));
}

/** 1つの検索結果を、表示順を決めるための近さ順キー（同じ条件なら近い人から） */
export function distanceRank(npc: Npc): number {
  return npc.distanceMin;
}

export function popularTop10(npc: Npc): boolean {
  return npc.popularity >= 0.9;
}
