// 仕様v0.3 §4〜§6 の人物データ・表の値が設定データと一致するか
import { describe, expect, it } from 'vitest';
import { SELECTABLE_IDS, CHARACTERS, NO_PHOTO_IDS, educationLabel, getCharacter } from './data/characters';
import { EVENTS } from './data/events';
import { SPEC_PURPOSE_MIX } from './data/rules';
import { newGame } from './actions';
import { AREAS, getArea } from './data/areas';
import { createNpc } from './state';

const man = 10_000;

// [ID, 名前, 年齢, 職業, 学歴表示, 年収(万), 身長, 容姿, 写真公開, 月予算(万)]
const SPEC_TABLE: [string, string, number, string, string, number, number, number, boolean, number][] = [
  ['M01', '健人', 30, '総合商社', '早稲田大学卒', 1500, 183, 4, true, 8],
  ['M02', '圭', 34, '弁護士', '慶應義塾大学卒・同大学法科大学院修了', 1200, 178, 4, true, 12],
  ['M03', '亮', 36, 'フリーター', '高卒', 240, 176, 2, true, 1],
  ['M04', '蓮', 22, '美容師', '専門卒', 400, 181, 5, true, 1.5],
  ['M05', '悠斗', 33, '弁護士', '京都大学卒', 1300, 170, 2, false, 3],
  ['M06', '和也', 38, '事務職', '帝京大学卒', 400, 165, 2, false, 2],
  ['M07', '大輔', 27, 'コンサルタント', '東京大学卒', 800, 171, 3, true, 3],
  ['M08', '直人', 30, '派遣ITサポート', '日本大学卒', 320, 172, 1, false, 1.5],
  ['M09', '太郎', 35, '中小企業会社員', '龍谷大学卒', 500, 167, 1, true, 1],
  ['M11', '和樹', 33, 'メーカー勤務', '横浜国立大学卒', 750, 170, 3.5, true, 2.5],
  ['M10', '誠', 44, '非正規の清掃職', '高卒', 260, 171, 2, true, 1],
  ['F01', '麻衣', 27, '大手企業勤務', '慶應義塾大学卒', 700, 164, 5, true, 3],
  ['F02', '莉奈', 23, '販売職', '専門卒', 300, 160, 5, true, 2],
  ['F03', '美咲', 33, '公務員', '中央大学卒', 600, 158, 3, true, 1.5],
  ['F04', '沙織', 34, 'パート事務', '専門卒', 180, 160, 3, false, 0.8],
  ['F05', '真由', 36, '大手企業管理職', '早稲田大学卒', 900, 162, 3, true, 8], // 2026-11-13 36歳・容姿3
  ['F06', '葵', 24, '看護師', '専門卒', 500, 155, 2, false, 0.8],
  ['F07', '千尋', 29, '派遣事務', '亜細亜大学卒', 280, 162, 2, false, 1.5],
  ['F08', '結衣', 28, '事務職', '跡見学園女子大学卒', 260, 161, 3.5, true, 1],
  ['F09', '遥', 32, '医療事務', '専門卒', 260, 163, 2, true, 1.5],
  ['F10', '奈緒', 42, 'パート勤務', '高卒', 180, 159, 1, true, 0.8],
];

// [ID, 受信下限, 受信上限, 送信成立率, 対面後お断り率]
const RATES: [string, number, number, number, number][] = [
  ['M01', 200, 600, 0.40, 0.20], ['M02', 100, 300, 0.30, 0.25], ['M03', 0, 4, 0.015, 0.45], ['M04', 80, 250, 0.28, 0.30],
  ['M05', 8, 30, 0.06, 0.60], ['M06', 0, 4, 0.015, 0.65], ['M07', 40, 150, 0.20, 0.30], ['M08', 0, 3, 0.01, 0.80],
  ['M09', 0, 3, 0.01, 0.60], ['M10', 0, 4, 0.01, 0.50],
  ['F01', 400, 1000, 0.60, 0.20], ['F02', 600, 1500, 0.65, 0.25], ['F03', 80, 250, 0.35, 0.35], ['F04', 10, 40, 0.12, 0.50],
  ['F05', 15, 45, 0.12, 0.40], ['F06', 60, 200, 0.25, 0.60], ['F07', 10, 40, 0.14, 0.65], ['F08', 120, 350, 0.40, 0.30],
  ['F09', 20, 70, 0.18, 0.40], ['F10', 3, 12, 0.04, 0.60],
];

