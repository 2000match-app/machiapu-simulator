// ウケ狙いの痛いプロフィール・メッセージを送ってくる人（2026-11-27 指示）。
// ・容姿2〜4の相手の2%。サクラ・業者・詐欺・美人局など、作られた人物にはしない
// ・プロフィールは「‼️」だらけのノリの自己紹介。トークは最初に「こんばんワニ🐊‼️」などのダジャレの挨拶を送ってきて、
//   「！」が「‼️」になり、ときどき自分でボケて「ごめんスベった」などと付け足す
// 別の乱数列を使い、ほかの抽選・会話の流れはずらさない。
import { Rng } from './rng';
import type { Contact, Npc, Purpose } from './types';

export const TUNE_CRINGE = {
  /** 対象（容姿2〜4・作られた人物でない）の中での確率。サクラ・業者などを除くので、容姿2〜4の相手全体では約2% */
  chance: 0.025,
  minLooks: 2,
  maxLooks: 4,
  /** 返信の最後に、自分でボケた一言を付け足す確率 */
  gagChance: 0.3,
} as const;

const CRINGE_PURPOSES: Purpose[] = ['sincere', 'ambiguous', 'body', 'profit', 'married'];

/** 痛い人にするか（容姿・目的が決まった後に呼ぶ） */
export function rollCringe(seed: string, n: Npc): boolean {
  if (n.looks < TUNE_CRINGE.minLooks || n.looks > TUNE_CRINGE.maxLooks) return false;
  if (!CRINGE_PURPOSES.includes(n.purpose) || n.nightWork) return false;
  return Rng.fromSeed(seed, 'cringe', n.id).chance(TUNE_CRINGE.chance);
}

/** 痛いプロフィール文 */
export function cringeBio(seed: string, n: Npc): string {
  const r = Rng.fromSeed(seed, 'cringe-bio', n.id);
  const hobby = n.hobbies[0] ?? '散歩';
  const job = n.job.replace(/（.*）/, '');
  const status = n.marital === 'divorced' ? 'バツイチ' : '独身';
  const lines: string[] = [];
  if (n.gender === 'F') {
    lines.push(r.pick([
      `${n.age}歳${status}‼️‼️‼️`,
      `${n.age}歳、${job}やってまーす‼️‼️`,
      `ど〜も〜‼️${n.age}歳${status}です‼️‼️`,
    ]));
    lines.push(r.pick([
      'もう恋愛とかいいや‼️って思ってたけど、やっぱ彼ピ欲しくなって登録しました‼️‼️ガハハ‼️‼️',
      '友達に「アンタそろそろ本気出しな」って言われて登録‼️本気出します‼️‼️',
      'ゼクシィ買う予定ありますか‼️❓あたしはあります‼️‼️（気が早い）',
    ]));
    lines.push(r.pick([
      `趣味は${hobby}‼️語らせたら朝までいけます‼️‼️`,
      `${hobby}が好きすぎて生きてる‼️‼️`,
    ]));
  } else {
    lines.push(r.pick([
      `${n.age}歳${status}‼️‼️‼️`,
      `どうも‼️${job}やってる${n.age}歳です‼️‼️`,
      `${n.age}歳、心はまだ二十歳‼️‼️‼️`,
    ]));
    lines.push(r.pick([
      '彼女いない歴は聞かないでください‼️‼️泣きます‼️‼️ガハハ‼️‼️',
      '友達には「黙ってればイケメン」って言われます‼️‼️しゃべります‼️‼️',
      '今年こそ彼女作るって毎年言ってます‼️‼️今年こそ‼️‼️',
    ]));
    lines.push(r.pick([
      `趣味は${hobby}‼️一緒にやってくれる人募集中‼️‼️`,
      `${hobby}なら任せてください‼️‼️（たぶん）`,
    ]));
  }
  if (n.smoking === 'yes') lines.push(r.pick(['爆裂喫煙者‼️アイコス派とは分かり合えない‼️紙巻きしか勝たん‼️‼️', 'タバコは吸います‼️ごめんなさい‼️やめる気はない‼️‼️']));
  if (n.drinking === 'yes') lines.push(r.pick(['鬼酒飲み‼️休肝日って何ですか‼️❓', 'お酒は毎日飲みます‼️肝臓とは友達‼️‼️']));
  lines.push(r.pick(['絶対マッチしような😅‼️‼️‼️', 'いいね押したら最後、トークで沼らせます🤙‼️‼️', 'とりあえず飲み行こ‼️話はそれから‼️‼️']));
  return lines.join('\n');
}

/** 最初の挨拶（時間帯のダジャレ） */
export function cringeGreeting(minute: number, r: Rng): string {
  const h = Math.floor(minute / 60) % 24;
  if (h >= 5 && h < 11) return r.pick(['おはようございマンモス🦣‼️', 'おはヨーグルト‼️‼️', 'おっはー‼️‼️（古い）']);
  if (h >= 11 && h < 17) return r.pick(['こんにちワン🐶‼️', 'こんにちはっぴー‼️‼️', 'ちわっす‼️‼️']);
  return r.pick(['こんばんワニ🐊‼️', 'こんばんみ〜‼️‼️', 'ばんわ〜‼️‼️こんばんワニ🐊‼️']);
}

/** 「！」を「‼️」にして、語尾をうるさくする */
export function cringify(text: string, r: Rng): string {
  let t = text.replace(/[！!]+/g, '‼️');
  if (/。$/.test(t) && r.chance(0.5)) t = t.replace(/。$/, '‼️‼️');
  else if (/笑$/.test(t) && r.chance(0.5)) t = t.replace(/笑$/, 'ガハハ‼️');
  return t;
}

/** 返信の最後に付け足すボケ。こちらが「好き」と言っていたら「お、俺のことが…？」 */
export function cringeGag(c: Contact, npc: Npc, r: Rng): string[] | undefined {
  const lastMine = [...c.messages].reverse().find((m) => m.from === 'me');
  if (lastMine && lastMine.text.includes('好き') && !c.flags.cringeSuki) {
    c.flags.cringeSuki = true;
    return [`お、${npc.gender === 'M' ? '俺' : 'あたし'}のことが…？`, 'ごめんスベった'];
  }
  if (!r.chance(TUNE_CRINGE.gagChance)) return undefined;
  return [r.pick(['なんつって‼️‼️', 'ガハハ‼️‼️', '知らんけど‼️‼️', '今のちょっと面白くなかった？笑', '（ドヤ顔）', 'ごめんスベった'])];
}
