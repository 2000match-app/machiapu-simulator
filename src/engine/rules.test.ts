import { talkChoice, talkMenu } from './conversation';
// 仕様v0.3の勝敗・消耗・写真公開・二重計上の禁止などのルール検証
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import { canPublishPhoto, publishPhoto, replyOptions } from './chat';
import { closeDay, openDay } from './advance';
import { actualFacePhoto, decidePostFirstDate, playerFree, privateEventOn } from './dates';
import { devAddContact, advanceDays, resolveAll } from './devScenarios';
import { applyLoss, monthlySettlement, noteE02, seriesLoss, spend, subscribe, weeklySettlement, charScaled } from './life';
import { acceptReceived, loadReceived, sendLike } from './matching';
import { playBot } from './bot';
import { deserialize, serialize } from './save';
import { buildResult } from './feedback';
import { SPEC_DEPTH_RELATIONSHIP30, SPEC_LOSS, SPEC_MALE_MONTHLY_SEARCH_FATIGUE, SPEC_MALE_WEEKLY_NO_MATCH, SPEC_CLEAR_DAYS, SPEC_SHALLOW_WEEKLY_CAP, TUNE_STAGNATION, derivedPhotoLeaveRate, scaled } from './data/rules';
import { baseAppeal, curtChance, initialInterest } from './appeal';
import { replyChance } from './messaging';
import { FEMALE_PHOTOS, MALE_PHOTOS } from './data/npcPhotos';
import { activeStatuses, privateEventsDaily } from './privateEvents';
import { npcHensachi } from './npc';
import { memberFee, monthBudget } from './life';
import type { GameState } from './types';

function replyOptionsFor(s: GameState, npcId: string): string[] {
  return replyOptions(s, s.contacts[npcId]).map((o) => o.id);
}

/** 1日を進める（場面があれば先頭の選択で解決） */
function stepDay(s: GameState): void {
  openDay(s);
  while (s.pending.length > 0) applyAction(s, { type: 'resolve', uid: s.pending[0].uid, choiceId: s.pending[0].choices[0].id });
  closeDay(s);
}

describe('顔写真の公開（14日経過後・一方向）', () => {
  it('13日経過時は公開できず、14日経過時は公開できる', () => {
    const s = newGame('M08', 'photo-1');
    while (s.day < 13) stepDay(s);
    expect(s.day).toBe(13);
    expect(canPublishPhoto(s)).toBe(false);
    expect(publishPhoto(s)).toBe(false);
    stepDay(s);
    expect(s.day).toBe(14);
    expect(canPublishPhoto(s)).toBe(true);
    expect(publishPhoto(s)).toBe(true);
    expect(s.player.photoVisible).toBe(true);
    expect(canPublishPhoto(s)).toBe(false); // 戻す操作はない
  });
  it('写真公開済みの人物には公開操作がない', () => {
    const s = newGame('M01', 'photo-2');
    s.day = 30;
    expect(canPublishPhoto(s)).toBe(false);
  });
  it('公開後は公開後の表に切り替わり、既存の相手の外見判定は1回だけ', () => {
    const s = newGame('M08', 'photo-3');
    s.day = 14;
    const cs = Array.from({ length: 200 }, () => devAddContact(s, { purpose: 'sincere', stage: 'talking' }));
    publishPhoto(s);
    const left = cs.filter((c) => c.photoJudgement === 'left').length;
    const d = derivedPhotoLeaveRate(0.8, 0.5); // 0.6
    expect(d).toBeCloseTo(0.6, 6);
    expect(left / cs.length).toBeGreaterThan(0.48);
    expect(left / cs.length).toBeLessThan(0.72);
    // 残った相手は「写真で顔を知っている」→ 対面時は公開後のお断り率（50%）を使い、未確認補正を再適用しない
    const kept = cs.filter((c) => c.photoJudgement === 'pass');
    for (const c of kept) {
      expect(c.faceKnown).toBe(true);
      expect(c.faceKnownVia).toBe('photo');
    }
    let rejects = 0;
    for (const c of kept) {
      c.flags.faceWasKnownBeforeDate = true;
      c.flags.rejMult = 1;
      decidePostFirstDate(s, c, s.npcs[c.npcId]);
      expect(c.flags.rejP).toBeCloseTo(0.5, 3);
      if (c.postDateDecision === 'reject') rejects++;
    }
    expect(rejects / kept.length).toBeGreaterThan(0.3);
    expect(rejects / kept.length).toBeLessThan(0.7);
    // 公開写真を見て離れた相手は、対面後のお断りとして数えない
    expect(s.stats.firstDateRejections).toBe(0);
  });
  it('顔を知らないまま会った相手には写真なし時のお断り率を使う', () => {
    const s = newGame('F07', 'photo-4');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.flags.faceWasKnownBeforeDate = false;
    c.flags.rejMult = 1;
    decidePostFirstDate(s, c, s.npcs[c.npcId]);
    expect(c.flags.rejP).toBeCloseTo(0.65, 3);
  });
  it('写真公開済みの人物（容姿2・M03）は自分の表のお断り率', () => {
    const s = newGame('M03', 'photo-5');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.flags.faceWasKnownBeforeDate = true;
    c.flags.rejMult = 1;
    decidePostFirstDate(s, c, s.npcs[c.npcId]);
    expect(c.flags.rejP).toBeCloseTo(0.45, 3);
  });
});

describe('送信・受信・相互マッチの計上', () => {
  it('同じ相手へ二重に送れず、受信いいねと送信を二重計上しない', () => {
    const s = newGame('F01', 'count-1');
    applyAction(s, { type: 'search' });
    const id = s.search.results[0];
    expect(sendLike(s, id)).toBe(true);
    expect(sendLike(s, id)).toBe(false);
    expect(s.stats.likesSent).toBe(1);
    // 受信いいねを開いて、同じ相手を受け入れても新しい接触は作られない
    s.received.unseen = 5;
    loadReceived(s, 5, false);
    const rid = s.received.queue[0];
    acceptReceived(s, rid);
    const before = s.stats.matches;
    s.received.queue.push(rid);
    acceptReceived(s, rid);
    expect(s.stats.matches).toBe(before);
  });
  it('受信いいねを放置しても、それ自体ではライフは減らない（何もしない週の停滞だけ）', () => {
    const s = newGame('F02', 'count-2');
    s.flags.noPrivateEvents = true;
    for (let i = 0; i < 28; i++) stepDay(s);
    expect(s.received.unseen).toBeGreaterThan(100);
    // 無反応系の出来事（E01・E02）や比較疲れは起きない
    expect(s.ledger.filter((e) => e.eventId === 'E01' || e.eventId === 'E02' || e.category === 'fatigue')).toHaveLength(0);
    // 減ったのは月末の消耗と、何もしなかった週の停滞だけ
    expect(s.ledger.filter((e) => e.delta < 0 && e.category !== 'monthly' && !e.note.includes('停滞'))).toHaveLength(0);
  });
});

describe('系列の差分精算・週の上限・関係の深さ', () => {
  it('既読無視→ヤリ捨て→ブロックは最大損失35（差分精算）', () => {
    const s = newGame('F02', 'series-1');
    const c = devAddContact(s, { purpose: 'body', stage: 'dating', meetings: 1 });
    const life0 = s.life;
    expect(seriesLoss(s, c, 10, 'E03', '対面後の無視')).toBe(10);
    expect(seriesLoss(s, c, 35, 'E09', 'ヤリ捨て確定')).toBe(25);
    expect(seriesLoss(s, c, 15, 'E04', 'ブロック')).toBe(0);
    expect(life0 - s.life).toBe(35);
  });
  it('E02の個別損失は週の上限まで（−12の1.3倍）', () => {
    const s = newGame('M05', 'cap-1');
    for (let i = 0; i < 6; i++) noteE02(s, devAddContact(s, { purpose: 'sincere', stage: 'matched' }));
    const before = s.life;
    weeklySettlement(s);
    expect(before - s.life).toBe(charScaled(s, SPEC_SHALLOW_WEEKLY_CAP));
  });
  it('週次−8と個別の未返信は大きい方だけ', () => {
    const s = newGame('M05', 'cap-2');
    s.week.sendsConcluded = 25;
    s.week.matchesFromConcluded = 0;
    noteE02(s, devAddContact(s, { purpose: 'sincere', stage: 'matched' }));
    const before = s.life;
    weeklySettlement(s);
    expect(before - s.life).toBe(charScaled(s, SPEC_MALE_WEEKLY_NO_MATCH));
  });
  it('休息した週は成果不足の判定をしない', () => {
    const s = newGame('M05', 'cap-3');
    s.week.sendsConcluded = 25;
    s.week.wasResting = true;
    const before = s.life;
    weeklySettlement(s);
    expect(before - s.life).toBe(0);
  });
  it('関係の深さの加算は大きい方のみ（交際30日以上で+10）', () => {
    const s = newGame('F09', 'depth-1');
    const c = devAddContact(s, { purpose: 'married', stage: 'relationship', meetings: 5 });
    c.relationship!.startDay = s.day - 40;
    c.relationship!.fakeResolveDay = undefined;
    s.pending = []; // 交際スタートの場面を閉じた状態にする
    const before = s.life;
    applyAction(s, { type: 'endContact', npcId: c.npcId }); // 自分から別れる E23
    expect(before - s.life).toBe(SPEC_LOSS.E23 + SPEC_DEPTH_RELATIONSHIP30);
  });
});

