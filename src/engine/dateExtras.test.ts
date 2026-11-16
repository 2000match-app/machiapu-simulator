// デートの追加要素・年収の表記（2026-11-12 指示）
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import { startDate } from './dates';
import { devAddContact } from './devScenarios';
import { loadReceived } from './matching';
import { incomeOf } from '../ui/format';

describe('年収の表記', () => {
  it('幅で出す（秘密・未記載・400万円以下〜1000万円以上）', () => {
    expect(incomeOf({ incomeYen: 3_800_000 })).toBe('400万円以下');
    expect(incomeOf({ incomeYen: 4_000_000 })).toBe('400万円以下');
    expect(incomeOf({ incomeYen: 5_200_000 })).toBe('400万〜600万円');
    expect(incomeOf({ incomeYen: 7_000_000 })).toBe('600万〜800万円');
    expect(incomeOf({ incomeYen: 9_990_000 })).toBe('800万〜1000万円');
    expect(incomeOf({ incomeYen: 15_000_000 })).toBe('1000万円以上');
    expect(incomeOf({ incomeYen: 5_000_000, incomeHidden: '秘密' })).toBe('秘密');
    expect(incomeOf({ incomeYen: 5_000_000, incomeHidden: '未記入' })).toBe('未記載');
  });
});

describe('身長のサバ読み', () => {
  it('166〜169cmと書く男性は少なく、170〜172cmと書く人の一部は本当は低い', () => {
    const all: import('./types').Npc[] = [];
    for (let k = 0; k < 4; k++) {
      const s = newGame('F03', `height-${k}`);
      s.received.unseen = 300;
      for (const id of loadReceived(s, 300, false)) all.push(s.npcs[id]);
    }
    const shown = (lo: number, hi: number) => all.filter((n) => n.heightCm >= lo && n.heightCm <= hi).length;
    expect(shown(166, 169)).toBeLessThan(shown(170, 172));
    const liars = all.filter((n) => n.realHeightCm);
    expect(liars.length).toBeGreaterThan(0);
    for (const n of liars) {
      expect(n.realHeightCm).toBeGreaterThanOrEqual(166);
      expect(n.realHeightCm).toBeLessThanOrEqual(169);
      expect(n.heightCm).toBeGreaterThanOrEqual(170);
      expect(n.heightCm).toBeLessThanOrEqual(172);
    }
  });
  it('初めて会うと、本当の身長が分かる', () => {
    const s = newGame('F03', 'height-date');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const npc = s.npcs[c.npcId];
    npc.realHeightCm = 167; npc.heightCm = 171; npc.traits.misrepresented = false; npc.fakeTitle = undefined; npc.realIncomeYen = undefined;
    c.stage = 'scheduled'; c.nextDate = { day: s.day, tier: 'cafe', proposedBy: 'me' };
    s.flags[`dev:noshow:${c.npcId}`] = '0';
    startDate(s, c);
    const talk = s.pending.find((p) => p.kind === 'date_talk');
    expect(talk?.lines.some((l) => l.text.includes('167cm'))).toBe(true);
  });
});

describe('デートの前のメイク（女性）', () => {
  it('3回押してからデートの場面になる', () => {
    const s = newGame('F01', 'makeup');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.stage = 'scheduled'; c.nextDate = { day: s.day, tier: 'cafe', proposedBy: 'me' };
    startDate(s, c);
    const labels: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ev = s.pending[0];
      expect(ev.kind).toBe('date_makeup');
      labels.push(ev.choices[0].label);
      applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'next' });
    }
    expect(labels).toHaveLength(3);
    expect(s.pending[0]?.kind).not.toBe('date_makeup');
  });
  it('男性にはメイクの場面は出ない', () => {
    const s = newGame('M01', 'no-makeup');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.stage = 'scheduled'; c.nextDate = { day: s.day, tier: 'cafe', proposedBy: 'me' };
    startDate(s, c);
    expect(s.pending.some((p) => p.kind === 'date_makeup')).toBe(false);
  });
});

