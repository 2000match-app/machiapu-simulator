// ウケ狙いの痛い人（2026-11-27 指示）
import { describe, expect, it } from 'vitest';
import { cringeBio, rollCringe } from './cringe';
import { devNewGame } from './devScenarios';
import { npcSay } from './messaging';
import { createNpc, ensureContact, storeNpc } from './state';
import type { GameState } from './types';
import { pushMsg } from './contact';
import type { Npc } from './types';

const someNpc = (s: GameState): Npc => storeNpc(s, createNpc(s, 'search'), false)!;
const fake = (i: number, looks: number, purpose: Npc['purpose'] = 'sincere'): Npc => ({ id: `n${i}`, looks, purpose } as Npc);

describe('ウケ狙いの痛い人', () => {
  it('容姿2〜4の相手の約2%（対象の中で2.5%）。容姿1・5と、サクラ・業者などの作られた人物はならない', () => {
    const N = 20000;
    const rate = (looks: number, purpose: Npc['purpose'] = 'sincere') => {
      let k = 0;
      for (let i = 0; i < N; i++) if (rollCringe('seed', fake(i, looks, purpose))) k++;
      return k / N;
    };
    for (const l of [2, 3, 4]) expect(rate(l)).toBeGreaterThan(0.02), expect(rate(l)).toBeLessThan(0.03);
    expect(rate(1)).toBe(0);
    expect(rate(5)).toBe(0);
    expect(rate(3, 'sakura')).toBe(0);
    expect(rate(3, 'business')).toBe(0);
  });

  it('プロフィールは「‼️」だらけで、タバコ・お酒の設定に合わせた行が入る', () => {
    const s = devNewGame('M07', 'cringe-bio');
    const npc = { ...someNpc(s), smoking: 'yes', drinking: 'yes', marital: 'divorced' } as Npc;
    const bio = cringeBio(s.seed, npc);
    expect((bio.match(/‼️/g) ?? []).length).toBeGreaterThan(5);
    expect(bio).toMatch(/喫煙者|タバコ/);
    expect(bio).toMatch(/酒/);
    expect(bio.split('\n').length).toBeGreaterThanOrEqual(4);
  });

  it('トークは最初にダジャレの挨拶。「！」は「‼️」になり、「好き」と言うとボケてくる', () => {
    const s = devNewGame('M07', 'cringe-talk');
    const npc = someNpc(s);
    npc.cringe = true;
    s.clock = 21 * 60;
    const c = ensureContact(s, npc.id, false);
    npcSay(s, c, 'greet', { text: 'はじめまして！よろしくお願いします！' });
    const them = c.messages.filter((m) => m.from === 'them').map((m) => m.text);
    expect(them[0]).toMatch(/こんばん|ばんわ/);
    expect(them.some((t) => t.includes('‼️'))).toBe(true);
    expect(them.some((t) => t.includes('！'))).toBe(false);
    pushMsg(c, s.day, 'me', 'お酒好きです！');
    npcSay(s, c, 'chat_normal', { text: '俺も好きです🍺' });
    const last = c.messages.slice(-2).map((m) => m.text);
    expect(last[0]).toMatch(/のことが…？/);
    expect(last[1]).toBe('ごめんスベった');
  });

  it('ふつうの相手のメッセージは変わらない', () => {
    const s = devNewGame('M07', 'cringe-normal');
    const npc = someNpc(s);
    npc.cringe = false;
    const c = ensureContact(s, npc.id, false);
    npcSay(s, c, 'greet', { text: 'はじめまして！よろしくお願いします。' });
    expect(c.messages.filter((m) => m.from === 'them').map((m) => m.text).join('')).not.toMatch(/‼️|ワニ/);
  });
});
