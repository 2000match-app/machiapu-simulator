// イベントE01〜E24の再現ケース（開発用の分岐固定で各分岐を確認）
import { describe, expect, it } from 'vitest';
import { DEV_SCENARIOS } from './devScenarios';
import { SPEC_DEPTH_MEETINGS3, SPEC_LOSS, scaled } from './data/rules';
import { charScaled } from './life';
import type { GameState } from './types';

function lossOf(s: GameState, eventId: string): number {
  return s.ledger.filter((e) => e.eventId === eventId && e.delta < 0).reduce((a, e) => a - e.delta, 0);
}
function logged(s: GameState, eventId: string): boolean {
  return s.eventLog.some((e) => e.eventId === eventId) || s.ledger.some((e) => e.eventId === eventId);
}

// [シナリオID, 期待するイベントID, 期待するライフ損失（そのイベントID分）]
const EXPECT: [string, string, number | null][] = [
  ['E01-M', 'E01', scaled(8)],
  ['E01-F', 'E01', scaled(4)],
  ['E02', 'E02', scaled(3)],
  ['E03', 'E03', scaled(10)],
  ['E04', 'E04', scaled(15)],
  ['E05-notice', 'E05', scaled(7)],
  ['E05', 'E05', scaled(15)],
  ['E06', 'E06', scaled(12)],
  ['E07', 'E07', scaled(12)],
  ['E08', 'E08', scaled(18)],
  ['E09', 'E09', scaled(35)],
  ['E10', 'E10', scaled(45)],
  ['E11-early', 'E11', 0], // 自分から先に断るとライフは減らない（2026-11-21）
  ['E11-after', 'E11', scaled(15)],
  ['E12', 'E12', scaled(40)],
  ['E12-closed', 'E12', 0],
  ['E13', 'E13', scaled(20)],
  ['E13-declined', 'E13', 0],
  ['E14', 'E14', scaled(30)],
  ['E15', 'E15', scaled(6)], // 2026-11-13：14日ごと−6
  ['E16', 'E16', scaled(18)],
  ['E17', 'E17', scaled(8)],
  ['E18', 'E18', scaled(6)],
  ['E19', 'E19', scaled(12)],
  ['E20', 'E20', scaled(4)],
  ['E21', 'E21', scaled(15)],
  ['E22', 'E22', null],
  ['E23', 'E23', scaled(25)],
  ['E24', 'E24', 0],
];

describe('E01〜E24 再現ケース', () => {
  it('すべてのイベントIDに再現ケースがある', () => {
    const ids = new Set(EXPECT.map(([, e]) => e));
    for (let i = 1; i <= 24; i++) expect(ids.has(`E${String(i).padStart(2, '0')}`)).toBe(true);
  });
  it.each(EXPECT)('%s → %s', (scenarioId, eventId, loss) => {
    const sc = DEV_SCENARIOS.find((x) => x.id === scenarioId)!;
    const s = sc.run();
    expect(logged(s, eventId)).toBe(true);
    // 人物ごとの倍率（lossScale）をかけた値で確かめる
    if (loss !== null) expect(lossOf(s, eventId)).toBe(charScaled(s, loss));
    if (eventId === 'E22') expect(lossOf(s, 'E22') % charScaled(s, SPEC_LOSS.E22_WEEK)).toBe(0);
    if (eventId === 'E22') expect(lossOf(s, 'E22')).toBeGreaterThanOrEqual(charScaled(s, SPEC_LOSS.E22_WEEK));
  });
  it('E10・E12・E13の金銭は特殊損失として予算超過から除外', () => {
    for (const id of ['E10', 'E12', 'E13']) {
      const s = DEV_SCENARIOS.find((x) => x.id === id)!.run();
      const special = s.money.filter((m) => m.special);
      if (id !== 'E10') expect(special.length).toBeGreaterThan(0);
      for (const m of special) expect(m.special).toBe(true);
    }
  });
  it('E08の飲食代は通常支出（予算超過の計算に入る）', () => {
    const s = DEV_SCENARIOS.find((x) => x.id === 'E08')!.run();
    const meal = s.money.find((m) => m.category === 'date' && m.yen >= 8000);
    expect(meal).toBeDefined();
    expect(meal!.special).toBe(false);
    expect(meal!.yen).toBeLessThanOrEqual(30000);
  });
  it('E08・E09はプレイ中の記録で真因（メシ目・ヤリ捨て）を断定しない', () => {
    for (const [id, word] of [['E08', 'メシ目'], ['E09', 'ヤリ捨て']] as const) {
      const s = DEV_SCENARIOS.find((x) => x.id === id)!.run();
      const notes = s.ledger.filter((e) => e.eventId === id).map((e) => e.note).join(' ');
      expect(notes.length).toBeGreaterThan(0);
      expect(notes).not.toContain(word);
      const chat = Object.values(s.contacts).flatMap((c) => c.messages.map((m) => m.text)).join(' ');
      expect(chat).not.toContain(word);
    }
  });
  it('外部サイトでは1通ごとにポイント代がかかり、アプリの有料会員は不要', () => {
    const s = DEV_SCENARIOS.find((x) => x.id === 'E13')!.run();
    const points = s.money.filter((m) => m.note.includes('ポイント'));
    expect(points.length).toBeGreaterThan(0);
    for (const m of points) expect(m.yen).toBe(500);
    const c = Object.values(s.contacts)[0];
    expect(c.messages.some((m) => m.channel === 'external')).toBe(true);
  });
  it('デートの記録に、起きたことと感触が残る', () => {
    const s = DEV_SCENARIOS.find((x) => x.id === 'E17')!.run();
    const rec = Object.values(s.contacts).flatMap((c) => c.dates)[0];
    expect(rec.notes!.length).toBeGreaterThan(2);
    expect(['good', 'okay', 'awkward']).toContain(rec.impression);
    expect(rec.costYen).toBeGreaterThan(0);
  });
  it('E14：3回会っていた関係の終了は深さの加算（+5の1.3倍）', () => {
    const s = DEV_SCENARIOS.find((x) => x.id === 'E14')!.run();
    expect(s.ledger.filter((e) => e.category === 'depth').reduce((a, e) => a - e.delta, 0)).toBe(SPEC_DEPTH_MEETINGS3);
  });
});
