// マッチ率の較正：基準候補群で平均した送信成立確率が表の値になる（容姿・写真の効果を二重に掛けない）
import { describe, expect, it } from 'vitest';
import { newGame } from './actions';
import { CHARACTERS, getCharacter } from './data/characters';
import { sendProbability } from './matching';
import { inBasePool } from './npc';
import { createNpc } from './state';

describe('送信成立率の較正', () => {
  it.each(CHARACTERS.map((c) => [c.id, c.rates.sendSuccess] as const))('%s：基準候補群の平均が設定値（%s）', (id, p0) => {
    const s = newGame(id, `calib-test-${id}`);
    const base = getCharacter(id).baseDistanceMin;
    let sum = 0;
    let n = 0;
    while (n < 3000) {
      const npc = createNpc(s, 'search');
      if (!inBasePool(npc, s.player.age, base)) continue;
      sum += sendProbability(s, npc);
      n++;
    }
    const mean = sum / n;
    expect(Math.abs(mean - p0)).toBeLessThan(Math.max(0.0015, p0 * 0.08));
  });
  it('写真公開後は公開後の表の値に較正される', () => {
    for (const c of CHARACTERS.filter((x) => x.ratesPhotoPublic)) {
      const s = newGame(c.id, `calib-pub-${c.id}`);
      s.player.photoVisible = true;
      let sum = 0;
      let n = 0;
      while (n < 3000) {
        const npc = createNpc(s, 'search');
        if (!inBasePool(npc, s.player.age, c.baseDistanceMin)) continue;
        sum += sendProbability(s, npc);
        n++;
      }
      const p0 = c.ratesPhotoPublic!.sendSuccess;
      expect(Math.abs(sum / n - p0)).toBeLessThan(Math.max(0.0015, p0 * 0.08));
    }
  });
  it('NPCの画像が未制作でも成立率は変わらない（写真なしの補正を掛けない）', () => {
    const s = newGame('M01', 'calib-asset');
    const npc = createNpc(s, 'search');
    const p1 = sendProbability(s, npc);
    npc.portraitAssetStatus = 'generated';
    expect(sendProbability(s, npc)).toBe(p1);
  });
});
