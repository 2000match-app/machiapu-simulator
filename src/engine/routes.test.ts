// 全20人に到達可能なクリア経路があり、通常ルールで失敗も起こり得ることの確認。
// ・再現ケース：誠実で相性の良い相手との交際を用意し、90日を通常の選択で過ごす（到達確認）
// ・通常プレイ：自動プレイの複数シードで、クリアと失敗の両方が実際に起きる（難易度評価とは別）
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import { closeDay, openDay } from './advance';
import { playBot } from './bot';
import { CHARACTERS, SELECTABLE_IDS } from './data/characters';
import { devAddContact } from './devScenarios';

const GOOD: Record<string, string> = {
  rel_phase: 'agree', rel_week: 'meet', e18: 'talk', e19: 'discuss', e21: 'reconfirm', e22: 'adjust', rel_others: 'close', rel_app: 'apologize', value_review: '6', f03_wedding: 'pace',
};

describe('全20人のクリア経路（再現ケース）', () => {
  it.each(CHARACTERS.map((c) => c.id))('%s：誠実で相性の良い相手と90日続けばクリア', (id) => {
    const s = newGame(id, `route-${id}`);
    const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3, traits: { passive: false, acceptsConstraints: true, moneySense: 'normal' } });
    c.relationship!.compat = 1;
    for (let i = 0; i < 100 && s.status === 'playing'; i++) {
      openDay(s);
      while (s.pending.length > 0) {
        const ev = s.pending[0];
        const pick = ev.choices.some((x) => x.id === GOOD[ev.kind]) ? GOOD[ev.kind] : ev.choices[0].id;
        applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: pick });
      }
      closeDay(s);
    }
    expect(s.status).toBe('cleared');
    expect(s.life).toBeGreaterThanOrEqual(1);
  });
});

describe('通常プレイでクリアも失敗も起こり得る（選べる10人）', () => {
  it.each(SELECTABLE_IDS)('%s', (id) => {
    let cleared = false;
    let failed = false;
    // 太郎・奈緒など難しい人物はクリア率が数%なので、見つかるまで最大200回（見つかればすぐ止まる。2026-11-13）
    for (let i = 0; i < 200 && !(cleared && failed); i++) {
      const strategy = i % 2 === 0 ? 'focus' : 'wide';
      const s = playBot(id, `both-${id}-${i}`, { strategy });
      if (s.status === 'cleared') cleared = true;
      if (s.status === 'gameover') failed = true;
    }
    expect(cleared).toBe(true);
    expect(failed).toBe(true);
  }, 600_000); // 写真のない相手を出さなくなり（2026-11-09）1回のプレイが少し重い
});
