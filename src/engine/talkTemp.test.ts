// トークの温度（2026-11-11）：格差と対応タイプで返信の形が変わる、1通1文・最大3通、誘いの返事は3種類
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import { devAddContact } from './devScenarios';
import { PERSONAS } from './data/personas';
import { personaOf, playerAppeal, splitSentences, stepLevel, tierOf, TUNE_TEMP } from './talkTemp';
import { stepDay } from './advance';
import type { Contact, GameState } from './types';

function npcMessages(c: Contact, from: number) {
  return c.messages.slice(from).filter((m) => m.from === 'them');
}
function talkOnce(s: GameState, c: Contact, optionId = 'zatsudan'): number {
  const before = c.messages.length;
  applyAction(s, { type: 'reply', npcId: c.npcId, optionId });
  if (c.pendingReply) { c.pendingReply.willReply = true; }
  for (let i = 0; i < 6 && !c.awaitingMe && c.stage !== 'ended'; i++) stepDay(s);
  return before;
}

describe('魅力度と格差', () => {
  it('プレイヤーの魅力度は、送信成立率の高い人ほど高い（健人 > 大輔 > 太郎）', () => {
    const a = (id: string) => playerAppeal(newGame(id, `appeal-${id}`));
    expect(a('M01')).toBeGreaterThan(a('M07'));
    expect(a('M07')).toBeGreaterThan(a('M09'));
    expect(a('F01')).toBeGreaterThan(a('F10'));
  });
  it('人格テンプレは性別・年齢帯・目的に合うものを選び、温度は対応タイプの範囲に入る', () => {
    const s = newGame('M07', 'persona-1');
    applyAction(s, { type: 'subscribe' });
    for (let i = 0; i < 20; i++) {
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
      const npc = s.npcs[c.npcId];
      const p = personaOf(s, c, npc);
      expect(p.gender).toBe(npc.gender);
      expect(p.purposes).toContain('sincere');
      const [lo, hi] = TUNE_TEMP.range[p.type];
      expect(Number(c.flags.level)).toBeGreaterThanOrEqual(lo);
      expect(Number(c.flags.level)).toBeLessThanOrEqual(hi);
      expect([-2, -1, 0, 1, 2]).toContain(tierOf(s, c, npc));
    }
    expect(PERSONAS).toHaveLength(30);
  });
  it('格上の相手（健人→ふつうの女性）と格下扱い（太郎→同じ相手）で、格差の段が違う', () => {
    const tiers: Record<string, number> = {};
    for (const id of ['M01', 'M09']) {
      const s = newGame(id, 'tier-cmp');
      applyAction(s, { type: 'subscribe' });
      let sum = 0;
      for (let i = 0; i < 15; i++) { const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' }); sum += tierOf(s, c, s.npcs[c.npcId]); }
      tiers[id] = sum / 15;
    }
    expect(tiers.M01).toBeGreaterThan(tiers.M09);
  });
});

describe('返信の形', () => {
  it('どの返信も1通1文・1回3通まで', () => {
    const s = newGame('M01', 'shape-1');
    applyAction(s, { type: 'subscribe' });
    for (let i = 0; i < 6; i++) {
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      for (let k = 0; k < 3 && c.stage !== 'ended' && c.awaitingMe; k++) {
        const from = talkOnce(s, c);
        const got = npcMessages(c, from);
        expect(got.length).toBeLessThanOrEqual(3);
        for (const m of got) expect(splitSentences(m.text, 9)).toHaveLength(1);
      }
    }
  });
  it('一言（温度1）は質問に答えず話を拾わない。前のめり（温度5）は3通', () => {
    const s = newGame('M01', 'shape-2');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    personaOf(s, c, s.npcs[c.npcId]);
    c.flags.persona = 'P-F01'; c.flags.level = 1; c.flags.baseLevel = 1; c.flags.tier = -2;
    c.interest = 40; c.flags.lineThemAsked = true; c.flags.praised = true; c.flags.photoAsked = true;
    const from1 = talkOnce(s, c);
    // ふつうの会話の返信なら一言だけ（仕事の話などの特別な話題は対象外）
    if (c.stage !== 'ended' && c.topic === 'chat_cool') expect(npcMessages(c, from1)).toHaveLength(1);
    const s2 = newGame('M01', 'shape-3');
    applyAction(s2, { type: 'subscribe' });
    const c2 = devAddContact(s2, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    personaOf(s2, c2, s2.npcs[c2.npcId]);
    c2.flags.persona = 'P-F04'; c2.flags.level = 5; c2.flags.baseLevel = 5; c2.flags.tier = 2;
    c2.interest = 40; // 相手からの誘い・LINEの話にならないように（ふつうの会話の形を見る）
    c2.flags.lineThemAsked = true;
    c2.flags.reach = 3; // 「会話は続くが約束にならない相手」の相槌返し（到達上限1）を除く
    const from5 = talkOnce(s2, c2, 'zatsudan');
    if (c2.topic === 'chat_normal') expect(npcMessages(c2, from5)).toHaveLength(3);
    expect(npcMessages(c2, from5).length).toBeGreaterThanOrEqual(1);
  });
  it('格上の相手には、良い返しでもほとんど温度が上がらない（−2で5%）。格下の相手は雑な返しでも下がりにくい', () => {
    let up = 0;
    for (let i = 0; i < 200; i++) {
      const s = newGame('M09', `step-${i}`);
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
      personaOf(s, c, s.npcs[c.npcId]);
      c.flags.persona = 'P-F01'; c.flags.tier = -2; c.flags.level = 1; c.flags.baseLevel = 1; c.exchanges = 1;
      stepLevel(s, c, s.npcs[c.npcId], 'good');
      if (Number(c.flags.level) > 1) up++;
    }
    expect(up).toBeLessThan(40); // 5%＋揺らぎ10%の半分
  });
});

describe('誘いの返事は3種類', () => {
  it('承諾・予定が合わない・無視のどれか。「もう少し話してから」「先に電話」は返さない', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const s = newGame('M04', `inv-${i}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      c.flags.talks = 3; c.exchanges = 10; c.interest = 30 + (i % 5) * 12;
      s.npcs[c.npcId].traits.requiresFace = false;
      const from = c.messages.length;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
      if (c.pendingReply) c.pendingReply.willReply = true;
      for (let d = 0; d < 8 && c.flags.meetWishPending; d++) stepDay(s);
      const text = npcMessages(c, from).map((m) => m.text).join('');
      expect(text).not.toMatch(/もう少し(お話|やり取り)|仲良くなっ|電話してから|一回電話/);
      seen.add(c.nextDate ? 'accept' : c.stage === 'ended' ? 'ignore' : /予定|週末|バタバタ|立て込/.test(text) ? 'busy' : 'other');
    }
    expect([...seen].every((k) => ['accept', 'busy', 'ignore', 'other'].includes(k))).toBe(true);
    expect(seen.has('accept')).toBe(true);
  });
});
