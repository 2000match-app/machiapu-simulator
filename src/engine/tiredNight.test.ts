// 疲れてアプリを開かずに寝てしまう日（2026-11-11 指示：健人・大輔は週2回）
import { describe, expect, it } from 'vitest';
import { newGame } from './actions';
import { stepDay } from './advance';
import { isTiredDay } from './privateEvents';
import { scheduleOf } from './clock';

function tiredDays(id: string, weeks: number): number[] {
  const s = newGame(id, `tired-${id}`);
  s.flags.noPrivateEvents = false;
  const out: number[] = [];
  while (s.day < weeks * 7 - 1 && s.status === 'playing') {
    stepDay(s);
    s.pending = [];
    s.flags.dayOpen = false;
    if (isTiredDay(s)) {
      out.push(s.day);
      // 2026-11-13：その日の夜は「残業・飲み会（帰って寝落ち）」の予定で、24時まで開けない
      expect(scheduleOf(s).some((b) => b.kind === 'event' && /寝落ち/.test(b.label) && b.end === 1440)).toBe(true);
    }
  }
  return out;
}

describe('疲れて寝てしまう日', () => {
  it('健人・大輔は平日に週2回（デートの日を除く）', () => {
    for (const id of ['M01', 'M07']) {
      const days = tiredDays(id, 8);
      for (const d of days) expect(d % 7).toBeLessThan(5); // 月〜金
      const perWeek = new Map<number, number>();
      for (const d of days) perWeek.set(Math.floor(d / 7), (perWeek.get(Math.floor(d / 7)) ?? 0) + 1);
      for (const n of perWeek.values()) expect(n).toBeLessThanOrEqual(2);
      expect(days.length).toBeGreaterThanOrEqual(10); // 8週で最大16日。デートの日などで少し減る
    }
  });
  it('ほかの人物には起きない', () => {
    expect(tiredDays('M04', 6)).toHaveLength(0);
    expect(tiredDays('F01', 6)).toHaveLength(0);
  });
});

describe('在宅ワークの日・土日の予定（麻衣・美咲）', () => {
  it('平日に週2日の在宅ワーク。土日のどちらかは予定で埋まり会えない', async () => {
    const { playerFree, privateEventOn, weekendPlan, workFromHome } = await import('./dates');
    for (const id of ['F01', 'F03']) {
      const s = newGame(id, `wfh-${id}`);
      for (let w = 0; w < 6; w++) {
        const days = [0, 1, 2, 3, 4, 5, 6].map((i) => w * 7 + i);
        expect(days.filter((d) => workFromHome(s, d))).toHaveLength(2);
        expect(days.filter((d) => workFromHome(s, d)).every((d) => d % 7 < 5)).toBe(true);
        const planned = days.filter((d) => weekendPlan(s, d));
        expect(planned).toHaveLength(1);
        expect(playerFree(s, planned[0])).toBe(false);
        expect(privateEventOn(s, planned[0])).toMatch(/ピラティス|友達とお出かけ/);
      }
    }
    const other = newGame('F08', 'wfh-other');
    expect([0, 1, 2, 3, 4].some((d) => workFromHome(other, d))).toBe(false);
  });
  it('在宅ワークの日にデートをするとライフ −1', async () => {
    const { startDate, workFromHome } = await import('./dates');
    const { devAddContact } = await import('./devScenarios');
    const s = newGame('F01', 'wfh-date');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    let d = 1; while (!workFromHome(s, d)) d++;
    s.day = d; c.stage = 'scheduled'; c.nextDate = { day: d, tier: 'cafe' } as typeof c.nextDate;
    const before = s.life;
    startDate(s, c);
    expect(s.ledger.some((e) => e.note.includes('在宅ワーク') && e.delta === -1)).toBe(true);
    expect(s.life).toBeLessThanOrEqual(before - 1);
  });
});

describe('2026-11-11 追加の指示', () => {
  it('「使い切ったら次の日」をオフにすると、スキップの回数に上限がない', async () => {
    const { applyAction } = await import('./actions');
    const s = newGame('M04', 'manual-day');
    applyAction(s, { type: 'setAutoNextDay', on: false });
    applyAction(s, { type: 'search' });
    const ids = s.search.results.slice(0, 7);
    for (const id of ids) applyAction(s, { type: 'skipSearch', npcId: id });
    expect(s.search.results.filter((x) => ids.includes(x))).toHaveLength(0);
    expect(s.flags.manualDay).toBe(true);
  });
  it('在宅ワークの日にデートを決めると、化粧が必要だと知らせる', async () => {
    const { applyAction } = await import('./actions');
    const { devAddContact } = await import('./devScenarios');
    const { resolveDatePick, workFromHome } = await import('./dates');
    const s = newGame('F03', 'wfh-popup');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    let d = 3; while (!workFromHome(s, d)) d++;
    c.stage = 'scheduled'; c.nextDate = { day: d, tier: 'cafe', proposedBy: 'me' };
    resolveDatePick(s, c, String(d));
    expect(s.pending.some((p) => p.kind === 'wfh_makeup')).toBe(true);
    applyAction(s, { type: 'resolve', uid: s.pending.find((p) => p.kind === 'wfh_makeup')!.uid, choiceId: 'ok' });
  });
  it('ふつうの相手は、3〜6往復までは誘っても「もう少しお話ししてから」と返される（2026-11-14）', async () => {
    const { applyAction } = await import('./actions');
    const { devAddContact } = await import('./devScenarios');
    const { inviteReady } = await import('./chat');
    const s = newGame('M01', 'invite-after');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    c.flags.talks = 4; c.exchanges = 1; // 誘いのメッセージで1往復増えても、3往復には届かない
    expect(inviteReady(s, c, s.npcs[c.npcId])).toBe(false);
    const n = Number(c.flags.inviteAfter);
    expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(6);
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
    expect(c.pendingReply?.kind).toBe('invite_ignored');
    // 返事は「予定が合わない」ではなく「もう少し話してから」
    const { tooEarlyLines } = await import('./talkLines');
    const lines = tooEarlyLines(s, c, s.npcs[c.npcId]).join('');
    expect(lines).toMatch(/話し|知|早い|そのうち/);
    expect(lines).not.toMatch(/予定/);
    c.exchanges = n;
    expect(inviteReady(s, c, s.npcs[c.npcId])).toBe(true);
  });
});

describe('2026-11-11 体調不良と寝落ちの場面', () => {
  it('寝落ちした日は場面を出さず、夜は予定として時間が進む（2026-11-13）', () => {
    const s = newGame('M07', 'tired-popup');
    s.flags.noPrivateEvents = false;
    let found = false;
    for (let d = 0; d < 14 && !found; d++) {
      stepDay(s);
      if (isTiredDay(s)) {
        found = true;
        expect(s.pending.some((p) => p.kind === 'tired_night')).toBe(false);
      }
      s.pending = []; s.flags.dayOpen = false;
    }
    expect(found).toBe(true);
  });
  it('熱が出たら、3日以内のデートはキャンセルする', async () => {
    const { applyAction } = await import('./actions');
    const { devAddContact } = await import('./devScenarios');
    const { cancelDatesUntil } = await import('./privateEvents');
    const s = newGame('F01', 'sick-date');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.stage = 'scheduled'; c.nextDate = { day: s.day + 2, tier: 'cafe', proposedBy: 'me' };
    expect(cancelDatesUntil(s, s.day + 2, '熱が出てしまって…')).toBe(1);
    expect(c.nextDate).toBeUndefined();
    expect(c.stage).toBe('talking');
    void applyAction;
  });
});