const PHOTO_PUBLIC: [string, number, number, number, number][] = [
  ['M05', 0.10, 0.45, 20, 70], ['M06', 0.01, 0.40, 0, 4], ['M08', 0.005, 0.50, 0, 2], ['F06', 0.15, 0.45, 20, 70],
  ['F04', 0.18, 0.35, 20, 70], ['F07', 0.10, 0.40, 10, 35],
];

describe('プレイ可能キャラクター20人', () => {
  it('男性11人（2026-11-13 和樹を追加）・女性10人。選べるのは男女6人ずつの12人（蓮・和樹・真由を含む）', () => {
    expect(CHARACTERS.filter((c) => c.gender === 'M')).toHaveLength(11);
    expect(CHARACTERS.filter((c) => c.gender === 'F')).toHaveLength(10);
    expect(SELECTABLE_IDS).toHaveLength(12);
    expect(SELECTABLE_IDS).toEqual(expect.arrayContaining(['M04', 'M11', 'F05']));
    for (const id of SELECTABLE_IDS) expect(getCharacter(id).prologue?.length, id).toBeGreaterThan(0);
  });
  it.each(SPEC_TABLE)('%s %s の設定が仕様表と一致', (id, name, age, job, edu, income, height, looks, photo, budget) => {
    const c = getCharacter(id);
    expect(c.name).toBe(name);
    expect(c.age).toBe(age);
    expect(c.job).toBe(job);
    expect(educationLabel(c.education)).toBe(edu);
    expect(c.incomeYen).toBe(income * man);
    expect(c.heightCm).toBe(height);
    expect(c.looks).toBe(looks);
    expect(c.photoInitiallyVisible).toBe(photo);
    expect(c.monthlyBudgetYen).toBe(budget * man);
  });
  it.each(RATES)('%s のマッチ率表', (id, lo, hi, send, rej) => {
    const c = getCharacter(id);
    expect(c.rates.receivedPer30).toEqual([lo, hi]);
    expect(c.rates.sendSuccess).toBeCloseTo(send, 6);
    expect(c.rates.postDateRejection).toBeCloseTo(rej, 6);
  });
  it('顔写真なしで始まるのは6人（2026-11-03：健・結衣は公開、悠斗は猫・葵は後頭部の写真）', () => {
    const ids = CHARACTERS.filter((c) => !c.photoInitiallyVisible).map((c) => c.id).sort();
    expect(ids).toEqual([...NO_PHOTO_IDS].sort());
    expect(ids).toEqual(['F04', 'F06', 'F07', 'M05', 'M06', 'M08']);
    // 容姿4・5の人物は全員公開済み
    for (const c of CHARACTERS) if (c.looks >= 4) expect(c.photoInitiallyVisible).toBe(true);
  });
  it.each(PHOTO_PUBLIC)('%s の写真公開後の値', (id, send, rej, lo, hi) => {
    const c = getCharacter(id);
    expect(c.ratesPhotoPublic?.sendSuccess).toBeCloseTo(send, 6);
    expect(c.ratesPhotoPublic?.postDateRejection).toBeCloseTo(rej, 6);
    expect(c.ratesPhotoPublic?.receivedPer30).toEqual([lo, hi]);
  });
  it('写真なし開始でない人物は公開後の表を持たない', () => {
    for (const c of CHARACTERS) if (c.photoInitiallyVisible) expect(c.ratesPhotoPublic).toBeUndefined();
  });
  it('女性のアプリ歴・希望期限、男性の期限12か月', () => {
    const f: Record<string, [number, number]> = {
      F01: [12, 18], F02: [6, 24], F03: [24, 12], F04: [36, 12], F05: [84, 6], F06: [24, 24], F07: [36, 18], F08: [12, 18], F09: [48, 12], F10: [96, 6],
    };
    for (const [id, [hist, dl]] of Object.entries(f)) {
      expect(getCharacter(id).appHistoryMonths).toBe(hist);
      expect(getCharacter(id).relationshipDeadlineMonths).toBe(dl);
    }
    for (const c of CHARACTERS.filter((x) => x.gender === 'M')) expect(c.relationshipDeadlineMonths).toBe(12);
  });
  it('初期希望：M10・F01・F05・F10（容姿4以上は検索条件ではなく見た目の好みとして持つ）', () => {
    expect(getCharacter('M10').initialPreference).toMatchObject({ ageMin: 25, ageMax: 32 });
    expect(getCharacter('F01').initialPreference).toMatchObject({ minIncomeYen: 800 * man }); // 2026-11-18 指示で1,000万→800万
    expect(getCharacter('F05').initialPreference).toMatchObject({ minIncomeYen: 1200 * man });
    expect(getCharacter('F10').initialPreference).toMatchObject({ ageMin: 30, ageMax: 39 });
    for (const id of ['M10', 'F01', 'F05', 'F10']) expect(getCharacter(id).lookPreference).toBe(4);
  });
  it('舞台は首都圏（東京都・埼玉県・千葉県）。全員の居住地がその中にある', () => {
    for (const c of CHARACTERS) {
      expect(['東京都', '埼玉県', '千葉県']).toContain(getArea(c.areaId).pref);
      for (const p of c.initialPreference.prefectures) expect(['東京都', '埼玉県', '千葉県']).toContain(p);
    }
    for (const a of AREAS) expect(['東京都', '埼玉県', '千葉県']).toContain(a.pref);
  });
  it('結婚歴・子ども：M10・F04は離婚歴あり、F04は子どもあり（健は2026-11-03に未婚・交際経験なしへ変更）', () => {
    expect(getCharacter('M10').marital).toBe('divorced');
    expect(getCharacter('M09').marital).toBe('never');
    expect(getCharacter('M09').datingExperience).toBe('なし');
    expect(getCharacter('F04').marital).toBe('divorced');
    expect(getCharacter('M09').children).toBe(0);
    expect(getCharacter('F04').children).toBe(1);
    expect(getCharacter('F10').marital).toBe('never');
  });
});

