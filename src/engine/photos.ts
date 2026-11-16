// NPCへの写真素材の割り当て（男性は MALE_PHOTOS、女性は FEMALE_PHOTOS。2026-11-08 女性も追加）。1回のプレイで1枚につき1人だけ（同じ顔が別人として出ないように）。
// 顔写真：年齢が±3以内で顔評価が同じNPCに、設定（職業・年収・学歴・趣味・写真のウケ）ごと割り当てる。
// 顔を出していないNPC：顔出しなしの素材（後ろ姿など）が合えばそれを、なければ風景・料理などの写真を使う（女性NPCも風景写真）。
// 検索から出す相手は、割り当て後も自分の絞り込み条件に合う場合だけ使う。素材を使い切った後は従来の共通アイコン。
import { NPC_FACE_POOL } from './data/faceReveal';
import { FEMALE_PHOTOS, MALE_PHOTOS, type PhotoEducation, type PhotoTemplate } from './data/npcPhotos';
import { MALE_JOBS, UNIVERSITIES } from './data/npcPool';
import { JOB_MIN_AGE, medicalEducation, normCdf, passesPlayerPrefs, profileText } from './npc';
import { Rng } from './rng';
import type { Education, GameState, Npc, UniversityGroup } from './types';

const AGE_WINDOW = 3;

/** 学歴ごとの最低年齢（2026-11-09 指示：20歳の大卒のような矛盾を作らない） */
const EDU_MIN_AGE: Record<PhotoEducation, number> = { highschool: 18, vocational: 20, junior: 20, kosen: 20, student: 18, univ: 22, top: 22, grad: 24 };

