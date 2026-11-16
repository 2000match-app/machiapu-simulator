// 顔出しの場面（2026-11-10 顔かくしの素材）
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { canPublishPhoto, maybeSuggestFacePhoto } from './chat';
import { CHARACTERS } from './data/characters';
import { FACE_PHOTOS, NPC_FACE_POOL, PLAYER_FACE } from './data/faceReveal';
import { DEV_SCENARIOS, advanceDays, devNewGame } from './devScenarios';
import { revealFacePhoto } from './photos';

const run = (id: string) => DEV_SCENARIOS.find((s) => s.id === id)!.run();

describe('顔かくしの素材', () => {
  it('33枚すべての画像が public/npc にある', () => {
    expect(FACE_PHOTOS).toHaveLength(33);
    for (const p of FACE_PHOTOS) expect(fs.existsSync(path.join(__dirname, '../../public/npc', p.file)), p.file).toBe(true);
  });

  it('顔写真なしで始める人物には全員、本当の顔がある。NPCには使わない', () => {
    for (const ch of CHARACTERS.filter((c) => !c.photoInitiallyVisible)) {
      const face = PLAYER_FACE[ch.id];
      expect(face, ch.id).toBeDefined();
      expect(FACE_PHOTOS.find((p) => p.file === face)?.gender, ch.id).toBe(ch.gender);
      expect(NPC_FACE_POOL.some((p) => p.file === face)).toBe(false);
    }
  });

  it('NPCの本当の顔は、同じプレイで同じ顔を2回使わない', () => {
    const s = devNewGame('M07', 'face-pool');
    const npc = { ...Object.values(s.npcs)[0] ?? { id: 'x', gender: 'F', age: 28 } } as Parameters<typeof revealFacePhoto>[1];
    npc.gender = 'F';
    const got = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const f = revealFacePhoto(s, { ...npc, id: `n${i}` });
      if (!f) break;
      expect(got.has(f)).toBe(false);
      got.add(f);
    }
    expect(got.size).toBe(NPC_FACE_POOL.filter((p) => p.gender === 'F').length);
  });
});

describe('顔出しの場面', () => {
  it('顔写真なしの相手と初めて会うと、本当の顔が出る', () => {
    const s = run('FACE-hidden');
    const ev = s.pending.find((p) => p.kind === 'date_talk');
    expect(ev?.image?.file).toMatch(/^h\d\d\.jpg$/);
    expect(ev?.lines.some((l) => l.text.includes('顔の写った写真がなかった'))).toBe(true);
  });

  it('加工の強い写真の相手と初めて会うと、本当の顔が出る', () => {
    const s = run('FACE-filtered');
    const ev = s.pending.find((p) => p.kind === 'date_talk' || p.kind === 'date_e06');
    expect(ev?.image?.file).toMatch(/^h\d\d\.jpg$/);
  });

  it('マッチしないとき、顔写真を載せるか提案される。載せると公開される', () => {
    const s = run('FACE-suggest');
    const ev = s.pending.find((p) => p.kind === 'photo_suggest');
    expect(ev?.image?.file).toBe(PLAYER_FACE.M05);
    applyAction(s, { type: 'resolve', uid: ev!.uid, choiceId: 'publish' });
    expect(s.player.photoVisible).toBe(true);
  });

  it('提案は、マッチが多いときや写真を載せられない日には出ない。最大2回', () => {
    const early = devNewGame('M05', 'face-early');
    early.flags.noPrivateEvents = false;
    maybeSuggestFacePhoto(early);
    expect(early.pending.some((p) => p.kind === 'photo_suggest')).toBe(false); // まだ14日たっていない

    const s = devNewGame('M05', 'face-times');
    advanceDays(s, 14);
    s.flags.noPrivateEvents = false;
    expect(canPublishPhoto(s)).toBe(true);
    for (let i = 0; i < 4; i++) {
      s.flags.photoSuggestDay = -999;
      maybeSuggestFacePhoto(s);
      s.pending = s.pending.filter((p) => p.kind !== 'photo_suggest');
    }
    expect(s.flags.photoSuggestTimes).toBe(2);

    const busy = devNewGame('F01', 'face-visible');
    busy.flags.noPrivateEvents = false;
    maybeSuggestFacePhoto(busy, true);
    expect(busy.pending.some((p) => p.kind === 'photo_suggest')).toBe(false); // 顔写真ありの人物には出ない
  });

  it('トークで顔写真を頼まれて載せると、載せた顔がトークに出る', () => {
    const s = run('FACE-ask');
    const c = Object.values(s.contacts).find((x) => x.topic === 'photo_ask')!;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'publish' });
    const mine = c.messages.filter((m) => m.from === 'me');
    expect(mine.some((m) => m.image === PLAYER_FACE.M05)).toBe(true); // 1通1文に分けたので、顔は最初の1通に付く
  });
});

describe('対象外の顔（2026-11-16）', () => {
  it('指定した7枚はNPCの本当の顔に使わない', async () => {
    const { FACE_EXCLUDED } = await import('./data/faceReveal');
    expect(FACE_EXCLUDED).toHaveLength(7);
    for (const id of FACE_EXCLUDED) expect(NPC_FACE_POOL.some((p) => p.id === id)).toBe(false);
  });
});