describe('月末の精算', () => {
  it('予算を超えた時点でライフが減る（男性：1.5倍超までの合計は−12、月末には重ねない）', () => {
    const s = newGame('M03', 'budget-1'); // 予算1万円
    s.monthSpend = 0;
    const life0 = s.life;
    spend(s, 10_400, 'date', 'テスト'); // 1.04倍
    expect(life0 - s.life).toBe(scaled(6));
    spend(s, 6_000, 'date', 'テスト'); // 1.64倍
    expect(life0 - s.life).toBe(scaled(12));
    expect(s.ledger.filter((e) => e.category === 'budget')).toHaveLength(2);
    s.day = 30;
    const before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(SPEC_MALE_MONTHLY_SEARCH_FATIGUE);
  });
  it('犯罪被害の特殊損失は予算超過に再加算しない', () => {
    const s = newGame('M05', 'budget-2');
    s.monthSpend = 0;
    spend(s, 100_000, 'special', '恐喝', { special: true });
    s.day = 30;
    const before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(charScaled(s, SPEC_MALE_MONTHLY_SEARCH_FATIGUE));
    expect(s.money.filter((m) => m.special).reduce((a, m) => a + m.yen, 0)).toBe(100_000);
  });
  it('女性も予算を超えた時点で減る（2倍超までの合計は−10）', () => {
    const s = newGame('F03', 'budget-3'); // 予算2万
    s.monthSpend = 0;
    const life0 = s.life;
    spend(s, 45_000, 'date', 'テスト');
    expect(Math.abs(life0 - s.life - charScaled(s, scaled(10)))).toBeLessThanOrEqual(1); // 段階ごとに倍率をかけるので丸めで±1
    s.day = 30;
    const before = s.life;
    monthlySettlement(s);
    // アプリ歴2年1か月 → −3、期限まで残り11か月 → 0
    expect(before - s.life).toBe(charScaled(s, scaled(3)));
  });
  it('F05：探索中は月−9、期限超過後は月−12（各1.3倍）', () => {
    const s = newGame('F05', 'f05-1');
    s.monthSpend = 0;
    s.day = 30;
    let before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(scaled(7) + scaled(2)); // アプリ歴5年以上 −7、期限まで6か月以内 −2
    s.day = 210; // 期限6か月を超過
    s.monthSpend = 0;
    before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(scaled(7) + scaled(5)); // 期限超過 −5
  });
  it('F02：開始時点はアプリ歴6か月・期限24か月で月−1', () => {
    const s = newGame('F02', 'f02-1');
    s.day = 30;
    s.monthSpend = 0;
    const before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(1);
  });
  it('交際中は探索の消耗を止め、共通の−1に置き換える', () => {
    const s = newGame('F05', 'rel-1');
    devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    s.day = 30;
    s.monthSpend = 0;
    const before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(1);
  });
  it('偽交際でも画面上は交際中として探索の消耗が止まる', () => {
    const s = newGame('F05', 'rel-2');
    devAddContact(s, { purpose: 'body', stage: 'relationship', meetings: 1 });
    s.day = 30;
    s.monthSpend = 0;
    const before = s.life;
    monthlySettlement(s);
    expect(before - s.life).toBe(1);
  });
  it('価値観の見直しによる期限延長は1周1回・最大6か月', () => {
    const s = newGame('F05', 'ext-1');
    applyAction(s, { type: 'extendDeadline', months: 12 });
    expect(s.player.deadlineMonths).toBe(12);
    applyAction(s, { type: 'extendDeadline', months: 6 });
    expect(s.player.deadlineMonths).toBe(12);
  });
});

describe('交際後のデート3回でクリア（2026-11-18。以前は交際60日）', () => {
  function relState(seed: string, id = 'F03'): { s: GameState; id: string } {
    const s = newGame(id, seed);
    s.flags.noPrivateEvents = true;
    const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    c.relationship!.compat = 1;
    return { s, id: c.npcId };
  }
  /** 交際中のデートを1回する（翌日をデートの日にして1日進める。場面は「旅行は断る」「電話で過ごす」などで流す） */
  function relDate(s: GameState, id: string, fatal = false): void {
    const c = s.contacts[id];
    c.flags.relDateDay = s.day + 1;
    c.flags.relDateTier = 'cafe';
    openDay(s);
    if (fatal) applyLoss(s, 1000, 'event', 'テスト：致命的な損失');
    for (let g = 0; g < 20 && s.pending.length > 0 && s.status === 'playing'; g++) {
      const ev = s.pending[0];
      const pick = ev.kind === 'rel_trip' ? 'no' : ev.kind === 'rel_week' ? 'call' : ev.choices[0].id;
      applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: pick });
    }
    closeDay(s);
  }
  it('交際後の2回目のデートでは未クリア、3回目でクリア', () => {
    const { s, id } = relState('clear-1');
    relDate(s, id);
    relDate(s, id);
    expect(s.contacts[id].flags.relDates).toBe(2);
    expect(s.status).toBe('playing');
    relDate(s, id);
    expect(s.status).toBe('cleared');
  });
  it('1回目のデートの後に、一泊二日の旅行の誘いが必ず来る', () => {
    const { s, id } = relState('clear-trip');
    const c = s.contacts[id];
    c.flags.relDateDay = s.day + 1;
    openDay(s);
    expect(s.pending.some((p) => p.kind === 'rel_trip')).toBe(true);
  });
  /** 1回目のデートをして、旅行の誘いに answer で返事する。日にちの選択まで済ませる */
  function tripAnswer(s: GameState, id: string, answer: 'go' | 'day' | 'no'): void {
    const c = s.contacts[id];
    c.flags.relDateDay = s.day + 1;
    c.flags.relDateTier = 'cafe';
    openDay(s);
    const ev = s.pending.find((p) => p.kind === 'rel_trip')!;
    applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: answer });
    const pick = s.pending.find((p) => p.kind === 'rel_pick');
    if (pick) applyAction(s, { type: 'resolve', uid: pick.uid, choiceId: pick.choices[0].id });
  }
  it('旅行：本気の相手と泊まりならデート2回分になり、2回のデートでクリア（近道）', () => {
    const { s, id } = relState('trip-go');
    tripAnswer(s, id, 'go');
    const c = s.contacts[id];
    expect(c.flags.relDateTrip).toBe(true);
    const tripDay = Number(c.flags.relDateDay);
    for (let g = 0; g < 20 && s.day < tripDay && s.status === 'playing'; g++) {
      s.life = 100;
      for (const p of [...s.pending]) applyAction(s, { type: 'resolve', uid: p.uid, choiceId: p.kind === 'rel_week' ? 'call' : p.choices[0].id });
      closeDay(s);
      openDay(s);
    }
    expect(c.flags.relDates).toBe(3);
    closeDay(s);
    expect(s.status).toBe('cleared');
  });
  it('旅行：日帰りはデート1回分、断ると次の週の誘いが止まる', () => {
    const a = relState('trip-day');
    tripAnswer(a.s, a.id, 'day');
    expect(a.s.contacts[a.id].flags.relDateDayTrip).toBe(true);
    expect(a.s.contacts[a.id].flags.relDateTrip).toBe(false);
    const b = relState('trip-no');
    const h0 = b.s.contacts[b.id].relationship!.health;
    tripAnswer(b.s, b.id, 'no');
    const cb = b.s.contacts[b.id];
    expect(Number(cb.flags.relCoolUntil)).toBeGreaterThan(b.s.day);
    expect(cb.relationship!.health).toBeLessThan(h0 + 4); // デートの +3〜4 を、断った −6 が打ち消す
  });
  it('旅行：ヤリ目に振られたときの痛さは 泊まり ＞ 日帰り ＞ 断る', () => {
    const loss: Record<string, number> = {};
    for (const answer of ['go', 'day', 'no'] as const) {
      const s = newGame('F03', `trip-body-${answer}`);
      s.flags.noPrivateEvents = true;
      const c = devAddContact(s, { purpose: 'body', stage: 'relationship', meetings: 3 });
      c.relationship!.fakeResolveDay = 999;
      tripAnswer(s, c.npcId, answer);
      for (let g = 0; g < 30 && c.stage !== 'ended'; g++) {
        for (const p of [...s.pending]) applyAction(s, { type: 'resolve', uid: p.uid, choiceId: p.kind === 'rel_week' ? 'call' : p.choices[0].id });
        if ((c.stage as string) === 'ended') break;
        closeDay(s);
        s.life = 100;
        openDay(s);
      }
      expect(c.stage).toBe('ended');
      loss[answer] = s.ledger.filter((l) => l.eventId === 'E09').reduce((t, l) => t - l.delta, 0);
    }
    expect(loss.go).toBeGreaterThan(loss.day);
    expect(loss.day).toBeGreaterThan(loss.no);
  });
  it('3回目のデートの日の精算でライフ0なら失敗を優先', () => {
    const { s, id } = relState('clear-2');
    relDate(s, id);
    relDate(s, id);
    relDate(s, id, true);
    expect(s.status).toBe('gameover');
  });
  it('別れた相手とのデート回数を次の相手へ持ち越さない', () => {
    const { s, id } = relState('clear-3');
    relDate(s, id);
    relDate(s, id);
    applyAction(s, { type: 'endContact', npcId: id });
    expect(s.partnerId).toBeUndefined();
    s.life = 100;
    const b = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    b.relationship!.compat = 1;
    relDate(s, b.npcId);
    expect(s.status).toBe('playing'); // 合計で3回を超えてもクリアしない
  });
  it('偽交際はクリアできず、クリア日数より前に決着する', () => {
    for (const purpose of ['body', 'married', 'scam', 'profit'] as const) {
      const s = newGame('F02', `fake-${purpose}`);
      const c = devAddContact(s, { purpose, stage: 'relationship', meetings: 1 });
      const start = c.relationship!.startDay;
      expect(c.relationship!.genuine).toBe(false);
      expect(c.relationship!.fakeResolveDay! - start).toBeLessThan(SPEC_CLEAR_DAYS);
      for (let i = 0; i < SPEC_CLEAR_DAYS + 10 && s.status === 'playing'; i++) {
        s.life = 100;
        stepDay(s);
      }
      expect(s.status).not.toBe('cleared');
      expect(c.stage).toBe('ended');
    }
  });
});

describe('回復の上限と時間', () => {
  it('ライフは回復しない：休息はできず、交際の節目や初めての会話でも増えない（2026-11-03 指示）', () => {
    const s = newGame('F03', 'no-recover');
    applyAction(s, { type: 'rest' });
    expect(s.day).toBe(0);
    s.life = 60;
    const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    c.relationship!.compat = 1;
    for (let i = 0; i < 65; i++) stepDay(s);
    expect(s.ledger.filter((e) => e.delta > 0)).toHaveLength(0);
    expect(s.life).toBeLessThanOrEqual(60);
  });
  it('ライフは100を超えない', () => {
    const s = newGame('M01', 'cap-life');
    applyAction(s, { type: 'rest' });
    expect(s.life).toBeLessThanOrEqual(100);
  });
  it('360日ごとに加齢する（男女とも）', () => {
    for (const id of ['M05', 'F03']) {
      const s = newGame(id, `age-${id}`);
      const age0 = s.player.age;
      s.day = 359;
      s.life = 100;
      stepDay(s);
      expect(s.player.age).toBe(age0 + 1);
    }
  });
});