/** 年齢に対して高すぎる年収を抑える（24歳の公務員が660万円、のような矛盾を作らない）。高収入の職業は上限を高めに */
const HIGH_PAY_JOB = /医師|弁護士|経営者|外資|コンサル|商社|金融|投資/;
function ageIncomeCapMan(age: number, job: string): number {
  const cap = age <= 23 ? 420 : age <= 25 ? 500 : age <= 27 ? 620 : age <= 29 ? 780 : Infinity;
  return HIGH_PAY_JOB.test(job) ? cap * 1.6 : cap;
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function pickEducation(kind: PhotoEducation, rng: Rng, incomeMan: number): Education {
  if (kind === 'highschool') return { kind: 'highschool' };
  if (kind === 'vocational') return { kind: 'vocational' };
  if (kind === 'kosen') return { kind: 'vocational', label: '高専卒' };
  if (kind === 'junior') return { kind: 'vocational', label: '短大卒' };
  // 大学院は上位校寄り。大学生はいろいろな大学
  const group: UniversityGroup = kind === 'top'
    ? rng.pick<UniversityGroup>(['旧帝大', '早慶'])
    : kind === 'student'
      ? rng.weighted<UniversityGroup>([['旧帝大', 1], ['早慶', 1], ['MARCH', 4], ['日東駒専', 4], ['大東亜帝国', 3]])
    : kind === 'grad'
      ? rng.weighted<UniversityGroup>(incomeMan >= 650 ? [['旧帝大', 5], ['早慶', 4], ['MARCH', 1]] : [['旧帝大', 2], ['早慶', 2], ['MARCH', 4], ['日東駒専', 1]])
      // 年収と大学の格を相関させる（2026-11-06、2026-11-09 強めた。例外は1割ほど）
      : rng.weighted<UniversityGroup>(incomeMan >= 900 ? [['旧帝大', 4], ['早慶', 5], ['MARCH', 1.5], ['日東駒専', 0.3]]
        : incomeMan >= 650 ? [['旧帝大', 1], ['早慶', 3], ['MARCH', 4], ['日東駒専', 1], ['大東亜帝国', 0.3]]
          : incomeMan >= 450 ? [['早慶', 0.5], ['MARCH', 3], ['日東駒専', 4], ['大東亜帝国', 2]]
            : [['MARCH', 0.8], ['日東駒専', 3], ['大東亜帝国', 5]]);
  return { kind: 'university', group, school: rng.pick(UNIVERSITIES[group]), detail: kind === 'student' ? '在学中' : kind === 'grad' ? '大学院修了' : undefined };
}

/** 素材の設定をNPCに反映した写し（人気は年収・職業・写真のウケから引き直す） */
function withTemplate(state: GameState, npc: Npc, t: PhotoTemplate): Npc {
  const rng = Rng.fromSeed(state.seed, 'photo', npc.id, t.id);
  const n: Npc = { ...npc, photo: t.file, looks: t.looks, profilePhotoVisible: t.faceVisible, portraitAssetStatus: 'approved' };
  if (t.job) n.job = t.job;
  if (t.income) n.incomeYen = Math.round(rng.range(t.income[0], t.income[1]) / 10) * 10 * 10_000;
  // 学歴と年収の相関（2026-11-09）：大学院卒は大卒より少し高め、高卒・専門卒は少し低め（例外は残す）
  const eduAdj = t.education === 'grad' ? 1.12 : t.education === 'top' ? 1.08 : t.education === 'highschool' ? 0.95 : 1;
  const capMan = ageIncomeCapMan(n.age, n.job);
  n.incomeYen = Math.round(Math.min(n.incomeYen / 10_000 * eduAdj, capMan * rng.range(0.88, 1)) / 10) * 10 * 10_000;
  if (t.education) n.education = n.job === '医師' ? medicalEducation(rng) : pickEducation(t.education, rng, n.incomeYen / 10_000);
  // 素材ごとに決めた大学群・専門の表記（2026-11-14：見た目に合わせて変更した素材）
  if (t.eduGroup && n.job !== '医師') n.education = { kind: 'university', group: t.eduGroup, school: rng.pick(UNIVERSITIES[t.eduGroup]) };
  if (t.eduLabel && t.education === 'vocational') n.education = { kind: 'vocational', label: t.eduLabel };
  if (t.heightCm) n.heightCm = t.heightCm;
  if (t.filtered) {
    // 加工写真（2026-11-07 指示）：ドタキャンが多く、会うと別人のことが多い。男性はヤリ目、女性はメシ目・業者・サクラが多い
    n.filteredPhoto = true;
    if (n.purpose === 'sincere' || n.purpose === 'ambiguous') {
      if (n.gender === 'M') n.purpose = rng.chance(0.5) ? 'body' : n.purpose;
      else if (rng.chance(0.4)) n.purpose = rng.weighted([['profit', 3], ['business', 2], ['sakura', 2], ['bijin', 1]] as const);
    }
    n.traits = { ...n.traits, misrepresented: n.traits.misrepresented || rng.chance(0.55) };
  }
  // 夜職フォルダの写真（2026-11-09 指示）：bar＝メシ目＋ぼったくりバーへの勧誘、meshi＝高めの店を提案してくる（交際にはならない）。
  // normal は他のNPCと同じふるまい（容姿4）
  const night = t.nightWork === 'bar' || t.nightWork === 'meshi' ? t.nightWork : undefined;
  if (night) {
    n.nightWork = night;
    n.purpose = 'profit';
    n.traits = { ...n.traits, moneySense: 'lavish', payExpectation: 'treat' };
  }
  // マチアプは年収を盛りがち（2026-11-09 指示）：男性の2割・女性の1割は表示の年収が本当より2〜5割高い
  if (rng.chance(n.gender === 'M' ? 0.2 : 0.1)) {
    n.realIncomeYen = n.incomeYen;
    n.incomeYen = Math.round(n.incomeYen * rng.range(1.2, 1.5) / 100_000) * 100_000;
  }
  // 医師・弁護士を偽る人もいる（男性3%・女性1%）。会うと本当の職業が分かる
  if (!night && !t.noFakeTitle && n.job !== '医師' && n.job !== '弁護士' && n.purpose !== 'sakura' && n.age >= 27 && rng.chance(n.gender === 'M' ? 0.03 : 0.01)) {
    n.fakeTitle = n.job;
    n.realIncomeYen ??= n.incomeYen;
    n.job = rng.chance(0.5) ? '医師' : '弁護士';
    n.incomeYen = Math.round(rng.range(n.job === '医師' ? 1200 : 900, n.job === '医師' ? 1800 : 1400) / 10) * 10 * 10_000;
    n.education = n.job === '医師' ? medicalEducation(rng) : { kind: 'university', group: '早慶', school: rng.pick(['早稲田大学', '慶應義塾大学']) };
  }
  // 高級店・ホテルの写真の女性はメシ目がやや多い
  if (t.luxury && n.gender === 'F' && (n.purpose === 'sincere' || n.purpose === 'ambiguous') && rng.chance(0.25)) n.purpose = 'profit';
  if (t.hobbies) n.hobbies = [...t.hobbies];
  if (t.height) n.heightCm = Math.round(t.height === 'short' ? rng.range(160, 166) : rng.range(181, 187));
  // 身長のサバ読み（2026-11-12 指示）：166〜169cmの男性の6割は、プロフィールに170〜172cmと書く。会うと分かる
  if (n.gender === 'M' && n.heightCm >= 166 && n.heightCm <= 169 && Rng.fromSeed(state.seed, 'height-lie', npc.id).chance(0.6)) {
    n.realHeightCm = n.heightCm;
    n.heightCm = Rng.fromSeed(state.seed, 'height-lie-to', npc.id).int(170, 172);
  }
  n.profileText = profileText(rng, n.purpose, n.hobbies, n.job) + (t.livesWithParents ? ' 今は実家暮らしです。' : '');
  const prestige = MALE_JOBS.find((j) => j.name === n.job)?.prestige
    ?? (t.education === 'top' || t.education === 'grad' ? 0.7 : t.education === 'student' ? 0.3 : t.education === 'highschool' ? 0.2 : 0.4);
  let z = (n.looks - 3) * 0.9 + rng.normal(0, 0.6) + (n.gender === 'M'
    ? Math.log(Math.max(150, n.incomeYen / 10_000) / 450) * 0.9 + (n.heightCm - 171) / 12 + (prestige - 0.4) * 0.8
    : (30 - n.age) * 0.06); // 女性NPCは若さ（NPC生成と同じ）
  if (t.weakPhoto) z -= 0.7;
  n.popularity = normCdf(z / 1.45);
  // 女性の1割は年収を書かない（未記入・秘密。2026-11-09 指示）
  if (n.gender === 'F' && rng.chance(0.1)) n.incomeHidden = rng.chance(0.5) ? '未記載' : '秘密';
  return n;
}

/** 保存する直前に呼ぶ。npc を書き換えて返す */
export function assignPhoto(state: GameState, npc: Npc): Npc {
  if (npc.photo || state.npcs[npc.id]) return npc;
  // 女性NPCにも写真素材を割り当てる（2026-11-08）。素材を使い切ったら、顔を出していない人だけ風景などの写真
  const pool = npc.gender === 'M' ? MALE_PHOTOS : FEMALE_PHOTOS;
  const used = new Set(state.usedPhotos ?? []);
  const candidates = pool
    .filter((t) => !used.has(t.id) && t.faceVisible === npc.profilePhotoVisible && Math.abs(t.age - npc.age) <= AGE_WINDOW && (!t.faceVisible || t.looks === npc.looks)
      // 大学生の設定は23歳以下の相手だけ（26歳の大学生のような不自然な組み合わせを作らない）
      && (t.education !== 'student' || npc.age <= 23)
      // 学歴の最低年齢（20歳の大卒・23歳の院卒などを作らない）
      && npc.age >= (t.education ? EDU_MIN_AGE[t.education] : 0)
      // 職業の最低年齢（素材より若い相手に医師・弁護士などを付けない）
      && npc.age >= (JOB_MIN_AGE[t.job ?? ''] ?? 0))
    .sort((a, b) => hashOf(npc.id + a.id) - hashOf(npc.id + b.id));
  for (const t of candidates) {
    const next = withTemplate(state, npc, t);
    if (npc.source === 'search' && !passesPlayerPrefs(next, state.player.prefs)) continue;
    (state.usedPhotos ??= []).push(t.id);
    return Object.assign(npc, next);
  }
  // 素材が合わなかった相手には写真を付けない（出さない。2026-11-09）
  return npc;
}

/**
 * 顔を出していない相手・加工の強い写真の相手の「本当の顔」（2026-11-10 顔かくしの素材）。
 * 同じ性別で年齢がいちばん近い、このプレイでまだ使っていない顔を1枚選ぶ。使い切ったら undefined
 */
export function revealFacePhoto(state: GameState, npc: Npc): string | undefined {
  const used = new Set(state.usedPhotos ?? []);
  const t = NPC_FACE_POOL.filter((p) => p.gender === npc.gender && !used.has(p.id))
    .sort((a, b) => Math.abs(a.age - npc.age) - Math.abs(b.age - npc.age) || hashOf(npc.id + a.id) - hashOf(npc.id + b.id))[0];
  if (!t) return undefined;
  (state.usedPhotos ??= []).push(t.id);
  return t.file;
}

/** プレイヤーの相手の性別で、まだ使っていない写真素材の数 */
export function freePhotoCount(state: GameState): number {
  const used = new Set(state.usedPhotos ?? []);
  const pool = state.gender === 'M' ? FEMALE_PHOTOS : MALE_PHOTOS;
  return pool.filter((t) => !used.has(t.id)).length;
}