describe('イベントと配合', () => {
  it('E01〜E24がすべて定義されている', () => {
    const ids = EVENTS.map((e) => e.id);
    for (let i = 1; i <= 24; i++) expect(ids).toContain(`E${String(i).padStart(2, '0')}`);
    for (const e of EVENTS) {
      expect(e.trigger.length).toBeGreaterThan(0);
      expect(e.omen.length).toBeGreaterThan(0);
      expect(e.choices.length).toBeGreaterThan(0);
      expect(e.loss.length).toBeGreaterThan(0);
    }
  });
  it('相手の主目的の配合は合計100%', () => {
    for (const mix of Object.values(SPEC_PURPOSE_MIX)) {
      expect(mix.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(100, 6);
    }
  });
});

describe('NPCの画像状態とプロフィール写真は別', () => {
  it('画像未制作（not_created）でも、プロフィール写真の公開状態は独立している', () => {
    const s = newGame('M05', 'npc-photo');
    let visible = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const npc = createNpc(s, 'search');
      expect(npc.portraitAssetStatus).toBe('not_created');
      expect(npc.futureImageRef).toMatch(/^npc\/M05\/N\d{5}\.png$/);
      if (npc.profilePhotoVisible) visible++;
    }
    // 顔写真を出す割合は写真素材の顔ありの割合（2026-11-12：女性は約66%）。画像ファイルがないことを理由に写真なし扱いにしない
    expect(visible / N).toBeGreaterThan(0.55);
    expect(visible / N).toBeLessThan(0.8);
  });
});

describe('デート中の具体的なセリフ（2026-11-19。Gemini で生成した data/dateLines.ts）', () => {
  it('写真の相手の趣味の9割以上にセリフがあり、文面に「」や改行がない', async () => {
    const { DATE_LINES } = await import('./data/dateLines');
    const { FEMALE_PHOTOS, MALE_PHOTOS } = await import('./data/npcPhotos');
    for (const [g, pool] of [['F', FEMALE_PHOTOS], ['M', MALE_PHOTOS]] as const) {
      let all = 0;
      let hit = 0;
      for (const p of pool) for (const h of (p as { hobbies?: string[] }).hobbies ?? []) {
        all++;
        if (DATE_LINES.hobby[h]?.[g]?.chat.length) hit++;
      }
      expect(hit / all).toBeGreaterThan(0.9);
    }
    const texts: string[] = [];
    const walk = (v: unknown) => { if (typeof v === 'string') texts.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(DATE_LINES);
    expect(texts.length).toBeGreaterThan(1000);
    expect(texts.filter((t) => /[「」\n]/.test(t))).toEqual([]);
  });
});
