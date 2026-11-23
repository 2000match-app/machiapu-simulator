// 温度ごとの相手の返信文（トーク仕様案 v0.2 §3・§4、2026-11-11）。
// 文面は人格テンプレのトークパック（第3段階）から引き、温度で形を変える。パックがない相手は汎用文。
// ・1 一言：話を拾わない（質問されていても答えない）
// ・2 短い答え：聞かれたことに短く答えるだけ
// ・3 ふつう：答えて、質問傾向しだいで聞き返す（受け身の人は聞き返さない）
// ・4 乗り気：自分の話を足して2〜3通
// ・5 前のめり：話を合わせて3通
// どれも1通1文、1回3通まで。
import { CHAT } from './data/dialogue';
import { npcConvMessage, npcCurtMessage, npcEagerLine, npcInviteLines, npcOneWord, playerHobbies } from './conversation';
import { sayLines } from './messaging';
import { isQuestion, personaOf, splitSentences, type Level } from './talkTemp';
import { withRng } from './state';
import type { Contact, GameState, Npc } from './types';

/** 会う前のふつうの会話で、温度に合わせた相手の返信（1通1文の配列） */
export function npcChatByLevel(state: GameState, c: Contact, npc: Npc, level: Level): string[] {
  const p = personaOf(state, c, npc);
  if (level === 1) {
    // 一言：質問されていても答えない（話を拾わない）
    c.flags.myAct = '';
    c.flags.convAct = 'tell';
    return [npcOneWord(state, c, npc) ?? withRng(state, (r) => sayLines(state, npc, CHAT.chat_cool, r))];
  }
  if (level === 2) return splitSentences(npcCurtMessage(state, c, npc), 1);
  // 乗り気以上は自分の話を足すので、もとの返信は2通までに収めておく（大事な部品から残す）
  let bubbles = splitSentences(npcConvMessage(state, c, npc, level >= 4 ? 2 : level === 3 ? 2 : 3), 6);
  // 受け身・質問傾向が低い人は聞き返さない（好意があっても）
  if (p.question === 'low' || p.type === 'passive') {
    const kept = bubbles.filter((b) => !isQuestion(b));
    if (kept.length > 0 && kept.length < bubbles.length) {
      bubbles = kept;
      c.flags.convAct = 'tell';
      c.flags.askBack = false;
    }
  }
  if (level >= 4) {
    // 自分の話を足す（質問の前に）
    const h = npc.hobbies[0] ?? '散歩';
    const extra = npcEagerLine(state, c, npc, 'disclose') ?? withRng(state, (r) => r.pick([`最近は${h}にハマってて、休みの日はだいたいそれです笑`, `${h}の話になると、つい長くなっちゃいます笑`, `この前も${h}で一日終わりました笑`, `${h}のことなら何時間でも話せます笑`]));
    const qi = bubbles.findIndex(isQuestion);
    // 自己開示が2文のこともあるので、1通1文に分けてから入れる（3通の上限を正しく数える。2026-11-23）
    const ex = extra ? splitSentences(extra, 9) : [];
    if (ex.length) bubbles = qi >= 0 ? [...bubbles.slice(0, qi), ...ex, ...bubbles.slice(qi)] : [...bubbles, ...ex];
  }
  if (level === 5) {
    // 話を合わせる（共通の趣味があればそれに、なければ大きめのリアクション）
    const shared = playerHobbies(state).find((h) => npc.hobbies.includes(h));
    const claim = npcEagerLine(state, c, npc, shared ? 'shared' : 'match', shared) ?? withRng(state, (r) => shared
      ? r.pick([`え、${shared}好きなんですか！`, `${shared}、私もめっちゃ好きです！`, `${shared}の話できるの嬉しいです！`])
      : r.pick(['えー、それめっちゃいいですね！', 'わかります！絶対気が合います笑', 'それすごく気になります！']));
    if (claim) bubbles = [...splitSentences(claim, 1), ...bubbles];
    if (!bubbles.some(isQuestion)) bubbles.push(withRng(state, (r) => r.pick(['今週末とか何してるんですか？', 'ほかにハマってることってあります？', 'もっといろいろ聞きたいです！'])));
  }
  // 乗り気以上は絵文字も増える（その人が絵文字を使う人なら）
  if (level >= 4 && p.emoji !== 'none' && bubbles.length > 0 && !/[\p{Extended_Pictographic}笑]$/u.test(bubbles[0])) {
    bubbles[0] += withRng(state, (r) => r.pick(['☺️', '😊', '笑']));
  }
  return capKeepQuestion(bubbles, level >= 4 ? 3 : 2);
}