describe('再現性と保存', () => {
  it('同じシード・同じ操作列なら同じ結果', () => {
    const a = playBot('M05', 'repro-1', { strategy: 'wide' });
    const b = playBot('M05', 'repro-1', { strategy: 'wide' });
    expect(serialize(a)).toBe(serialize(b));
    const c = playBot('M05', 'repro-2', { strategy: 'wide' });
    expect(serialize(a)).not.toBe(serialize(c));
  }, 30_000); // 長いプレイを3回回すので、全体の実行中は時間がかかる
  it('20人すべてで再現できる', () => {
    for (const id of ['M01', 'M08', 'F02', 'F04']) {
      const a = playBot(id, `repro-all-${id}`, { strategy: 'focus' });
      const b = playBot(id, `repro-all-${id}`, { strategy: 'focus' });
      expect(serialize(a)).toBe(serialize(b));
    }
  }, 30_000);
  it('保存と再開を挟んでも乱数や関係が変わらない', async () => {
    const { botWeek } = await import('./bot');
    const run = (withSave: boolean) => {
      let s = newGame('F04', 'save-1');
      for (let w = 0; w < 40 && s.status === 'playing'; w++) {
        botWeek(s, { strategy: 'wide' });
        if (withSave && w % 3 === 0) s = deserialize(serialize(s));
      }
      return s;
    };
    // JSONを経由すると未定義のキーが落ちて並び順だけが変わるため、内容で比較する
    const withSave = JSON.parse(serialize(run(true)));
    const without = JSON.parse(serialize(run(false)));
    expect(withSave).toEqual(without);
    expect(withSave.day).toBeGreaterThan(30);
  });
});

describe('失敗時のフィードバック', () => {
  it('犯罪が主因なら先に示し、高望みは条件を満たさなければ出さない', () => {
    const s = newGame('M05', 'fb-1');
    const c = devAddContact(s, { purpose: 'bijin', stage: 'dating', meetings: 1 });
    seriesLoss(s, c, 45, 'E10', '美人局');
    s.eventLog.push({ day: s.day, eventId: 'E10', npcId: c.npcId, note: '美人局・恐喝の被害' });
    applyLoss(s, 100, 'monthly', 'テスト');
    s.status = 'gameover';
    const r = buildResult(s);
    expect(r.primary?.type).toBe('deception');
    expect(r.secondary.map((x) => x.type)).not.toContain('highAim');
  });
  it('高望み：50件以上・人気上位80%以上・成立3%未満のときだけ', () => {
    const s = newGame('M10', 'fb-2'); // 初期希望 25〜32歳・容姿4以上
    s.stats.likesSent = 60;
    s.stats.likesSentTopPopular = 55;
    s.stats.likesSentMatched = 0;
    applyLoss(s, 100, 'weekly', 'テスト');
    s.status = 'gameover';
    expect(buildResult(s).primary?.type === 'highAim' || buildResult(s).secondary.some((x) => x.type === 'highAim')).toBe(true);
    const t = newGame('M10', 'fb-3');
    t.stats.likesSent = 60;
    t.stats.likesSentTopPopular = 20; // 集中していない
    applyLoss(t, 100, 'weekly', 'テスト');
    t.status = 'gameover';
    const r2 = buildResult(t);
    expect([r2.primary?.type, ...r2.secondary.map((x) => x.type)]).not.toContain('highAim');
  });
  it('起きていない行動を批判しない（連投していなければ連投の指摘なし）', () => {
    const s = newGame('F06', 'fb-4');
    applyLoss(s, 100, 'monthly', 'テスト');
    s.status = 'gameover';
    const r = buildResult(s);
    expect([r.primary?.type, ...r.secondary.map((x) => x.type)]).not.toContain('spam');
    expect(r.suggestions.length).toBeLessThanOrEqual(3);
    // 写真公開済みの人物に「顔写真を載せる」提案をしない
    expect(r.suggestions.join('')).not.toContain('顔写真');
  });
});

describe('男性NPCの写真素材（2026-11-05 容姿レベル別）', () => {
  it('女性プレイヤーの相手に、設定どおりの写真を1回のプレイで1人1回だけ割り当てる', () => {
    const s = newGame('F03', 'photo-1');
    for (let i = 0; i < 12; i++) applyAction(s, { type: 'searchMore', count: 24 });
    const withFace = Object.values(s.npcs).filter((n) => MALE_PHOTOS.some((t) => t.faceVisible && t.file === n.photo));
    expect(withFace.length).toBeGreaterThan(3);
    // 同じ写真が2人に使われない
    expect(new Set(withFace.map((n) => n.photo)).size).toBe(withFace.length);
    expect(new Set(s.usedPhotos).size).toBe(s.usedPhotos?.length);
    for (const n of withFace) {
      const t = MALE_PHOTOS.find((x) => x.file === n.photo)!;
      expect(n.looks).toBe(t.looks);
      expect(Math.abs(n.age - t.age)).toBeLessThanOrEqual(3);
      if (t.job) expect(n.fakeTitle ?? n.job).toBe(t.job); // 医師・弁護士を偽る人は本当の職業が素材の設定
      expect(n.profilePhotoVisible).toBe(t.faceVisible);
      // 自分の絞り込み条件に合う相手だけ
      expect(n.age).toBeGreaterThanOrEqual(s.player.prefs.ageMin);
      expect(n.age).toBeLessThanOrEqual(s.player.prefs.ageMax);
    }
  }, 30_000); // 重いので、ほかのテストやビルドと重なると5秒を超えることがある
  it('相手の希望年齢の下限は18歳以上', () => {
    const s = newGame('F06', 'agefloor'); // 24歳の女性：相手の男性は14〜34歳の幅から作られる
    applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, ageMin: 18, ageMax: 60, minIncomeYen: 0, heightMin: 0, universityOnly: false, neverMarriedOnly: false } });
    for (let i = 0; i < 6; i++) applyAction(s, { type: 'searchMore', count: 24 });
    for (const n of Object.values(s.npcs)) expect(n.prefs.ageMin).toBeGreaterThanOrEqual(18);
  });
  it('顔写真を出していない相手は風景などの写真で、顔評価は基本3以下（提供素材の例外を除く）', () => {
    for (const id of ['F03', 'M05']) {
      const s = newGame(id, `photo-hidden-${id}`);
      applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, photoOnly: false } }); // 開始時は「写真ありだけ」なので外す
      for (let i = 0; i < 10; i++) applyAction(s, { type: 'searchMore', count: 24 });
      const hidden = Object.values(s.npcs).filter((n) => !n.profilePhotoVisible);
      expect(hidden.length).toBeGreaterThan(0);
      for (const n of hidden) {
        if (!n.nightWork) expect(n.looks).toBeLessThanOrEqual(3); // 夜職フォルダの素材は顔を隠していても容姿4
        if (n.gender === 'M') expect(n.photo).toBeTruthy();
      }
      // 男性プレイヤーの相手（女性）には顔写真の素材は使わない
      if (id === 'M05') expect(Object.values(s.npcs).some((n) => MALE_PHOTOS.some((t) => t.faceVisible && t.file === n.photo))).toBe(false);
    }
  });
});

describe('トークの選択肢と親密度（2026-11-03）', () => {
  it('ふつうの会話は 相槌・雑談・電話・会ってみたい の4つ。相槌・雑談・電話はライフが減らず、会いたいは伝えた時点では減らない', () => {
    const s = newGame('M05', 'talk4');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    // 2026-11-11：会う前は 相槌・プロフィールを見て質問する・電話してみたいと言う ＋会ってみたい
    expect(replyOptionsFor(s, c.npcId).slice(0, 4)).toEqual(['aizuchi', 'profile_q', 'callwish', 'meet_wish']);
    const life0 = s.life;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'aizuchi' });
    expect(s.life).toBe(life0);
    c.awaitingMe = true; c.topic = 'chat_normal';
    const i0 = c.interest;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'zatsudan' });
    expect(s.life).toBe(life0); // 2026-11-06 雑談・電話のライフ消費は廃止
    expect(c.interest).toBeGreaterThan(i0);
    c.awaitingMe = true; c.topic = 'chat_normal';
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'zatsudan' }); // 雑談2回で誘える
    c.awaitingMe = true; c.topic = 'chat_normal';
    c.exchanges = 10; // 会う前の誘いは3〜6往復以降（2026-11-14。以前は5〜10）
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
    expect(s.life).toBe(life0);
    expect(c.flags.meetWishPending).toBe(true);
  });
  it('相槌ばかりの相手に誘うと話をそらされる（ライフは減らず、7日間は誘い直せない）', () => {
    const s = newGame('M05', 'aizuchi-invite');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    for (let i = 0; i < 2; i++) { applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'aizuchi' }); c.awaitingMe = true; c.topic = 'chat_normal'; }
    const life0 = s.life;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
    expect(c.flags.meetWishPending).toBeFalsy();
    expect(c.pendingReply?.kind).toBe('invite_ignored');
    expect(s.life).toBe(life0);
    c.awaitingMe = true; c.topic = 'chat_normal';
    expect(replyOptionsFor(s, c.npcId)).not.toContain('meet_wish');
  });
  it('一度会った相手とのトークはライフを使わない', () => {
    const s = newGame('M05', 'met-talk');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'dating', meetings: 1, topic: 'chat_normal' });
    const life0 = s.life;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'zatsudan' });
    expect(s.life).toBe(life0);
    expect(c.flags.meetWishPending).toBeFalsy();
  });
  it('交際中の衝突は未解消でも3週で落ち着き、毎週向き合う場面が出る。ほかを終えたら交際中フラグが立つ', () => {
    const s = newGame('F03', 'clash');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    c.relationship!.unresolvedClash = true;
    c.relationship!.compat = 1;
    let reminders = 0;
    for (let d = 0; d < 35 && c.relationship?.unresolvedClash; d++) {
      openDay(s);
      while (s.pending.length > 0) {
        const ev = s.pending[0];
        if (ev.kind === 'e22') reminders++;
        // 会う選択を続けると3回のデートでクリアして止まるので、週の過ごし方は電話にする（衝突の落ち着き方だけを見る）
        applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.kind === 'e22' ? 'postpone' : ev.kind === 'rel_week' ? 'call' : ev.choices[0].id });
      }
      closeDay(s);
    }
    expect(c.relationship?.unresolvedClash ?? false).toBe(false);
    expect(reminders).toBeGreaterThan(0);
    expect(s.ledger.filter((e) => e.eventId === 'E22').length).toBeLessThanOrEqual(3);
  });
  it('会いたいと伝えて断られたら、無視されて終わるか「予定が合わない」（ライフは減らない。2026-11-08、2026-11-11 返事を3種類に）', () => {
    let refused = 0;
    for (let i = 0; i < 12; i++) {
      const s = newGame('M05', `wish-${i}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      c.interest = 20;
      c.flags.talks = 2; // 誘えるくらい話している
      s.npcs[c.npcId].traits.requiresFace = false;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
      c.pendingReply!.willReply = true;
      const life0 = s.life;
      for (let d = 0; d < 8 && c.flags.meetWishPending; d++) stepDay(s);
      expect(s.ledger.filter((e) => e.category === 'talk').length).toBe(0);
      if (!c.nextDate && c.stage === 'ended') {
        refused++;
        expect(c.endCause).toBe('会う誘いを無視された');
        expect(s.life).toBeGreaterThanOrEqual(life0 - charScaled(s, 12)); // 誘いの失敗そのものでは減らない（同じ週の停滞などは除く）
      } else if (!c.nextDate && c.flags.meetWishDeclinedDay !== undefined) {
        refused++; // 温度がふつう以上の相手は「予定が合わない」と返し、会話は続く
        const said = c.messages.filter((m) => m.from === 'them').map((m) => m.text).join('');
        expect(said).not.toMatch(/もう少し(お話|やり取り)|仲良くなっ|電話してから/); // 人格テンプレの「予定が合わない」の文
      }
    }
    expect(refused).toBeGreaterThan(0);
  });
  it('男性は親密度70以上なら、会いたいと伝えると必ずデートを受けてもらえる', () => {
    for (let i = 0; i < 8; i++) {
      const s = newGame('M05', `sure-${i}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
      c.interest = 75;
      c.flags.lineAfterMeeting = false;
      s.npcs[c.npcId].traits.requiresFace = false;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
      c.pendingReply!.willReply = true;
      for (let d = 0; d < 4 && !c.nextDate && c.stage !== 'ended'; d++) stepDay(s);
      // 断られない（空いている日が合わずに予定が立たないことはある）
      expect(c.messages.some((m) => m.from === 'them' && m.text.includes('また今度でもいいですか'))).toBe(false);
    }
  });
});

