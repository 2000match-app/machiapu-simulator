// プロフィールの充実度（2026-11-23 指示）。
// - bare：「よろしくお願いします」しか書いていない（女性の1割・男性は少なめ）。聞けるのは仕事と休日くらいで、格上でないと返事も薄い
// - sparse：趣味を1〜2個書いているだけ（女性は「旅行・カフェ巡り」、男性は趣味1つ）。聞ける話題が少ない
// - normal：ふつうの自己紹介（1〜2文）
// - rich：5行以上で、趣味・仕事・好きなタイプなどに3項目以上触れる
// 充実していないプロフィールは、年収が低い人・偏差値の低い大学や専門・短大卒に多め（高卒はふつう）。
// 女性の2割は趣味に「推し活」を書く。推し活については、こちらから質問できない。
import type { Rng } from './rng';
import { PROFILE_BIOS } from './data/profileBios';
import type { Npc, Purpose } from './types';
import type { TopicId } from './data/talkSlots';

export type ProfileDepth = 'bare' | 'sparse' | 'normal' | 'rich';

export const OSHI = '推し活';

/** 学歴・年収から見た「プロフィールが薄くなりやすさ」の倍率 */
function sparseFactor(n: Npc): number {
  const man = (n.realIncomeYen ?? n.incomeYen) / 10_000;
  const e = n.education;
  const lowEdu = (e.kind === 'university' && (e.group === '大東亜帝国' || e.group === '日東駒専') && e.detail !== '在学中')
    || (e.kind === 'vocational');
  const highEdu = e.kind === 'university' && (e.group === '旧帝大' || e.group === '早慶');
  let f = 1;
  if (lowEdu) f *= 1.6;
  if (highEdu) f *= 0.4;
  const lowIncome = n.gender === 'F' ? man < 330 : man < 400;
  const highIncome = n.gender === 'F' ? man >= 550 : man >= 700;
  if (lowIncome) f *= 1.5;
  if (highIncome) f *= 0.5;
  return f;
}

export function pickProfileDepth(rng: Rng, n: Npc): ProfileDepth {
  const f = sparseFactor(n);
  // 全体の平均が女性 bare・sparse 各1割、男性 各5%くらいになるよう、倍率の平均（約1.4）で割っておく
  const base = (n.gender === 'F' ? 0.1 : 0.05) / 1.4;
  const u = rng.next();
  if (u < base * f) return 'bare';
  if (u < base * f * 2) return 'sparse';
  // 残りのうち、充実したプロフィールは学歴・年収が高い人に多め
  return rng.chance(Math.min(0.75, 0.35 / Math.sqrt(f))) ? 'rich' : 'normal';
}

const TYPES = ['笑顔がすてきな人', '一緒にいて落ち着ける人', '話をちゃんと聞いてくれる人', '価値観が近い人', '気づかいができる人', '何でも楽しめる前向きな人'];
const WORK_NOTES_WEEKEND = ['平日は忙しいですが、土日はしっかり休めています。', '残業は少なめで、平日の夜も時間を作りやすいです。', '大変なこともありますが、やりがいを感じています。'];
const WORK_NOTES_SHIFT = ['休みは平日が多いですが、予定は合わせやすいです。', 'シフト制なので、休みは相談しながら合わせられます。', '大変なこともありますが、やりがいを感じています。'];
const FOOD_NOTES = ['美味しいごはん屋さんを探すのも好きなので、おすすめがあれば教えてください。', 'お酒は少しだけ飲みます。落ち着いたお店で話すのが好きです。', '休みの日に新しいカフェを開拓するのが楽しみです。'];

function closing(rng: Rng, purpose: Purpose): string {
  if (purpose === 'sincere' || purpose === 'married') return rng.pick(['将来のことも考えられる方と、ゆっくり関係を作っていきたいです。', '真剣にお付き合いできる方と出会えたら嬉しいです。']);
  if (purpose === 'body' || purpose === 'ambiguous') return rng.pick(['まずは気軽にごはんでも行けたら嬉しいです😊', 'フィーリングが合う方と仲良くなりたいです。']);
  return rng.pick(['まずはメッセージで仲良くなれたら嬉しいです。', '気軽にいいねしてもらえると嬉しいです！']);
}

/**
 * プロフィールの充実度を決め、趣味と自己紹介文を書き換える（photos.ts の withTemplate から呼ぶ）。
 * normal は呼び出し側の既存の自己紹介文を使う（normalText）
 */