/** 最大 n 通に収める。質問があれば最後の質問は残す */
function capKeepQuestion(bubbles: string[], n: number): string[] {
  if (bubbles.length <= n) return bubbles;
  const qi = bubbles.map(isQuestion).lastIndexOf(true);
  if (qi < 0) return bubbles.slice(0, n);
  // 「それとも〜？」のように前の文に続く質問は、前の文と一緒に残す（2026-11-23）
  const keep = qi > 0 && /^(それとも|あと|じゃあ|ちなみに)/.test(bubbles[qi]) ? [qi - 1, qi] : [qi];
  const rest = bubbles.filter((_, i) => !keep.includes(i)).slice(0, Math.max(0, n - keep.length));
  return [...rest, ...keep.map((i) => bubbles[i])];
}

/** 最初の返信（挨拶）。温度が低いほど挨拶だけ、高いほど2〜3通 */
export function greetByLevel(state: GameState, _c: Contact, npc: Npc, level: Level, curtPool: { toMale: string[]; toFemale: string[] }, warmPool: { toMale: string[]; toFemale: string[] }): string[] {
  if (level <= 2) return splitSentences(withRng(state, (r) => sayLines(state, npc, curtPool, r)), 1);
  const base = splitSentences(withRng(state, (r) => sayLines(state, npc, warmPool, r)), 3);
  if (level === 5 && base.length < 3) base.push(withRng(state, (r) => r.pick(['プロフィール見て、話してみたいなって思ってました！', 'メッセージもらえてすごく嬉しいです！'])));
  return base.slice(0, level >= 4 ? 3 : 2);
}

/** 誘いへの返事「予定が合わない」（別の日を出さない＝実質のお断り。トーク仕様案 v0.2 §3.7） */
export function busyLines(state: GameState, c: Contact, npc: Npc): string[] {
  const p = personaOf(state, c, npc);
  const fromPack = npcInviteLines(state, c, npc, 'busy');
  if (fromPack) return fromPack;
  return withRng(state, (r) => {
    if (p.type === 'polite') return r.pick([['お誘いありがとうございます。', 'ただ、しばらく週末の予定が埋まっていて…'], ['ありがとうございます。', 'あいにく今月は予定が立て込んでいて、難しそうです。']]);
    if (p.type === 'salty') return r.pick([['すみません、しばらく予定合わないです。'], ['ちょっと予定が合わなそうです。']]);
    if (p.politeness === 'casual') return r.pick([['ごめん、しばらく予定合わなそう…'], ['ごめんね、今ちょっとバタバタしてて。']]);
    return r.pick([['すみません、しばらく予定が合わなさそうです。'], ['ごめんなさい、今月はちょっと予定が詰まってて…'], ['ありがとうございます。', 'でもしばらく週末が埋まってて、ちょっと難しいです。']]);
  });
}

/**
 * まだあまり話していないのに誘われたときの返事（2026-11-14 指示：「予定が合わない」と見分けがつくように、
 * 「もう少し話してから」「そのうちぜひ」と返す）
 */
export function tooEarlyLines(state: GameState, c: Contact, npc: Npc): string[] {
  const p = personaOf(state, c, npc);
  return withRng(state, (r) => {
    if (p.type === 'polite') return r.pick([['お誘いありがとうございます！', 'もう少しメッセージでお話ししてからだと嬉しいです。'], ['ありがとうございます。', 'もう少しお互いのことを知ってからお会いできたらと思います。']]);
    if (p.type === 'salty') return r.pick([['まだちょっと早いかなって思います。'], ['もう少し話してからでもいいですか？']]);
    if (p.politeness === 'casual') return r.pick([['ありがと！', 'もうちょっと話してからにしよ笑'], ['そのうちぜひ！', 'もう少しお互いのこと知ってからがいいな']]);
    return r.pick([['ありがとうございます、そのうちぜひ！', 'もう少しお話ししてからだと嬉しいです。'], ['嬉しいです！', 'でもまだお互いのことあまり知らないので、もう少しお話ししてからにしませんか？']]);
  });
}

/** 誘いへの返事「承諾」（温度で言い方が変わる） */
export function acceptLines(state: GameState, c: Contact, npc: Npc, level: Level): string[] {
  const p = personaOf(state, c, npc);
  // 塩対応・低い温度は短く。それ以外は人格テンプレの承諾の文
  const fromPack = p.type !== 'salty' && level >= 3 ? npcInviteLines(state, c, npc, 'accept') : undefined;
  if (fromPack) return fromPack.slice(0, level >= 4 ? 3 : 2);
  return withRng(state, (r) => {
    if (p.type === 'salty') return ['いいですよ'];
    if (p.type === 'polite') return ['お誘いありがとうございます。', '楽しみにしています。'];
    if (level >= 5) return r.pick([['え、行きたいです！', '楽しみにしてます！'], ['行きましょう！', 'めっちゃ楽しみです笑']]);
    if (level === 4) return ['いいですね、行きましょう！', '楽しみにしてます！'];
    if (level === 3) return r.pick([['いいですね、行きましょう。'], ['楽しみにしてます！']]);
    return ['いいですよ'];
  });
}