describe('格上狙いの開始条件・いいねとスキップの回数・偏差値（2026-11-03）', () => {
  it('開始時の検索条件は元の希望より厳しい（男性は年下、女性は年収600万円以上・身長175cm以上）。「顔写真がある人だけ」は廃止', () => {
    const m = newGame('M05', 'asp-m');
    expect(m.player.prefs.photoOnly).toBe(false); // 2026-11-08 廃止
    // 2026-11-12：年齢は本人の±3歳（下限23歳、蓮だけ20歳から）
    expect(m.player.prefs.ageMin).toBe(m.player.age - 3);
    expect(m.player.prefs.ageMax).toBe(m.player.age + 3);
    expect(newGame('F06', 'asp-young').player.prefs.ageMin).toBe(23);
    expect(newGame('M04', 'asp-ren').player.prefs.ageMin).toBe(20);
    const f = newGame('F03', 'asp-f');
    expect(f.player.prefs.minIncomeYen).toBeGreaterThanOrEqual(6_000_000);
    expect(f.player.prefs.heightMin).toBeGreaterThanOrEqual(175);
  });
  it('いいね・スキップに回数の制限はない（2026-11-13）', () => {
    const f = newGame('F03', 'lk-f');
    applyAction(f, { type: 'setPrefs', prefs: { ...f.player.prefs, minIncomeYen: 0, heightMin: 0, universityOnly: false } });
    applyAction(f, { type: 'searchMore', count: 12 });
    for (const id of f.search.results.slice(0, 7)) applyAction(f, { type: 'skipSearch', npcId: id });
    expect(f.search.exhaustedSeen).toBe(7);
  });
  it('偏差値は容姿・身長・学歴・年収が高いほど高い（25〜80）', () => {
    const s = newGame('F03', 'hen');
    const a = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const n = { ...s.npcs[a.npcId] };
    const lo = npcHensachi({ ...n, looks: 1, heightCm: 160, incomeYen: 2_500_000, education: { kind: 'highschool' } });
    const hi = npcHensachi({ ...n, looks: 5, heightCm: 183, incomeYen: 15_000_000, education: { kind: 'university', group: '旧帝大', school: '東京大学' } });
    expect(hi).toBeGreaterThan(65);
    expect(lo).toBeLessThan(40);
  });
});

describe('プライベートの出来事（2026-11-03）', () => {
  /** 指定の出来事を起こし、先頭の選択（またはchoice）で解決する */
  function happen(s: GameState, id: string, choice?: string) {
    privateEventsDaily(s, id);
    const ev = s.pending.find((e) => e.kind === `pe_${id}`)!;
    expect(ev).toBeDefined();
    expect(ev.lines.some((l) => l.text.startsWith('変化') || l.text.includes('：'))).toBe(true);
    applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: choice ?? ev.choices[0].id });
  }
  it('友人の結婚式の招待状：ライフ−20とご祝儀3万円（予算超過なら更に減る）', () => {
    const s = newGame('M09', 'pe-wed'); // 予算1.5万円
    const life0 = s.life;
    happen(s, 'wedding');
    expect(s.ledger.some((e) => e.delta === -charScaled(s, 20) && e.note.includes('結婚式'))).toBe(true);
    expect(s.money.some((m) => m.yen === 30_000)).toBe(true);
    expect(life0 - s.life).toBeGreaterThan(charScaled(s, 20)); // 予算1.5万円を超えるので予算超過も
    expect(s.feed.some((f) => f.text.includes('招待状'))).toBe(true);
  });
  it('仕事が繁忙期：いいねは1日2回になり、やり取り中の誰か1人が途切れる', () => {
    const s = newGame('F03', 'pe-busy');
    const a = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    happen(s, 'busy');
    expect(a.stage).toBe('ended');
    stepDay(s);
    expect(s.likesLeft).toBe(2);
    expect(activeStatuses(s).some((x) => x.label.includes('繁忙期'))).toBe(true);
  });
  it('体調不良・アプリを閉じる：その間はいいねも返信もできない', () => {
    const s = newGame('F03', 'pe-sick');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    happen(s, 'sick');
    stepDay(s);
    expect(s.likesLeft).toBe(0);
    const n = c.messages.length;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'empathize' });
    expect(c.messages.length).toBe(n);
    const t = newGame('M05', 'pe-close');
    happen(t, 'quit_night', 'close');
    stepDay(t);
    expect(t.likesLeft).toBe(0);
  });
  it('子どもの発熱は子どもがいる人だけ。近いデートは自分からキャンセル', () => {
    const s = newGame('F04', 'pe-kid'); // 子どもあり
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    happen(s, 'kid_fever');
    expect(c.nextDate).toBeUndefined();
    privateEventsDaily(newGame('M05', 'pe-kid2'), 'kid_fever'); // M05には子どもがいないので起きない
  });
  it('ボーナスで今月の予算が増え、料金改定で会員料金が上がる。親の電話で女性の期限が早まる', () => {
    const s = newGame('M05', 'pe-bonus');
    const b0 = monthBudget(s);
    happen(s, 'bonus');
    expect(monthBudget(s)).toBe(b0 + 20_000);
    happen(s, 'fee_up');
    expect(memberFee(s)).toBe(4_500);
    applyAction(s, { type: 'subscribe' });
    expect(s.money.find((m) => m.category === 'fee')?.yen).toBe(4_500);
    const f = newGame('F03', 'pe-parents');
    const d0 = f.player.deadlineMonths;
    happen(f, 'parents');
    expect(f.player.deadlineMonths).toBe(d0 - 1);
  });
  it('通常プレイでは間隔を空けて起き、同じ出来事は1周に1回', () => {
    // 早くクリアすると出来事が起きないこともあるので、何回か遊んだ合計で見る
    let total = 0;
    for (const seed of ['pe-freq', 'pe-freq2', 'pe-freq3']) {
      const s = playBot('F03', seed, { strategy: 'focus', maxWeeks: 30 });
      const done = s.player.privateEventsDone ?? [];
      total += done.length;
      expect(new Set(done).size).toBe(done.length);
    }
    expect(total).toBeGreaterThan(1);
  });
});

