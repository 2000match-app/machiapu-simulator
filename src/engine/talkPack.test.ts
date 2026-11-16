// トークパック（第3段階：人格テンプレの相手のセリフ／第4段階：プレイヤーの文面の選択肢）。2026-11-11
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import { stepDay } from './advance';
import { replyOptions } from './chat';
import { talkChoice, talkMenu } from './conversation';
import { devAddContact } from './devScenarios';
import { NPC_TALK, PLAYER_TALK } from './data/talkPacks';
import { CHARACTERS } from './data/characters';
import { PERSONAS } from './data/personas';
import { personaOf } from './talkTemp';
import { splitSentences } from './textSplit';

const flat = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat) : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : [];

describe('トークパックのデータ', () => {
  it('人格テンプレとプレイヤーのパックは、決まったIDだけ', () => {
    for (const id of Object.keys(NPC_TALK)) expect(PERSONAS.some((p) => p.id === id), id).toBe(true);
    for (const id of Object.keys(PLAYER_TALK)) expect(CHARACTERS.some((c) => c.id === id), id).toBe(true);
  });
  it('どの文も1項目3文まで', () => {
    for (const pack of [...Object.values(NPC_TALK), ...Object.values(PLAYER_TALK)]) {
      for (const s of flat(pack)) expect(splitSentences(s, 99).length, s).toBeLessThanOrEqual(3);
    }
  });
});

