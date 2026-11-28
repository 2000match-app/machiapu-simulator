// あしあと・新規会員の傾斜（2026-11-28 指示）
import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { advanceDays, devNewGame, nextCandidate } from './devScenarios';
import { likedVisitChance, visibleFootprints } from './footprints';
import { newcomerFactor } from './matching';

describe('受信いいねの新規会員の傾斜', () => {
  it('初週がいちばん多く、だんだん減って0.8倍に落ち着く', () => {
    const avg = (a: number, b: number) => { let s = 0; for (let d = a; d < b; d++) s += newcomerFactor(d); return s / (b - a); };
    expect(avg(0, 7)).toBeGreaterThan(1.6);
    expect(avg(7, 14)).toBeLessThan(avg(0, 7));
    expect(avg(21, 28)).toBeLessThan(avg(7, 14));
    expect(newcomerFactor(90)).toBeCloseTo(0.8, 1);
    // 3か月の平均はほぼ以前と同じ
    expect(avg(0, 90)).toBeGreaterThan(0.9);
    expect(avg(0, 90)).toBeLessThan(1.05);
  });

  it('放置していても、1週目の受信いいねは4週目より多い', () => {
    let w1 = 0, w4 = 0;
    for (let i = 0; i < 6; i++) {
      const s = devNewGame('F03', `newcomer-${i}`);
      const t0 = s.received.total;
      advanceDays(s, 7); w1 += s.received.total - t0;
      advanceDays(s, 14); const t21 = s.received.total;
      advanceDays(s, 7); w4 += s.received.total - t21;
    }
    expect(w1).toBeGreaterThan(w4 * 1.4);
  });
});

describe('あしあと', () => {
  it('いいねを送った相手の多くが、数日のうちにあしあとに出る', () => {
    const s = devNewGame('M07', 'fp-liked');
    const liked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = nextCandidate(s);
      applyAction(s, { type: 'like', npcId: id });
      liked.push(id);
    }
    advanceDays(s, 3);
    const seen = new Set(visibleFootprints(s).map((f) => f.npcId));
    expect(liked.filter((id) => seen.has(id)).length).toBeGreaterThanOrEqual(13);
  });

  it('いいねを送った相手が見に来る確率は、自分の魅力度が高いほど高い', () => {
    const pair = (hi: string, lo: string) => {
      const a = devNewGame(hi, 'fp-chance');
      const b = devNewGame(lo, 'fp-chance');
      const npc = a.npcs[nextCandidate(a)];
      return [likedVisitChance(a, npc), likedVisitChance(b, npc)];
    };
    const [kento, taro] = pair('M01', 'M09');
    expect(kento).toBeGreaterThan(taro + 0.3);
    const [mai, nao] = pair('F01', 'F10');
    expect(mai).toBeGreaterThan(nao + 0.3);
    expect(nao).toBeGreaterThanOrEqual(0.2);
  });

  it('見ただけの人は一覧を開くとプロフィールが作られ、こちらからいいねできる', () => {
    const s = devNewGame('M05', 'fp-visit');
    s.footprintVisitors = 5;
    applyAction(s, { type: 'loadFootprints', count: 5 });
    const visitors = visibleFootprints(s).filter((f) => f.visitor);
    expect(visitors.length).toBeGreaterThan(0);
    const id = visitors[0].npcId;
    applyAction(s, { type: 'like', npcId: id });
    expect(s.contacts[id]?.stage).toBe('like_sent');
  });

  it('いいねをくれた相手のあしあとも残る', () => {
    const s = devNewGame('F08', 'fp-liker');
    advanceDays(s, 3);
    applyAction(s, { type: 'loadReceived', count: 10, onlyMatching: false });
    const fp = new Set(visibleFootprints(s).map((f) => f.npcId));
    const likers = s.received.queue;
    expect(likers.length).toBeGreaterThan(0);
    expect(likers.filter((id) => fp.has(id)).length).toBeGreaterThan(likers.length * 0.5);
  });
});