describe('停滞（マッチも返信も会う予定もない週）', () => {
  it('いいねを送らなくても、何もない週はライフが減る（男性の方が大きい）。交際中は減らない', () => {
    const m = newGame('M07', 'stag-m');
    for (let i = 0; i < 7; i++) stepDay(m);
    const stag = m.ledger.filter((e) => e.note.includes('停滞'));
    expect(stag).toHaveLength(1);
    expect(-stag[0].delta).toBe(charScaled(m, TUNE_STAGNATION.M));
    const f = newGame('F03', 'stag-f');
    for (let i = 0; i < 7; i++) stepDay(f);
    const fs = f.ledger.filter((e) => e.note.includes('停滞')).reduce((a, e) => a - e.delta, 0);
    expect(fs).toBeLessThanOrEqual(charScaled(f, TUNE_STAGNATION.F));
    // 交際中の週は停滞として数えない
    const r = newGame('F03', 'stag-r');
    devAddContact(r, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    for (let i = 0; i < 7; i++) stepDay(r);
    expect(r.ledger.filter((e) => e.note.includes('停滞'))).toHaveLength(0);
  });
});

describe('さがすの一覧（いいね済みは出さない・スキップ）', () => {
  it('いいねした相手・スキップした相手は一覧から消え、読み込み直しても戻らない', () => {
    const s = newGame('M05', 'search-drop');
    applyAction(s, { type: 'searchMore', count: 12 });
    const [a, b] = s.search.results;
    applyAction(s, { type: 'like', npcId: a });
    expect(s.search.results).not.toContain(a);
    expect(s.contacts[a].stage).toBe('like_sent');
    const seen = s.search.exhaustedSeen;
    applyAction(s, { type: 'skipSearch', npcId: b });
    expect(s.search.results).not.toContain(b);
    expect(s.contacts[b]).toBeUndefined();
    expect(s.search.exhaustedSeen).toBe(seen + 1);
    applyAction(s, { type: 'searchMore', count: 24 });
    expect(s.search.results).not.toContain(a);
    expect(s.search.results).not.toContain(b);
    expect(s.search.results.every((id) => !s.contacts[id])).toBe(true);
  });
});

describe('魅力度と返事の温度・LINE交換', () => {
  /** 同じ条件の相手（好み・人気・温かさ・興味をそろえる）を用意する */
  function setup(id: string) {
    const s = newGame(id, 'appeal');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const n = s.npcs[c.npcId];
    n.taste = 1;
    n.popularity = 0.5;
    n.traits.warmth = 0.6;
    c.interest = 50;
    return { s, c, n };
  }
  it('魅力度は人物のマッチ率の順に並ぶ（男女別）', () => {
    const a = (id: string) => baseAppeal(newGame(id, 'appeal'));
    expect(a('M01')).toBeGreaterThan(a('M07'));
    expect(a('M07')).toBeGreaterThan(a('M05'));
    expect(a('M05')).toBeGreaterThan(a('M03'));
    expect(a('F02')).toBeGreaterThan(a('F03'));
    expect(a('F03')).toBeGreaterThan(a('F10'));
  });
  it('魅力度が低いほど、また男性プレイヤーほど、話を広げない返事が多く返信も来にくい', () => {
    const hi = setup('M01');
    const lo = setup('M03');
    const fem = setup('F10');
    expect(curtChance(lo.s, lo.c, lo.n)).toBeGreaterThan(curtChance(hi.s, hi.c, hi.n));
    expect(curtChance(fem.s, fem.c, fem.n)).toBeLessThan(curtChance(lo.s, lo.c, lo.n));
    expect(initialInterest(lo.s, lo.c, lo.n)).toBeLessThan(initialInterest(hi.s, hi.c, hi.n));
    expect(replyChance(lo.s, lo.c, lo.n)).toBeLessThan(replyChance(fem.s, fem.c, fem.n));
    expect(replyChance(hi.s, hi.c, hi.n)).toBeLessThanOrEqual(0.9);
  });
  it('通常プレイの男性でも「はい」「そうなんですね」のような返事が混ざる', () => {
    let curt = 0;
    for (const seed of ['curt-1', 'curt-2', 'curt-3', 'curt-4']) {
      const s = playBot('M05', seed, { strategy: 'focus', maxWeeks: 10 });
      curt += Object.values(s.contacts).reduce((a, c) => a + Number(c.flags.curtReplies ?? 0), 0);
    }
    expect(curt).toBeGreaterThan(0);
  });
  it('LINEの提案への返事を待つ間に交換が済んでいたら、交換・お断りの返事を重ねない', () => {
    const s = newGame('M05', 'line-dup');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'line' });
    c.pendingReply!.willReply = true;
    c.lineExchanged = true; // 返事が届く前に、デートの別れ際で交換した
    while (!c.awaitingMe && s.day < 10) stepDay(s);
    expect(c.awaitingMe).toBe(true);
    expect(c.topic).not.toBe('line_no');
    expect(c.messages.filter((m) => m.text.includes('LINEを交換しました'))).toHaveLength(0);
  });
  it('LINE交換済みの相手とのデートでは、別れ際にLINEの話が出ない', () => {
    for (let i = 0; i < 10; i++) {
      const s = newGame(i % 2 ? 'F03' : 'M05', `line-done-${i}`);
      applyAction(s, { type: 'subscribe' });
      devAddContact(s, { purpose: 'sincere', stage: 'scheduled', lineExchanged: true });
      for (let d = 0; d < 3; d++) {
        applyAction(s, { type: 'advance' });
        for (let k = 0; k < 20 && s.pending.length; k++) {
          const ev = s.pending[0];
          if (ev.kind === 'date_end') expect(ev.choices.map((x) => x.id).some((x) => x.includes('line'))).toBe(false);
          applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id });
        }
      }
    }
  });
  it('デートの別れ際にLINEを交換する（または断られる）場面があり、記録に残る', () => {
    let exchanged = 0;
    let declined = 0;
    for (let i = 0; i < 12; i++) {
      const s = newGame('M05', `line-date-${i}`);
      applyAction(s, { type: 'subscribe' });
      const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
      advanceDays(s, 2, { date_end: 'ask_line', date_talk: 'listen', date_pay: 'all' });
      const notes = c.dates.flatMap((d) => d.notes ?? []);
      if (c.lineExchanged) {
        exchanged += 1;
        expect(notes.some((n) => n.includes('LINE'))).toBe(true);
        const thanks = c.messages.find((m) => m.from === 'me' && m.text.startsWith('今日はありがとう'));
        expect(thanks?.channel).toBe('line');
      } else if (notes.some((n) => n.includes('はぐらかされた'))) {
        declined += 1;
      }
    }
    expect(exchanged).toBeGreaterThan(0);
    expect(exchanged + declined).toBeGreaterThan(6);
  });
});

describe('男性の有料会員（30日4,000円）', () => {
  it('開始時は未加入で利用料はかからない。アプリ内でメッセージを送るには加入が必要', async () => {
    const { needsMembership } = await import('./chat');
    const s = newGame('M05', 'member-1');
    expect(s.money.filter((m) => m.category === 'fee')).toHaveLength(0);
    const c = devAddContact(s, { purpose: 'sincere', stage: 'matched' });
    expect(needsMembership(s, c)).toBe(true);
    applyAction(s, { type: 'firstMessage', npcId: c.npcId, optionId: 'good' });
    expect(c.firstMessageSentDay).toBeUndefined();
    applyAction(s, { type: 'subscribe' });
    expect(s.money.filter((m) => m.category === 'fee').reduce((a, m) => a + m.yen, 0)).toBe(4000);
    applyAction(s, { type: 'firstMessage', npcId: c.npcId, optionId: 'good' });
    expect(c.firstMessageSentDay).toBe(0);
  });
  it('30日で切れ、自動では更新しない。LINEに移った相手には加入なしで送れる', async () => {
    const { needsMembership } = await import('./chat');
    const s = newGame('M05', 'member-2');
    applyAction(s, { type: 'subscribe' });
    s.day = 29;
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    expect(needsMembership(s, c)).toBe(false);
    s.day = 30;
    expect(needsMembership(s, c)).toBe(true);
    c.lineExchanged = true;
    expect(needsMembership(s, c)).toBe(false);
    expect(s.money.filter((m) => m.category === 'fee')).toHaveLength(1);
  });
  it('LINE交換は提案しただけでは成立せず、相手が受けたら交換の記録のあとLINEに移る（加入切れでも送れる）', async () => {
    const { needsMembership } = await import('./chat');
    const { channelOf } = await import('./contact');
    const s = newGame('M05', 'member-line');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'business', stage: 'talking', topic: 'chat_normal' });
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'line' });
    expect(c.lineExchanged).toBe(false);
    expect(c.pendingReply?.kind).toBe('line_answer');
    c.pendingReply!.willReply = true;
    while (!c.lineExchanged && s.day < 10) stepDay(s);
    const tail = c.messages.slice(-2);
    expect(tail[0]).toMatchObject({ from: 'them', channel: 'app' });
    expect(tail[1]).toMatchObject({ from: 'system', channel: 'line' });
    expect(channelOf(c)).toBe('line');
    s.day = 40;
    expect(needsMembership(s, c)).toBe(false);
  });
  it('「LINEは会ってから」の相手には断られ、次に会うまでは聞き直せない', () => {
    const s = newGame('M05', 'line-no');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    c.flags.lineAfterMeeting = true;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'line' });
    c.pendingReply!.willReply = true;
    while (c.topic !== 'line_no' && s.day < 10) stepDay(s);
    expect(c.lineExchanged).toBe(false);
    expect(c.topic).toBe('line_no');
    c.topic = 'chat_normal';
    expect(replyOptionsFor(s, c.npcId)).not.toContain('line');
    c.meetings = 1;
    expect(replyOptionsFor(s, c.npcId)).toContain('line');
  });
  it('女性は加入不要', async () => {
    const { needsMembership } = await import('./chat');
    const s = newGame('F03', 'member-3');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'matched' });
    expect(needsMembership(s, c)).toBe(false);
  });
});

describe('レビューで見つかった不具合の再発防止', () => {
  it('週の途中で他の相手とのやり取りを終えたら、その週の比較疲れ（E20）は数えない', () => {
    const s = newGame('M01', 'e20-close');
    subscribe(s);
    const cs = Array.from({ length: 7 }, () => devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' }));
    for (const c of cs) applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'empathize' });
    expect(s.week.activeConversationIds.length).toBe(7);
    for (const c of cs.slice(1)) applyAction(s, { type: 'endContact', npcId: c.npcId });
    s.week.repliesReceived = 1; // 停滞の判定とは切り離して見る
    const before = s.life;
    weeklySettlement(s);
    expect(s.ledger.some((e) => e.eventId === 'E20')).toBe(false);
    expect(s.life).toBe(before);
  });
  it('自分から交際を申し込んで断られた相手は「比較して時間切れ」に数えない', () => {
    const s = newGame('F08', 'cmp-1');
    for (let i = 0; i < 2; i++) {
      const c = devAddContact(s, { purpose: 'sincere', stage: 'dating', meetings: 2 });
      c.playerWantsMore = true;
      c.flags.playerProposed = true;
      c.stage = 'ended';
      c.endedBy = 'them';
    }
    applyLoss(s, 100, 'monthly', 'テスト');
    s.status = 'gameover';
    const r = buildResult(s);
    expect([r.primary?.type, ...r.secondary.map((x) => x.type)]).not.toContain('comparison');
  });
  it('会う前に断れた勧誘・サクラは「欺瞞・犯罪被害」の要因にしない', () => {
    const s = newGame('F08', 'avoid-1');
    const a = devAddContact(s, { purpose: 'business', stage: 'talking', topic: 'business_pitch_hint' });
    applyAction(s, { type: 'reply', npcId: a.npcId, optionId: 'decline' });
    const b = devAddContact(s, { purpose: 'sakura', stage: 'talking', topic: 'sakura_move' });
    applyAction(s, { type: 'reply', npcId: b.npcId, optionId: 'decline' });
    applyLoss(s, 100, 'monthly', 'テスト');
    s.status = 'gameover';
    const r = buildResult(s);
    expect([r.primary?.type, ...r.secondary.map((x) => x.type)]).not.toContain('deception');
  });
  it('結果の見出しに「GAME OVER」を重ねない', () => {
    const s = newGame('F06', 'head-1');
    applyLoss(s, 100, 'monthly', 'テスト');
    s.status = 'gameover';
    expect(buildResult(s).headline.startsWith('GAME OVER')).toBe(false);
  });
});