describe('会話の選択肢（2026-11-11 作り直し）', () => {
  it('相手が話したら 相槌・プロフィールを見て質問・電話してみたい、聞かれたら 詳しく・適当・ブロック。選んだ文面がそのまま送られる', () => {
    for (const id of ['M01', 'M07', 'F01', 'F03']) {
      const s = newGame(id, `opt-${id}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      c.flags.reach = 3;
      const npc = s.npcs[c.npcId];
      for (let turn = 0; turn < 5 && c.awaitingMe && c.stage !== 'ended'; turn++) {
        const ids = replyOptions(s, c).map((o) => o.id);
        const m = talkMenu(s, c, npc);
        if (!ids.includes('ans_d') && !ids.includes('profile_q')) break; // 仕事・勤務の話などの特別な話題
        let optionId: string;
        if (m.mode === 'question') {
          expect(ids.slice(0, 3)).toEqual(['ans_d', 'ans_c', 'block']);
          optionId = m.askedBack ? 'ans_c' : turn % 2 ? 'ans_d+back' : `ans_d+q:${m.questions[0].key}`;
        } else {
          expect(ids.slice(0, 3)).toEqual(['aizuchi', 'profile_q', 'callwish']);
          optionId = `q:${m.questions[0].key}`;
        }
        const plan = talkChoice(s, c, npc, optionId)!;
        expect(plan, optionId).toBeDefined();
        expect(plan.text).not.toMatch(/\{[a-z_]+\}/);
        expect(splitSentences(plan.text, 99).length).toBeLessThanOrEqual(3);
        const from = c.messages.length;
        applyAction(s, { type: 'reply', npcId: c.npcId, optionId });
        const sent = c.messages.slice(from).filter((x) => x.from === 'me').map((x) => x.text).join('');
        expect(sent).toBe(plan.text.replace(/[\s　]+/g, ''));
        if (c.pendingReply) c.pendingReply.willReply = true;
        for (let d = 0; d < 6 && !c.awaitingMe && (c.stage as string) !== 'ended'; d++) stepDay(s);
      }
    }
  });
  it('一度聞いた質問は、もう一覧に出ない', () => {
    const s = newGame('M01', 'asked-once');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    const npc = s.npcs[c.npcId];
    const key = talkMenu(s, c, npc).questions[0].key;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: `q:${key}` });
    c.awaitingMe = true; c.topic = 'chat_normal'; c.flags.convAct = 'tell';
    expect(talkMenu(s, c, npc).questions.map((q) => q.key)).not.toContain(key);
  });
  it('ブロックすると、やり取りが終わる（ライフは減らない）', () => {
    const s = newGame('F01', 'block');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    c.flags.convTopic = 'area'; c.flags.convAct = 'ask'; c.flags.askIdx = 0;
    const life0 = s.life;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'block' });
    expect(c.stage).toBe('ended');
    expect(s.life).toBe(life0);
  });
  it('人物の回答パックの趣味の答えが、その人物の答えになる', () => {
    for (const [id, pack] of Object.entries(PLAYER_TALK)) {
      const s = newGame(id, `hobby-${id}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      c.flags.convTopic = 'hobby'; c.flags.convAct = 'ask'; c.flags.askIdx = 0; c.flags.convUsed = 'hobby';
      expect(talkMenu(s, c, s.npcs[c.npcId]).casual).toBe(splitSentences(pack.answer.hobby[0][0], 9)[0]);
    }
  }, 30_000); // 20人分の新しいゲームを作るので、全体実行の負荷で5秒を超えることがある
});

describe('相手のセリフ（第3段階）', () => {
  it('人格テンプレのパックがある相手は、そのパックの文で返す（差し込みは埋まっている）', () => {
    const ids = Object.keys(NPC_TALK).filter((id) => id.startsWith('P-F'));
    expect(ids.length).toBeGreaterThan(0);
    let checked = 0;
    for (const [k, pid] of ids.entries()) {
      const s = newGame('M01', `pack-${k}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      personaOf(s, c, s.npcs[c.npcId]);
      c.flags.persona = pid; c.flags.level = 3; c.flags.baseLevel = 3; c.flags.tier = 1; c.flags.reach = 3;
      c.interest = 40; c.flags.lineThemAsked = true; c.flags.praised = true; c.flags.photoAsked = true; c.flags.jobAsked = true;
      c.flags.convTopic = 'food'; c.flags.convAct = 'tell'; c.flags.convUsed = 'food';
      const from = c.messages.length;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'q:d:food:0' });
      if (c.pendingReply) c.pendingReply.willReply = true;
      for (let d = 0; d < 6 && !c.awaitingMe && c.stage !== 'ended'; d++) stepDay(s);
      const said = c.messages.slice(from).filter((m) => m.from === 'them').map((m) => m.text);
      if (c.topic !== 'chat_normal' || said.length === 0) continue;
      checked++;
      for (const t of said) expect(t, pid).not.toMatch(/\{[a-z_]+\}/);
      // 返事のどれかの吹き出しは、そのパックの文（差し込みは何でもよい）と一致する
      const pack = NPC_TALK[pid];
      const esc = (x: string) => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[a-z_0-9]+\\?\}/g, '.+');
      const pats = flat(pack).flatMap((x) => splitSentences(x, 9)).map((x) => new RegExp(`^${esc(x)}$`, 'u'));
      expect(said.some((b) => pats.some((re) => re.test(b))), `${pid}: ${said.join(' / ')}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('2026-11-11 相槌と開いた質問', () => {
  function chat(seed: string) {
    const s = newGame('M01', seed);
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    return { s, c, npc: s.npcs[c.npcId] };
  }
  it('相手が話したら「そうなんですね」、はい・いいえの質問なら「そうですね」', () => {
    const a = chat('aizuchi-1');
    a.c.messages.push({ day: 0, from: 'them', text: '休日はカフェ巡りしてます！' }); a.c.flags.convAct = 'tell';
    expect(talkMenu(a.s, a.c, a.npc).aizuchi).toMatch(/^そうなんですね/);
    const b = chat('aizuchi-2');
    b.c.messages.push({ day: 0, from: 'them', text: 'お仕事忙しいですか？' }); b.c.flags.convAct = 'tell';
    const m = talkMenu(b.s, b.c, b.npc);
    expect(m.mode).toBe('question');
    expect(m.casual).toMatch(/^そうですね/);
  });
  it('会話の流れの外の開いた質問（休みの日は何してますか？）にも、答える選択肢が出る', () => {
    const { s, c, npc } = chat('open-q');
    c.messages.push({ day: 0, from: 'them', text: 'はじめまして！' }, { day: 0, from: 'them', text: '休みの日は何してますか？' });
    c.flags.convAct = '';
    expect(replyOptions(s, c).map((o) => o.id).slice(0, 3)).toEqual(['ans_d', 'ans_c', 'block']);
    const m = talkMenu(s, c, npc);
    expect(m.inferred?.t).toBe('holiday');
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'ans_d+back' });
    expect(c.flags.convTopic).toBe('holiday');
    expect(c.flags.myAct).toBe('answer_ask');
  });
});