export function applyProfileDepth(rng: Rng, n: Npc, normalText: string): void {
  const depth = pickProfileDepth(rng, n);
  n.profileDepth = depth;
  // 女性の2割は推し活を書く（質問の材料にはしないので、趣味の最後に置く）
  const oshi = n.gender === 'F' && depth !== 'bare' && rng.chance(0.22);
  if (depth === 'sparse') n.hobbies = n.gender === 'F' ? ['旅行', 'カフェ巡り'] : [n.hobbies[0] ?? '散歩'];
  if (oshi && !n.hobbies.includes(OSHI)) n.hobbies = [...n.hobbies.filter((h) => h !== OSHI).slice(0, 2), OSHI];
  const h = n.hobbies.filter((x) => x !== OSHI);
  const job = n.job.replace(/（.*）/, '');
  if (depth === 'bare') {
    n.profileText = rng.pick(['よろしくお願いします。', 'よろしくお願いします！', 'よろしくお願いします🙇‍♀️', 'よろしくお願いします☺️']);
    return;
  }
  if (depth === 'sparse') {
    n.profileText = n.gender === 'F' ? `趣味は旅行・カフェ巡りです${oshi ? '。推し活もしてます' : ''}。` : `趣味は${h[0]}です。よろしくお願いします。`;
    return;
  }
  // 生成した自己紹介文（2026-11-23。性別・充実度・雰囲気ごとに何十通り）があればそれを使う。お酒を飲まない人には、お酒に触れた文を使わない
  const bio = pickBio(rng, n, depth, h, job);
  if (depth === 'normal') {
    n.profileText = (bio ?? normalText) + (oshi ? ' 推し活もしています！' : '');
    return;
  }
  if (bio) {
    n.profileText = bio + (oshi ? '\n推し活も生きがいです笑' : '');
    return;
  }
  const lines = [
    rng.pick(['はじめまして！プロフィールを見てくださりありがとうございます。', 'はじめまして。数あるプロフィールの中から見ていただきありがとうございます！']),
    `仕事は${job}です。${rng.pick(n.holiday === 'weekend' ? WORK_NOTES_WEEKEND : WORK_NOTES_SHIFT)}`,
    `休日は${h[0] ?? '散歩'}${h[1] ? `や${h[1]}` : ''}をして過ごすことが多いです。${oshi ? '推し活も生きがいです笑' : ''}`,
    rng.pick(FOOD_NOTES),
    `好きなタイプは、${rng.pick(TYPES)}です。`,
    closing(rng, n.purpose),
  ];
  n.profileText = lines.join('\n');
}

function toneOf(purpose: Purpose): 'serious' | 'light' | 'common' {
  return purpose === 'sincere' || purpose === 'married' ? 'serious' : purpose === 'body' || purpose === 'ambiguous' || purpose === 'bijin' ? 'light' : 'common';
}
function pickBio(rng: Rng, n: Npc, depth: 'normal' | 'rich', hobbies: string[], job: string): string | undefined {
  const pool = (PROFILE_BIOS[n.gender]?.[depth]?.[toneOf(n.purpose)] ?? []).filter((b) => n.drinking !== 'none' || !/お酒|飲み|ビール|ワイン/.test(b));
  if (pool.length === 0) return undefined;
  const food = rng.pick(['焼肉', 'ラーメン', 'パスタ', 'お寿司', 'カレー', '韓国料理', 'イタリアン']);
  const v: Record<string, string> = { job, hobby: hobbies[0] ?? '散歩', hobby2: hobbies[1] ?? hobbies[0] ?? '読書', food };
  return rng.pick(pool).replace(/\{(job|hobby2?|food)\}/g, (_m, k: string) => v[k]);
}

/** プロフィールから聞ける話題（2026-11-23）。bare は仕事と休日だけ、sparse は趣味・旅行・仕事・休日だけ */
export function askableTopics(npc: Npc): TopicId[] | undefined {
  if (npc.profileDepth === 'bare') return ['work', 'holiday'];
  if (npc.profileDepth === 'sparse') return ['hobby', 'travel', 'work', 'holiday'];
  return undefined;
}

/** プロフィールを見て一度に聞ける質問の数（2026-11-23 指示）：よろしくだけ2つ・5行以内（趣味だけ・ふつう）3つ・充実5つ */
export function profileQuestionLimit(npc: Npc): number {
  return npc.profileDepth === 'bare' ? 2 : npc.profileDepth === 'rich' ? 5 : 3;
}

/** プロフィールに書いてある趣味（bare は書いていない） */
export function shownHobbies(npc: Npc): string {
  return npc.profileDepth === 'bare' ? '未記入' : npc.hobbies.join('・');
}

/** こちらから質問するときの相手の趣味（推し活は質問しない） */
export function askableHobbies(hobbies: string[]): string[] {
  const h = hobbies.filter((x) => x !== OSHI);
  return h.length ? h : ['散歩'];
}