describe('再現ケース補助', () => {
  it('advanceDays が日数どおり進む', () => {
    const s = newGame('M05', 'adv');
    advanceDays(s, 14);
    expect(s.day).toBeGreaterThanOrEqual(14);
  });
});

describe('話題カード方式の会話（2026-11-06）', () => {
  function talking(seed: string) {
    const s = newGame('M07', seed);
    s.flags.noPrivateEvents = true;
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    c.flags.reach = 3;
    return { s, c };
  }
  it('相手に質問されたら「答えて、聞き返す」になり、こちらの答えと聞き返しが入る', () => {
    const { s, c } = talking('conv-1');
    c.flags.convTopic = 'food'; c.flags.convAct = 'ask'; c.flags.askIdx = 0;
    // 2026-11-11：聞かれたら 詳しく答える・適当に答える・ブロック。答えたあと聞き返せる
    expect(replyOptions(s, c).map((o) => o.id).slice(0, 3)).toEqual(['ans_d', 'ans_c', 'block']);
    const plan = talkChoice(s, c, s.npcs[c.npcId], 'ans_d+back')!;
    expect(plan.text).toContain(`${s.npcs[c.npcId].name}さん`);
    const from = c.messages.length;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'ans_d+back' });
    const mine = c.messages.slice(from).filter((m) => m.from === 'me').map((m) => m.text).join('');
    expect(mine).toBe(plan.text.replace(/[\s　]+/g, ''));
    expect(c.flags.myAct).toBe('answer_ask');
  });
  it('相手が話したあとは「話を広げる」と「話題を変える」が選べる', () => {
    const { s, c } = talking('conv-2');
    c.flags.convTopic = 'food'; c.flags.convAct = 'tell'; c.flags.convUsed = 'food';
    const ids = replyOptions(s, c).map((o) => o.id);
    expect(ids).toContain('profile_q'); // プロフィールを見て質問する
    const qs = talkMenu(s, c, s.npcs[c.npcId]).questions;
    expect(qs.some((q) => q.key.startsWith('d:food:'))).toBe(true); // いまの話の深掘り
    expect(qs.some((q) => q.key.startsWith('a:hobby:'))).toBe(true); // プロフィールの趣味
    for (const q of qs) expect(q.text).toMatch(/[？?]/);
  });
  it('質問に相槌だけ返すと、かみ合わずに相手が少し冷める', () => {
    const { s, c } = talking('conv-3');
    c.flags.convTopic = 'travel'; c.flags.convAct = 'ask'; c.flags.askIdx = 0; c.flags.convUsed = 'travel';
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'aizuchi' });
    const i0 = c.interest;
    for (let d = 0; d < 8 && !c.awaitingMe; d++) stepDay(s);
    if (c.flags.convTopic !== 'travel' || c.messages.at(-1)?.from === 'them') expect(c.interest).toBeLessThanOrEqual(i0);
  });
});

describe('写真と違う・カレンダーの私用・交際後のデート（2026-11-07）', () => {
  it('「写真と違う」相手の実際の顔は、容姿レベルが1つ下の顔写真', () => {
    const s = newGame('F03', 'actual-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const npc = s.npcs[c.npcId];
    Object.assign(npc, { gender: 'M', photo: 'k150.jpg', looks: 4, age: 30 });
    const file = actualFacePhoto(s, npc)!;
    const t = MALE_PHOTOS.find((x) => x.file === file)!;
    expect(t.looks).toBe(3);
    expect(t.faceVisible).toBe(true);
  });
  it('マチアプと関係ない予定は、会えない日にだけ入る', () => {
    const s = newGame('M07', 'pcal-1');
    let n = 0;
    for (let d = 0; d < 90; d++) {
      const ev = privateEventOn(s, d);
      if (ev) { n++; expect(playerFree(s, d)).toBe(false); }
    }
    expect(n).toBeGreaterThan(5);
  });
  it('交際後のデートもカレンダーから日を選び、その日に会って費用がかかる', () => {
    const s = newGame('F03', 'reldate-1');
    s.flags.noPrivateEvents = true;
    const c = devAddContact(s, { purpose: 'sincere', stage: 'relationship', meetings: 3 });
    let picked = false;
    for (let i = 0; i < 40 && !picked; i++) {
      openDay(s);
      while (s.pending.length) {
        const ev = s.pending[0];
        if (ev.kind === 'rel_week') { applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'meet' }); continue; }
        if (ev.kind === 'rel_pick') { applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id }); picked = true; continue; }
        applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id });
      }
      closeDay(s);
    }
    expect(picked).toBe(true);
    const day = Number(c.flags.relDateDay);
    expect(day).toBeGreaterThan(s.day);
    const met0 = c.meetings;
    while (s.day < day) stepDay(s);
    if (c.stage === 'relationship') {
      expect(c.meetings).toBe(met0 + 1);
      expect(c.dates.some((d) => d.day === day && d.outcome === 'met')).toBe(true);
    }
  });
});

describe('写真素材の追加分と設定の整合（2026-11-07）', () => {
  it('医師は医学部のある大学（旧帝大・慶應）で、若すぎない', () => {
    for (const ch of ['F01', 'F03', 'F08']) for (let k = 0; k < 3; k++) {
      const s = newGame(ch, `med-${k}`);
      applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, ageMin: 18, ageMax: 60, minIncomeYen: 0, heightMin: 0, universityOnly: false, neverMarriedOnly: false, photoOnly: false } });
      for (let i = 0; i < 6; i++) applyAction(s, { type: 'searchMore', count: 24 });
      for (const npc of Object.values(s.npcs)) {
        if (npc.job !== '医師') continue;
        expect(npc.education.kind).toBe('university');
        if (npc.education.kind === 'university') {
          expect(['旧帝大', '早慶']).toContain(npc.education.group);
          expect(npc.education.school).not.toBe('早稲田大学');
        }
        expect(npc.age).toBeGreaterThanOrEqual(26);
      }
    }
  });
  it('加工写真の相手の実際の顔は、容姿レベルが2つ下', () => {
    const s = newGame('F03', 'filtered-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const npc = s.npcs[c.npcId];
    Object.assign(npc, { gender: 'M', photo: 'k317.jpg', looks: 4, age: 24, filteredPhoto: true });
    const file = actualFacePhoto(s, npc);
    const t = MALE_PHOTOS.find((x) => x.file === file)!;
    expect(t.looks).toBe(2);
  });
  it('加工写真の素材が入っていて、写真素材は合計360枚前後', () => {
    expect(MALE_PHOTOS.filter((t) => t.filtered && t.id.startsWith('p')).length).toBe(8); // 2026-11-09 統合版（2026-11-10 の追加分 q で始まる素材は数えない）
    expect(MALE_PHOTOS.length).toBeGreaterThan(350);
  });
});

describe('女性の写真素材（2026-11-08）', () => {
  it('男性プレイヤーの相手（女性）に、設定どおりの写真を1人1回だけ割り当てる', () => {
    const s = newGame('M07', 'fphoto-1');
    applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, ageMin: 18, ageMax: 60, heightMin: 0, universityOnly: false, photoOnly: false } });
    for (let i = 0; i < 8; i++) applyAction(s, { type: 'searchMore', count: 24 });
    const withPhoto = Object.values(s.npcs).filter((n) => FEMALE_PHOTOS.some((t) => t.faceVisible && t.file === n.photo));
    expect(withPhoto.length).toBeGreaterThan(10);
    expect(new Set(withPhoto.map((n) => n.photo)).size).toBe(withPhoto.length);
    for (const n of withPhoto) {
      const t = FEMALE_PHOTOS.find((x) => x.file === n.photo)!;
      expect(n.gender).toBe('F');
      expect(n.looks).toBe(t.looks);
      expect(Math.abs(n.age - t.age)).toBeLessThanOrEqual(3);
      if (n.job === '医師' && n.education.kind === 'university') expect(['旧帝大', '早慶']).toContain(n.education.group);
    }
  });
  it('女性の相手の「写真と違う」も、容姿レベルが1つ下の写真を見せる', () => {
    const s = newGame('M07', 'fphoto-2');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    const npc = s.npcs[c.npcId];
    Object.assign(npc, { gender: 'F', photo: 'f4002.jpg', looks: 4, age: 26 });
    const file = actualFacePhoto(s, npc);
    const t = FEMALE_PHOTOS.find((x) => x.file === file)!;
    expect(t.looks).toBe(3);
  });
});

describe('男性プレイヤーの会う前のトーク（2026-11-08）', () => {
  it('マッチしても一度も返ってこない相手と、途中で突然ブロックする相手がいる', () => {
    // 誘える往復を3〜6に下げてから突然のブロックは少し減った。容姿の倍率を上げてから（容姿3で1.5倍）大輔では返信のない相手がほぼいないので、悠斗で見る（2026-11-14）
    const cs = ['empty-1', 'empty-2', 'empty-3', 'empty-4', 'empty-5', 'empty-6', 'empty-7', 'empty-8'].flatMap((seed) => Object.values(playBot('M05', seed, { strategy: 'wide', maxWeeks: 6 }).contacts)).filter((c) => c.matchedDay !== undefined);
    expect(cs.some((c) => c.flags.silent && c.messages.every((m) => m.from !== 'them'))).toBe(true);
    expect(cs.some((c) => c.endCause === '会話の途中で突然ブロックされた')).toBe(true);
  }, 60_000); // 自動プレイを8回するので、ほかのテストと重なると5秒を超える
});