describe('デート後の「また会いたい」の伝え方（2026-11-14）', () => {
  it('社交辞令＜本気＜本気＋LINE＜本気＋日程の提案の順に、振られたときのライフの減りが大きい', async () => {
    const { endContact } = await import('./contact');
    const { SPEC_LOSS } = await import('./data/rules');
    const { WISH_MULT } = await import('./dates');
    const drop = (choice: string | undefined) => {
      const s = newGame('F03', 'wish-mult');
      const c = devAddContact(s, { purpose: 'sincere', stage: 'dating' });
      c.meetings = 1;
      if (choice) c.flags.wishMult = WISH_MULT[choice];
      const before = s.life;
      endContact(s, c, { by: 'them', cause: '対面後のお断り', eventId: 'E17', base: SPEC_LOSS.E17, visible: 'x' });
      return before - s.life;
    };
    const polite = drop('more_polite');
    const sincere = drop('more');
    const line = drop('more_line');
    const plan = drop('next_plan');
    expect(polite).toBeLessThan(sincere);
    expect(sincere).toBeLessThan(line);
    expect(line).toBeLessThan(plan);
  });
  it('デートの終わりに、社交辞令・本気・次の日程の提案を選べる', () => {
    const s = newGame('M01', 'wish-choices');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    c.nextDate = { day: s.day, tier: 'cafe', proposedBy: 'me' };
    c.lineExchanged = true;
    startDate(s, c);
    for (let i = 0; i < 10; i++) {
      const ev = s.pending.find((p) => p.npcId === c.npcId);
      if (!ev || ev.kind === 'date_end') break;
      applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id });
    }
    const end = s.pending.find((p) => p.kind === 'date_end');
    if (!end) return; // ドタキャンなどで会えなかった
    const ids = end.choices.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['more_polite', 'more', 'next_plan', 'end']));
  });
});

describe('交際スタートの順番（2026-11-16）', () => {
  it('「交際スタート」を閉じてから「ほかの相手とのやり取り」を聞く', async () => {
    const { startRelationship } = await import('./relationship');
    const s = newGame('F03', 'rel-order');
    const a = devAddContact(s, { purpose: 'sincere', stage: 'dating' });
    devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    a.meetings = 2;
    startRelationship(s, a);
    expect(s.pending.map((p) => p.kind)).toContain('rel_start');
    expect(s.pending.map((p) => p.kind)).not.toContain('rel_others');
    const ev = s.pending.find((p) => p.kind === 'rel_start')!;
    applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'ok' });
    expect(s.pending.map((p) => p.kind)).toContain('rel_others');
  });
});

describe('当日キャンセルの後の返事（2026-11-16）', () => {
  it('キャンセルの連絡には、ふつうの会話ではなく返し方の選択肢が出る', async () => {
    const { dayCancel } = await import('./dates');
    const { replyOptions } = await import('./chat');
    const s = newGame('M01', 'day-cancel');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    c.nextDate = { day: s.day, tier: 'cafe', proposedBy: 'me' };
    s.flags[`dev:daycancel:${c.npcId}`] = '1';
    expect(dayCancel(s, c)).toBe(true);
    const ids = replyOptions(s, c).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['dc_ok', 'dc_short', 'dc_complain', 'dc_end']));
    expect(ids).not.toContain('aizuchi');
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'dc_ok' });
    expect(c.messages.some((m) => m.from === 'me' && m.text.includes('都合のいい日'))).toBe(true);
  });
  it('修正前のセーブ（キャンセルの話題がふつうの会話になっている）でも、キャンセルへの返し方が出る', async () => {
    const { replyOptions } = await import('./chat');
    const s = newGame('F01', 'day-cancel-old');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.dates.push({ day: s.day, tier: 'cafe', costYen: 0, outcome: 'canceled', notes: [], impression: 'bad' });
    c.messages.push({ day: s.day, from: 'them', text: '家の用事が入ってしまって…' } as never);
    c.topic = 'chat_cool';
    c.awaitingMe = true;
    expect(replyOptions(s, c).map((o) => o.id)).toContain('dc_ok');
  });
});

describe('誘った店と承諾の文面（2026-11-16）', () => {
  it('カフェに誘ったときは、食事・お酒の承諾の文を使わない（どの人格にもカフェに合う文がある）', async () => {
    const { fitsInviteTier } = await import('./conversation');
    const { NPC_TALK } = await import('./data/talkPacks');
    expect(fitsInviteTier('ぜひぜひ美味しいもの食べに行きましょー🍺', 'cafe')).toBe(false);
    expect(fitsInviteTier('ぜひ！お茶しましょう', 'cafe')).toBe(true);
    expect(fitsInviteTier('ぜひ！お茶しましょう', 'casual')).toBe(false);
    for (const [id, pack] of Object.entries(NPC_TALK)) {
      const ok = ((pack as { invite_accept?: string[] }).invite_accept ?? []).filter((t) => fitsInviteTier(t, 'cafe'));
      expect(ok.length, id).toBeGreaterThan(0);
    }
  });
});