describe('統合版の写真素材（2026-11-09）', () => {
  it('検索といいねに出る相手は全員写真がある（写真を割り当てられない相手は出さない）', () => {
    for (const ch of ['M07', 'F03']) {
      const g = playBot(ch, `allphoto-${ch}`, { strategy: 'wide', maxWeeks: 8 });
      const shown = Object.values(g.npcs).filter((n) => n.source === 'search' || n.source === 'received');
      expect(shown.length).toBeGreaterThan(10);
      for (const n of shown) expect(n.photo).toBeTruthy();
    }
  });
  it('年収を盛る人・医師や弁護士を偽る人がいる', () => {
    const g = playBot('F03', 'fake-title', { strategy: 'wide', maxWeeks: 12 });
    const ns = Object.values(g.npcs);
    expect(ns.some((n) => n.realIncomeYen && n.realIncomeYen < n.incomeYen)).toBe(true);
    for (const n of ns.filter((x) => x.fakeTitle)) expect(['医師', '弁護士']).toContain(n.job);
  });
});

describe('高級店を指定してくる相手（2026-11-09）', () => {
  it('男性プレイヤーのトークの途中で、相手から高級店を指定され、おごる前提になる', () => {
    let found = 0;
    for (let i = 0; i < 12 && !found; i++) {
      const g = playBot('M07', `meshi-${i}`, { strategy: 'wide', maxWeeks: 10 });
      for (const c of Object.values(g.contacts)) {
        if (!c.flags.meshiRequested || c.flags.meshiStore === undefined) continue;
        found++;
        expect(g.npcs[c.npcId].traits.payExpectation).toBe('treat');
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('偏差値の差と親身さ（2026-11-09）', () => {
  it('自分の偏差値が相手より高いほど親身な相手が増える（全員ではない）', async () => {
    const { attentiveness } = await import('./appeal');
    const share = (id: string) => {
      const s = newGame(id, 'att-t');
      applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, ageMin: 18, ageMax: 60, minIncomeYen: 0, heightMin: 0, universityOnly: false, neverMarriedOnly: false } });
      for (let i = 0; i < 4; i++) applyAction(s, { type: 'searchMore', count: 24 });
      const ns = Object.values(s.npcs);
      return ns.filter((n) => attentiveness(s, n) > 0).length / ns.length;
    };
    const top = share('M01');
    const low = share('M09');
    expect(top).toBeGreaterThan(low);
    expect(top).toBeLessThan(0.95); // 全員がそうなるわけではない
  });
});

describe('夜職フォルダの相手（2026-11-09）', () => {
  it('13枚を1割ふつう・4割バー勧誘・5割高めの店に振り分け、容姿は4', () => {
    // 既存の夜職フォルダ（p で始まる素材）。2026-11-11 に追加分（q）36枚も夜職メシ目にしたので、そちらは別に数える
    const night = FEMALE_PHOTOS.filter((t) => t.nightWork && t.id.startsWith('p'));
    const added = FEMALE_PHOTOS.filter((t) => t.nightWork && t.id.startsWith('q'));
    expect(added.length).toBe(36);
    expect(added.every((t) => t.nightWork === 'bar' || t.nightWork === 'meshi')).toBe(true);
    expect(night.length).toBe(13);
    expect(night.filter((t) => t.nightWork === 'normal').length).toBe(1);
    expect(night.filter((t) => t.nightWork === 'bar').length).toBe(5);
    expect(night.filter((t) => t.nightWork === 'meshi').length).toBe(7);
    for (const t of night) expect(t.looks).toBe(4);
  });
  for (const choice of ['go', 'refuse'] as const) {
    it(`バー勧誘の相手は食事のあとバーに誘い、どちらを選んでも交際にならない（${choice}）`, () => {
      const s = newGame('M07', `bar-${choice}`);
      const c = devAddContact(s, { purpose: 'profit', stage: 'scheduled' });
      s.npcs[c.npcId].nightWork = 'bar';
      const seen: string[] = [];
      for (let i = 0; i < 3 && c.stage !== 'ended'; i++) {
        openDay(s);
        seen.push(...resolveAll(s, { date_bar: choice, date_pay: 'all' }));
        closeDay(s);
      }
      expect(seen).toContain('date_bar');
      expect(c.stage).toBe('ended');
      if (choice === 'go') expect(c.endCause).toBe('ぼったくりバーで高額を請求された');
    });
  }
});

describe('体験談の反映（2026-11-09）', () => {
  it('初めて会って相手が冷めていると、トイレに行ったまま帰られることがある（2人分を払う）', () => {
    const s = newGame('M07', 'bail-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    s.flags[`dev:bail:${c.npcId}`] = '1';
    s.flags[`dev:noshow:${c.npcId}`] = '0';
    const seen: string[] = [];
    for (let i = 0; i < 3 && c.stage !== 'ended'; i++) { openDay(s); seen.push(...resolveAll(s)); closeDay(s); }
    expect(seen).toContain('date_bail');
    expect(c.endCause).toBe('デートの途中で帰られた');
  });
  it('2回目以降のデートでは「前回聞いた話の続きをする」を選べる', () => {
    const s = newGame('F03', 'remember-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled', meetings: 1 });
    let found = false;
    for (let i = 0; i < 3 && !found; i++) {
      openDay(s);
      for (let k = 0; k < 20 && s.pending.length; k++) {
        const ev = s.pending[0];
        if (ev.kind === 'date_talk') { found = ev.choices.some((x) => x.id === 'remember'); applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'remember' }); continue; }
        applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id });
      }
      closeDay(s);
    }
    expect(found).toBe(true);
    void c;
  });
  it('会う前に電話で話していると、初めて会ったときに減点されにくい', () => {
    const s = newGame('M07', 'call-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    c.flags.callsBeforeMeet = 2;
    s.flags[`dev:bail:${c.npcId}`] = '0';
    openDay(s);
    expect(Number(c.flags.rejMult)).toBeLessThan(0.8);
  });
});

describe('不同意性交だったと訴えられる（E25・2026-11-09）', () => {
  it('男性プレイヤーが体の関係を持った相手から、数日後に代理人の連絡が来る', () => {
    const s = newGame('M07', 'e25-1');
    const c = devAddContact(s, { purpose: 'body', stage: 'scheduled' });
    s.flags[`dev:accuse:${c.npcId}`] = '1';
    s.flags[`dev:bail:${c.npcId}`] = '0';
    const seen: string[] = [];
    for (let i = 0; i < 20 && !seen.includes('e25'); i++) {
      openDay(s);
      seen.push(...resolveAll(s, { night_invite: 'go', e25: 'lawyer' }));
      closeDay(s);
    }
    expect(seen).toContain('night_invite');
    expect(seen).toContain('e25');
    expect(s.eventLog.some((e) => e.eventId === 'E25')).toBe(true);
    expect(c.stage).toBe('ended');
  });
  it('女性プレイヤーには起きない', () => {
    const s = newGame('F03', 'e25-2');
    const c = devAddContact(s, { purpose: 'body', stage: 'scheduled' });
    s.flags[`dev:accuse:${c.npcId}`] = '1';
    s.flags[`dev:bail:${c.npcId}`] = '0';
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) { openDay(s); seen.push(...resolveAll(s, { night_invite: 'go' })); closeDay(s); }
    expect(seen).not.toContain('e25');
  });
});

describe('日程・年収表示・返信（2026-11-09 まとめて）', () => {
  it('お互いに会える日は、どの人物でも週2日以上ある', async () => {
    const { findDateDays } = await import('./dates');
    for (const id of ['M01', 'M05', 'M07', 'F06', 'F10']) {
      const s = newGame(id, `guar-${id}`);
      for (let i = 0; i < 8; i++) applyAction(s, { type: 'searchMore', count: 24 });
      const npcs = Object.values(s.npcs).filter((n) => n.distanceMin <= 60 && n.purpose !== 'married').slice(0, 5);
      expect(npcs.length).toBeGreaterThan(0);
      for (const n of npcs) {
        const days = findDateDays(s, n, 0, 99);
        for (let w = 1; w <= 2; w++) expect(days.filter((d) => Math.floor(d / 7) === w).length).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('女性NPCの約1割は年収を書いていない（未記入・秘密）', () => {
    const s = newGame('M07', 'inc-hidden');
    for (let i = 0; i < 12; i++) applyAction(s, { type: 'searchMore', count: 24 });
    const fs = Object.values(s.npcs).filter((n) => n.gender === 'F');
    const hidden = fs.filter((n) => n.incomeHidden);
    expect(hidden.length / fs.length).toBeGreaterThan(0.03);
    expect(hidden.length / fs.length).toBeLessThan(0.2);
    // 年収で絞ると出てこない
    const t = newGame('M07', 'inc-hidden-2');
    applyAction(t, { type: 'setPrefs', prefs: { ...t.player.prefs, minIncomeYen: 1_000_000 } });
    for (let i = 0; i < 6; i++) applyAction(t, { type: 'searchMore', count: 24 });
    for (const id of t.search.results) expect(t.npcs[id].incomeHidden).toBeUndefined();
  });
  it('平日のデートの日に急な残業が入り、自分からキャンセルすることがある', () => {
    const s = newGame('M07', 'overtime-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    s.flags[`dev:overtime:${c.npcId}`] = '1';
    while (c.nextDate!.day % 7 >= 5) c.nextDate!.day += 1;
    while (s.day < c.nextDate!.day - 1) stepDay(s);
    openDay(s);
    const ev = s.pending.find((e) => e.kind === 'work_call');
    expect(ev?.title).toBe('夕方、急な残業');
    applyAction(s, { type: 'resolve', uid: ev!.uid, choiceId: 'work' });
    expect(c.nextDate).toBeUndefined();
    const last = c.dates[c.dates.length - 1];
    expect((last.notes ?? []).join('')).toContain('急な残業');
    // トークにも、こちらからキャンセルしたことが残る
    expect(c.messages.some((m) => m.from === 'me' && m.text.includes('残業'))).toBe(true);
  });
  it('格上の男性プレイヤー（健人）は、返信がまったく来ない相手が少ない', async () => {
    const { playerPopularity } = await import('./appeal');
    expect(playerPopularity(newGame('M01', 'pop'))).toBeGreaterThan(0.8);
    expect(playerPopularity(newGame('M09', 'pop'))).toBe(0);
  });
});

describe('会う誘いへの返事がはっきりしている（2026-11-09）', () => {
  it('まだあまり話していない相手を誘うと、「もう少しお話ししてから」と返される（2026-11-14。以前は「予定が合わない」）', () => {
    const s = newGame('F03', 'clear-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal', exchanges: 3 });
    c.flags.talks = 0;
    const before = c.messages.length;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'meet_wish' });
    for (let i = 0; i < 8 && !c.awaitingMe && c.stage !== 'ended'; i++) stepDay(s);
    const reply = c.messages.slice(before).filter((m) => m.from === 'them').map((m) => m.text).join('');
    expect(reply).toMatch(/話し|知|早い|そのうち/);
    expect(reply).not.toMatch(/予定/); // 「予定が合わない」と見分けがつくように
  });
});

describe('設定の矛盾がない（2026-11-09）', () => {
  it('学歴に対して若すぎる人がいない（大卒22歳・院卒24歳・専門卒20歳以上）', () => {
    for (const id of ['M07', 'F06']) {
      const s = newGame(id, `edu-age-${id}`);
      applyAction(s, { type: 'setPrefs', prefs: { ...s.player.prefs, ageMin: 18, ageMax: 40 } });
      for (let i = 0; i < 15; i++) applyAction(s, { type: 'searchMore', count: 24 });
      for (const n of Object.values(s.npcs)) {
        const e = n.education;
        const min = e.kind === 'university' ? (e.detail === '在学中' ? 18 : e.detail === '大学院修了' ? 24 : 22) : e.kind === 'vocational' ? 20 : 18;
        expect(n.age, `${n.age}歳 ${JSON.stringify(e)}`).toBeGreaterThanOrEqual(min);
      }
    }
  }, 30_000); // 相手を多く作るので、ほかのテストと並ぶと5秒を超えることがある
});

describe('交際スタートの表示（2026-11-10）', () => {
  it('家の誘いに「付き合ってから」と返して付き合うことになったら、デートを締めて交際スタートの場面が出る', () => {
    let checked = 0;
    for (let i = 0; i < 30 && checked === 0; i++) {
      const s = newGame('F03', `relstart-${i}`);
      const c = devAddContact(s, { purpose: 'body', stage: 'scheduled' });
      s.flags[`dev:bail:${c.npcId}`] = '0';
      s.flags[`dev:noshow:${c.npcId}`] = '0';
      const seen: string[] = [];
      for (let d = 0; d < 3 && c.stage !== 'relationship'; d++) { openDay(s); seen.push(...resolveAll(s, { night_invite: 'confirm' })); closeDay(s); }
      if (c.stage !== 'relationship' || !seen.includes('night_invite')) continue;
      checked++;
      expect(seen).toContain('rel_start');
      expect(c.nextDate).toBeUndefined();
      expect(c.dates.some((x) => x.impression === 'good')).toBe(true);
    }
    expect(checked).toBe(1);
  });
});

describe('すぐ飲みに誘ってくる相手（2026-11-21）', () => {
  it('会いたい・電話したいと返しても「もう少しお話ししてから」と断られない', () => {
    for (const opt of ['meet_wish', 'callwish']) {
      const s = newGame('F01', `eager-${opt}`);
      s.flags.noPrivateEvents = true;
      s.player.photoVisible = true;
      const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
      c.flags.earlyDrink = true;
      c.flags.reach = 3;
      c.exchanges = 1;
      c.awaitingMe = true;
      applyAction(s, { type: 'reply', npcId: c.npcId, optionId: opt } as never);
      if (opt === 'meet_wish') {
        expect(c.pendingReply?.kind).toBe('date_answer');
        expect(c.flags.meetWishDeclinedDay).toBeUndefined();
      } else {
        expect(c.pendingReply?.kind).toBe('call_wish');
      }
    }
  });
});

describe('2026-11-21：ライフは整数・結衣のクリスマス', () => {
  it('小数の損失でもライフは整数のまま', () => {
    const s = newGame('F03', 'int-life');
    applyLoss(s, 4.55, 'event', 'テスト');
    applyLoss(s, 3.3, 'event', 'テスト');
    expect(Number.isInteger(s.life)).toBe(true);
    expect(s.life).toBe(100 - 5 - 3);
  });
  it('結衣は12月24日に必ずクリスマスの出来事でライフが減る（ほかの人には起きない）', async () => {
    const { xmasDaily, TUNE_XMAS_FLAPPE } = await import('./privateEvents');
    const { calendarParts } = await import('./calendar');
    const eve = Array.from({ length: 80 }, (_, d) => d).find((d) => { const p = calendarParts(d); return p.m === 12 && p.d === 24; })!;
    const s = newGame('F08', 'xmas-1');
    s.day = eve;
    xmasDaily(s);
    const ev = s.pending.find((p) => p.kind === 'pe_xmas_flappe')!;
    expect(ev).toBeDefined();
    const before = s.life;
    applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'ok' });
    expect(before - s.life).toBe(TUNE_XMAS_FLAPPE.single);
    // 2回は起きない
    xmasDaily(s);
    expect(s.pending.some((p) => p.kind === 'pe_xmas_flappe')).toBe(false);
    const o = newGame('F03', 'xmas-2');
    o.day = eve;
    xmasDaily(o);
    expect(o.pending.some((p) => p.kind === 'pe_xmas_flappe')).toBe(false);
  });
});

describe('プロフィールの充実度（2026-11-23）', () => {
  it('「よろしく」だけの相手には仕事と休日しか聞けず、趣味だけの相手も聞ける話題が少ない。推し活は聞けない', async () => {
    const { talkMenu } = await import('./conversation');
    const s = newGame('F03', 'pd-talk');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal', exchanges: 3 });
    const npc = s.npcs[c.npcId];
    const groups = () => new Set(talkMenu(s, c, npc).questions.map((q) => q.group));
    npc.profileDepth = 'normal';
    const full = groups().size;
    npc.profileDepth = 'bare';
    expect([...groups()].every((g) => g === '仕事' || g === '休日')).toBe(true);
    npc.profileDepth = 'sparse';
    expect([...groups()].every((g) => ['趣味', '旅行', '仕事', '休日'].includes(g))).toBe(true);
    void full;
    npc.profileDepth = 'normal';
    npc.hobbies = ['推し活', 'カフェ巡り'];
    expect(talkMenu(s, c, npc).questions.some((q) => q.text.includes('推し活'))).toBe(false);
  });
  it('充実したプロフィールは5行以上で、仕事・休日（趣味）・好きなタイプに触れる', () => {
    const s = newGame('M07', 'pd-rich');
    for (let i = 0; i < 8; i++) applyAction(s, { type: 'searchMore', count: 24 });
    const rich = Object.values(s.npcs).filter((n) => n.profileDepth === 'rich');
    expect(rich.length).toBeGreaterThan(0);
    for (const n of rich) {
      expect(n.profileText.split('\n').length).toBeGreaterThanOrEqual(5);
      expect(/仕事|働/.test(n.profileText) || n.profileText.includes(n.job.replace(/（.*）/, ''))).toBe(true);
      expect(n.profileText).toMatch(/休日|休み|オフ|週末/);
      expect(n.profileText).toMatch(/タイプ|惹かれ|素敵だな|好きな人/);
    }
    const bare = Object.values(s.npcs).filter((n) => n.profileDepth === 'bare');
    for (const n of bare) expect(n.profileText).toMatch(/^よろしくお願いします/);
  });
});

describe('プロフィールを見て聞ける質問の数（2026-11-23）', () => {
  it('よろしくだけ2つ・5行以内3つ・充実5つ', async () => {
    const { talkMenu } = await import('./conversation');
    const s = newGame('F03', 'pd-count');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal', exchanges: 3 });
    const npc = s.npcs[c.npcId];
    const count = () => talkMenu(s, c, npc).questions.filter((q) => q.key.startsWith('a:')).length;
    for (const [d, n] of [['bare', 2], ['sparse', 3], ['normal', 3], ['rich', 5]] as const) {
      npc.profileDepth = d;
      expect(count(), d).toBe(n);
    }
  });
});

describe('勤務の時間帯と朝（2026-11-23）', () => {
  it('会社員の出勤日は、0時から18時までアプリを開ける時間がない（通勤を含む7:30〜18:00）', async () => {
    const { blockAt, scheduleOf } = await import('./clock');
    const { workFromHome } = await import('./dates');
    for (const id of ['M01', 'M07', 'F01', 'F03']) {
      const s = newGame(id, `work-${id}`);
      s.flags.noPrivateEvents = true;
      let checked = 0;
      for (let d = 0; d < 14 && checked < 3; d++) {
        s.day = d;
        if (d % 7 >= 5 || workFromHome(s, d)) continue;
        const blocks = scheduleOf(s);
        const work = blocks.find((b) => b.kind === 'work');
        if (!work) continue;
        expect(work.start).toBe(7 * 60 + 30);
        for (let m = 0; m < 18 * 60; m += 15) expect(blockAt(s, m, blocks), `${id} ${d}日 ${m}分`).toBeDefined();
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});

describe('ロック画面の続けて飛ばす表示（2026-11-23）', () => {
  it('出勤日の0時は「睡眠→通勤・仕事」がつながり、仕事が終わり次第開けると分かる', async () => {
    const { lockChain } = await import('./clock');
    const s = newGame('M09', 'chain-1');
    s.flags.noPrivateEvents = true;
    s.day = 1; s.clock = 0;
    const ch = lockChain(s);
    expect(ch.steps.map((x) => x.kind)).toEqual(['sleep', 'work']);
    expect(ch.steps[0].untilLabel).toBe('7:30');
    expect(ch.afterWork).toBe(true);
    expect(ch.openLabel).toMatch(/18:00|2[0-2]:/);
  });
});

describe('睡眠と勤務をまとめて飛ばす（2026-11-23）', () => {
  it('出勤日の0時から1回で、睡眠と通勤・仕事を終わりまで進める', async () => {
    const { clockOf } = await import('./clock');
    const s = newGame('M09', 'skipchain');
    s.flags.noPrivateEvents = true;
    s.day = 1; s.clock = 0;
    applyAction(s, { type: 'closeApp' });
    applyAction(s, { type: 'skipChain' });
    expect(s.day).toBe(1);
    expect(clockOf(s)).toBeGreaterThanOrEqual(18 * 60);
  });
});
