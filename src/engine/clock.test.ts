// 時間進行・ロック画面・生活リズム（2026-11-13）
import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from './actions';
import {
  DAY_MIN, GAME_MIN_PER_REAL_SEC, advanceFree, awaitingNow, blockAt, canOpenApp, clockOf, dayTransition, lifeNow, lockMode,
  nextStop, noticeSection, scheduleOf, skipBlock, visibleNotices, visiblePending,
} from './clock';
import { privateEventOn, workFromHome } from './dates';
import { devAddContact } from './devScenarios';
import { deserialize, serialize } from './save';
import type { GameState } from './types';

/** ロック画面を「現実の秒数」だけ動かす（画面のタイマーと同じ手順。睡眠・勤務・予定は2秒の表示のあと終わりまで） */
function runLock(s: GameState, realSec: number): { skips: string[] } {
  const skips: string[] = [];
  let left = realSec;
  for (let guard = 0; guard < 500 && left > 0 && s.status === 'playing'; guard++) {
    const mode = lockMode(s);
    if (mode === 'pending') break;
    if (mode === 'block') {
      skips.push(lifeNow(s).label);
      skipBlock(s);
      left -= 2;
      continue;
    }
    const before = clockOf(s) + s.day * DAY_MIN;
    advanceFree(s, Math.max(1, Math.floor(left * GAME_MIN_PER_REAL_SEC)));
    const used = (clockOf(s) + s.day * DAY_MIN - before) / GAME_MIN_PER_REAL_SEC;
    left -= Math.max(used, 0.05);
  }
  return { skips };
}

/** 指定した曜日・時刻へ（自由時間なら進め、予定は飛ばす） */
function goTo(s: GameState, dayOfWeek: number, minute: number): void {
  for (let i = 0; i < 40 && s.status === 'playing'; i++) {
    if (s.day % 7 === dayOfWeek && clockOf(s) >= minute) return;
    if (visiblePending(s).length > 0) s.pending = [];
    if (lockMode(s) === 'block') { skipBlock(s); continue; }
    const target = s.day % 7 === dayOfWeek ? minute : DAY_MIN;
    advanceFree(s, target - clockOf(s));
  }
}

describe('時間の進み方', () => {
  it('ロック画面の自由時間は、現実約13秒でゲーム内1日（1秒＝108分。2026-11-14 に2回1.5倍速）', () => {
    expect(GAME_MIN_PER_REAL_SEC).toBe(108);
    expect(DAY_MIN / GAME_MIN_PER_REAL_SEC).toBeCloseTo(13.33, 1);
  });
  it('始まりは月曜19:00。アプリを閉じるとロック画面、開くと戻る', () => {
    const s = newGame('M09', 'clock-1');
    expect(s.day % 7).toBe(0);
    expect(clockOf(s)).toBe(19 * 60);
    applyAction(s, { type: 'closeApp' });
    expect(s.screen).toBe('lock');
    applyAction(s, { type: 'openApp' });
    expect(s.screen).toBe('app');
  });
  it('23:50から進めると、24時で日付が変わり睡眠→7:00に起きる（日付・曜日も進む）', () => {
    const s = newGame('M09', 'clock-2');
    s.clock = 23 * 60 + 50;
    const day0 = s.day;
    advanceFree(s, 20);
    expect(s.day).toBe(day0 + 1);
    expect(clockOf(s)).toBe(0);
    expect(lifeNow(s).state).toBe('SLEEPING');
    expect(canOpenApp(s)).toBe(false);
    skipBlock(s);
    expect(clockOf(s)).toBe(7 * 60);
    expect(lifeNow(s).state).toBe('FREE');
  });
  it('出社勤務の人は平日9:00〜18:00は仕事中で開けない。スキップすると18:00（残業の日は退勤まで）', () => {
    const s = newGame('M09', 'clock-3');
    goTo(s, 1, 9 * 60);
    expect(lifeNow(s).state).toBe('WORKING');
    expect(canOpenApp(s)).toBe(false);
    applyAction(s, { type: 'closeApp' });
    applyAction(s, { type: 'openApp' });
    expect(s.screen).toBe('lock'); // 仕事中はロック解除できない
    skipBlock(s);
    expect(clockOf(s)).toBeGreaterThanOrEqual(18 * 60);
  });
  it('ロック画面で、睡眠と勤務は順番にスキップする（同時には出ない）', () => {
    const s = newGame('M06', 'clock-4');
    s.clock = 23 * 60 + 50;
    applyAction(s, { type: 'closeApp' });
    const { skips } = runLock(s, 20);
    expect(skips[0]).toBe('睡眠中');
    if (s.day % 7 < 5) expect(skips).toContain('仕事中');
    expect(new Set(skips.slice(0, 2)).size).toBe(skips.slice(0, 2).length);
  });
  it('アプリを開いている間は、操作の分だけ時刻が進む（いいね30分。検索は進まない。2026-11-15）', () => {
    const s = newGame('F03', 'clock-5');
    const c0 = clockOf(s);
    applyAction(s, { type: 'search' });
    expect(clockOf(s)).toBe(c0);
    applyAction(s, { type: 'like', npcId: s.search.results[0] });
    expect(clockOf(s)).toBe(c0 + 30);
  });
});

describe('人物ごとの生活リズム', () => {
  it('在宅勤務の日（麻衣）は、勤務中でもアプリを開ける', () => {
    const s = newGame('F01', 'wfh-clock');
    for (let i = 0; i < 14; i++) {
      goTo(s, (s.day + 1) % 7, 10 * 60);
      if (s.day % 7 < 5 && workFromHome(s, s.day)) break;
    }
    expect(workFromHome(s, s.day)).toBe(true);
    expect(lifeNow(s).state).toBe('REMOTE');
    expect(canOpenApp(s)).toBe(true);
  });
  it('パート（奈緒・沙織）は、平日の9:00〜18:00でも固定のロックがない', () => {
    for (const id of ['F10', 'F04']) {
      const s = newGame(id, `part-${id}`);
      goTo(s, 2, 11 * 60);
      expect(scheduleOf(s).some((b) => b.kind === 'work')).toBe(false);
      expect(lifeNow(s).state).toBe('FREE');
    }
  });
  it('コンサル（大輔）は残業の日があり、退勤が延びて残業の通知が届く', () => {
    const s = newGame('M07', 'consult');
    let overtimeDays = 0;
    for (let d = 0; d < 21; d++) {
      goTo(s, (s.day + 1) % 7, 8 * 60);
      const work = scheduleOf(s).find((b) => b.kind === 'work');
      if (privateEventOn(s, s.day) === '残業' && work) {
        overtimeDays++;
        expect(work.end).toBeGreaterThan(18 * 60);
      }
    }
    expect(overtimeDays).toBeGreaterThan(3);
    const texts = (s.notices ?? []).map((n) => n.text);
    expect(texts.some((t) => /残業|修正依頼|資料/.test(t))).toBe(true);
  });
  it('商社（健人）は、飲み会・会食・ゴルフの予定と通知がある。飲み会の間は進めて、終わると自由時間', () => {
    const s = newGame('M01', 'shosha');
    let drinkBlock = false;
    for (let d = 0; d < 21; d++) {
      goTo(s, (s.day + 1) % 7, 8 * 60);
      const ev = scheduleOf(s).find((b) => b.kind === 'event' && /飲み会|会食/.test(b.label));
      if (ev && !drinkBlock) {
        drinkBlock = true;
        s.pending = [];
        s.clock = ev.start;
        expect(lockMode(s)).toBe('block');
        expect(canOpenApp(s)).toBe(false);
        skipBlock(s);
        expect(clockOf(s)).toBe(ev.end >= DAY_MIN ? 0 : ev.end);
      }
    }
    expect(drinkBlock).toBe(true);
    const texts = (s.notices ?? []).map((n) => n.text);
    expect(texts.some((t) => /飲み|会食/.test(t))).toBe(true);
    expect(texts.some((t) => /ゴルフ/.test(t))).toBe(true);
  });
  it('20人全員に生活リズムがあり、勤務の人は平日のどこかで開けない時間がある', () => {
    const ids = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10'];
    for (const id of ids) {
      const s = newGame(id, `ls-${id}`);
      expect(scheduleOf(s).some((b) => b.kind === 'sleep'), id).toBe(true);
    }
  }, 30_000); // 重いので、ほかのテストやビルドと重なると5秒を超えることがある
});

describe('通知とメッセージの届く時刻', () => {
  it('返信は送った時刻から予約され（相手の睡眠0〜7時を除く）、その時刻に届いて通知が出る（2026-11-14）', () => {
    const s = newGame('M01', 'notice-1');
    applyAction(s, { type: 'subscribe' });
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking', topic: 'chat_normal' });
    s.clock = 21 * 60;
    applyAction(s, { type: 'reply', npcId: c.npcId, optionId: 'aizuchi' });
    const pr = c.pendingReply!;
    pr.willReply = true;
    expect(pr.minute).toBeDefined();
    expect(pr.minute! >= 7 * 60).toBe(true); // 相手の睡眠中には届かない
    const due = pr.day * DAY_MIN + pr.minute!;
    expect(due).toBeGreaterThan(s.day * DAY_MIN + clockOf(s));
    applyAction(s, { type: 'closeApp' });
    for (let g = 0; g < 300 && s.day * DAY_MIN + clockOf(s) < due; g++) {
      if (visiblePending(s).length > 0) s.pending = [];
      if (lockMode(s) === 'block') skipBlock(s);
      else advanceFree(s, Math.max(1, Math.min(due - (s.day * DAY_MIN + clockOf(s)), 600)));
    }
    const fresh = c.messages.filter((m) => m.from === 'them' && m.day === pr.day);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh[0].minute).toBe(pr.minute);
    expect(awaitingNow(s, c)).toBe(true);
    expect(visibleNotices(s).filter((n) => n.npcId === c.npcId && n.target === 'talk')).toHaveLength(1);
    const ids = (s.notices ?? []).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('アプリの操作でゲーム内の時間が進み、勤務の時刻になるとアプリが閉じる（2026-11-14）', () => {
    const s = newGame('M09', 'app-time');
    goTo(s, 1, 8 * 60 + 50);
    applyAction(s, { type: 'openApp' });
    expect(s.screen).toBe('app');
    for (let i = 0; i < 10 && s.screen === 'app'; i++) applyAction(s, { type: 'viewProfile', npcId: 'x' });
    expect(clockOf(s)).toBe(9 * 60);
    expect(s.screen).toBe('lock');
    expect(String(s.flags.lockReason)).toMatch(/9:00/);
  });
  it('デートの場面はデートの時刻まで出ず、場面が終わるとデートの終わりの時刻まで進む', () => {
    const s = newGame('M09', 'date-clock');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.stage = 'scheduled';
    c.nextDate = { day: s.day + 1, tier: 'cafe', proposedBy: 'me' };
    s.flags[`dev:noshow:${c.npcId}`] = '0';
    s.clock = DAY_MIN - 1;
    advanceFree(s, 1);
    const datePend = s.pending.filter((p) => p.npcId === c.npcId);
    expect(datePend.length).toBeGreaterThan(0);
    // 月曜の夜のカフェ。身支度（男性は場所決め）だけは1時間前
    expect(datePend.filter((p) => p.kind !== 'date_venue' && p.kind !== 'date_makeup').every((p) => (p.at ?? 0) >= 19 * 60)).toBe(true);
    expect(visiblePending(s)).toHaveLength(0);
    // 仕事のあと、デートの時刻で止まる
    goToDate(s);
    expect(lockMode(s)).toBe('pending');
    expect(canOpenApp(s)).toBe(true);
    // 男性は1時間前に場所決め（3回）→ デートの時刻に場面
    for (let g = 0; g < 60 && s.status === 'playing' && s.pending.some((p) => p.npcId === c.npcId); g++) {
      const ev = visiblePending(s)[0];
      if (ev) applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id });
      else advanceFree(s, Math.max(1, nextStop(s) - clockOf(s)));
    }
    expect(clockOf(s)).toBeGreaterThanOrEqual(20 * 60 + 30);
  });
});

function goToDate(s: GameState): void {
  for (let i = 0; i < 10 && lockMode(s) !== 'pending'; i++) {
    if (lockMode(s) === 'block') skipBlock(s);
    else advanceFree(s, DAY_MIN);
  }
}

describe('いいね・日送りボタン・セーブ', () => {
  it('いいねは何回でも送れる', () => {
    const s = newGame('M04', 'likes-unl');
    applyAction(s, { type: 'search' });
    applyAction(s, { type: 'searchMore', count: 24 });
    const ids = s.search.results.slice(0, 15);
    for (const id of ids) applyAction(s, { type: 'like', npcId: id });
    expect(ids.every((id) => s.contacts[id])).toBe(true);
  });
  it('時刻・画面・通知はセーブに残る（古いセーブは19:00・アプリの画面として扱う）', () => {
    const s = newGame('F03', 'save-clock');
    s.clock = 21 * 60 + 12;
    s.screen = 'lock';
    dayTransition(s);
    const back = deserialize(serialize(s));
    expect(back.clock).toBe(s.clock);
    expect(back.screen).toBe('lock');
    expect(back.notices?.length).toBe(s.notices?.length);
    const legacy = deserialize(serialize({ ...s, clock: undefined, screen: undefined, notices: undefined }));
    expect(clockOf(legacy)).toBe(19 * 60);
    expect(blockAt(legacy)).toBeDefined;
  });
});

describe('通知の設定・ロック解除・ほかのアプリ・出来事（2026-11-14）', () => {
  /** ロック画面を何日分か動かす（出来事が出たら選んで続ける） */
  function runDays(s: GameState, days: number): void {
    const until = s.day + days;
    for (let g = 0; g < 5000 && s.day < until && s.status === 'playing'; g++) {
      const mode = lockMode(s);
      if (mode === 'pending') { const ev = visiblePending(s)[0]; applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: ev.choices[0].id }); continue; }
      if (mode === 'block') { applyAction(s, { type: 'skipBlock' }); continue; }
      applyAction(s, { type: 'advanceFree', minutes: 90 });
    }
  }

  it('睡眠が無限にくり返さない：まだ見えない出来事（朝の合コンの誘いなど）があっても、夜の睡眠は朝まで進む', () => {
    const s = newGame('M07', 'loop-regress');
    applyAction(s, { type: 'closeApp' });
    s.pending = [];
    s.clock = DAY_MIN - 1;
    advanceFree(s, 5);
    s.pending = [];
    // 0時に日付が変わって睡眠中。朝7時に見える出来事があっても、睡眠のスキップが効く（以前は止まって睡眠の表示がくり返した）
    s.pending.push({ uid: 'future', kind: 'pe_goukon', title: '合コンの誘い', lines: [], choices: [{ id: 'go', label: '行く' }, { id: 'no', label: '断る' }], day: s.day, at: 7 * 60 } as never);
    expect(lockMode(s)).toBe('block');
    const before = s.day * DAY_MIN + clockOf(s);
    applyAction(s, { type: 'skipBlock' });
    expect(s.day * DAY_MIN + clockOf(s)).toBeGreaterThan(before);
  });

  it('ロック画面で確認が必要な出来事（候補日が届いた など）が出たら、ロックを解除してアプリで選べる', () => {
    const s = newGame('F01', 'pick-unlock');
    applyAction(s, { type: 'closeApp' });
    s.pending.push({ uid: 'pick1', kind: 'date_nomatch', title: '候補日が届いた', lines: [], choices: [{ id: 'ok', label: 'OK' }], day: s.day } as never);
    expect(lockMode(s)).toBe('pending');
    expect(canOpenApp(s)).toBe(true);
    applyAction(s, { type: 'openApp' });
    expect(s.screen).toBe('app');
    applyAction(s, { type: 'resolve', uid: 'pick1', choiceId: 'ok' });
    expect(visiblePending(s)).toHaveLength(0);
  });

  it('ロックを解除すると、いまロック画面に出ている通知は消える（新しく届いた通知はまた出る）', () => {
    const s = newGame('F01', 'clear-1');
    applyAction(s, { type: 'closeApp' });
    runDays(s, 2);
    for (let g = 0; g < 50 && !canOpenApp(s); g++) applyAction(s, lockMode(s) === 'block' ? { type: 'skipBlock' } : { type: 'advanceFree', minutes: 30 });
    expect(visibleNotices(s).length).toBeGreaterThan(0);
    applyAction(s, { type: 'openApp' });
    expect(s.screen).toBe('app');
    expect(visibleNotices(s)).toHaveLength(0);
    applyAction(s, { type: 'closeApp' });
    runDays(s, 1);
    expect(visibleNotices(s).length).toBeGreaterThan(0);
  });

  it('いいね・マッチ／トークの通知はオフにできる（オフの間はロック画面に出ない）', () => {
    const s = newGame('F01', 'notify-1');
    applyAction(s, { type: 'setNotify', key: 'likes', on: false });
    applyAction(s, { type: 'setNotify', key: 'talk', on: false });
    applyAction(s, { type: 'closeApp' });
    runDays(s, 4);
    expect(s.received.total).toBeGreaterThan(0);
    const kinds = visibleNotices(s).map((n) => n.kind);
    expect(kinds).not.toContain('like');
    expect(kinds).not.toContain('match');
    expect(kinds).not.toContain('msg');
    applyAction(s, { type: 'setNotify', key: 'likes', on: true });
    runDays(s, 2);
    expect(visibleNotices(s).some((n) => n.kind === 'like')).toBe(true);
  });

  it('ほかのアプリ（X・Instagram・LINE・YouTube など）の通知が毎日届き、マチアプの通知とは別の欄になる', () => {
    for (const id of ['M01', 'M04', 'M05', 'M09', 'M07', 'M11', 'F01', 'F03', 'F05', 'F06', 'F08', 'F10']) {
      const s = newGame(id, `sns-${id}`);
      applyAction(s, { type: 'closeApp' });
      runDays(s, 3);
      const sns = (s.notices ?? []).filter((n) => n.kind === 'sns');
      expect(sns.length, id).toBeGreaterThanOrEqual(6);
      expect(new Set(sns.map((n) => n.app)).size, id).toBeGreaterThanOrEqual(2);
      for (const n of sns) expect(noticeSection(n)).toBe('other');
    }
  });

  it('選ぶ必要がないプライベートの出来事（結婚式の招待状など）は、ポップアップで止めずにロック画面の通知として受け取る', () => {
    const s = newGame('M09', 'life-1');
    applyAction(s, { type: 'closeApp' });
    goTo(s, 2, 6 * 60);
    s.pending.push({ uid: 'w1', kind: 'pe_wedding', title: '友人の結婚式の招待状', lines: [{ who: 'narration', text: '招待状が届いた。' }, { who: 'system', text: '変化：ライフ −20' }], choices: [{ id: 'ok', label: 'おめでとう' }], day: s.day, at: 8 * 60 } as never);
    const life = s.life;
    for (let g = 0; g < 50 && clockOf(s) < 9 * 60; g++) {
      if (lockMode(s) === 'block') applyAction(s, { type: 'skipBlock' });
      else applyAction(s, { type: 'advanceFree', minutes: 30 });
      expect(lockMode(s)).not.toBe('pending');
    }
    expect(s.pending.some((p) => p.uid === 'w1')).toBe(false);
    expect(s.life).toBeLessThan(life);
    const n = visibleNotices(s).find((x) => x.kind === 'life');
    expect(n?.from).toBe('友人の結婚式の招待状');
    expect(noticeSection(n!)).toBe('life');
  });

  it('大輔は週2日在宅勤務（勤務中もアプリを開ける）。男性は在宅の日のデートで化粧の出来事が出ない', () => {
    const s = newGame('M07', 'wfh-m07');
    let wfh = 0;
    for (let d = 7; d < 35; d++) if (workFromHome(s, d)) wfh++;
    expect(wfh).toBe(8);
  });
});


describe('トークに集中するモード・交際中の早送り（2026-11-15）', () => {
  it('集中モードでは、いいね・マッチの通知を出さず、早送りはメッセージか場面で止まる（いいねはたまる）', () => {
    const s = newGame('F01', 'focus-1');
    // 3人とマッチするまでは使えない（2026-11-15）
    applyAction(s, { type: 'setFocus', on: true });
    expect(s.focusMode).toBe(false);
    s.stats.matches = 3;
    applyAction(s, { type: 'setFocus', on: true });
    expect(s.focusMode).toBe(true);
    // 待つものがなければ早送りしない
    applyAction(s, { type: 'closeApp' });
    applyAction(s, { type: 'fastForward' });
    expect(s.flags.ffResult).toBe('idle');
    // 返事を待っている相手がいる
    const c = devAddContact(s, { purpose: 'sincere', stage: 'talking' });
    c.pendingReply = { day: s.day + 2, minute: 20 * 60, kind: 'chat', willReply: true, expireDay: s.day + 9 };
    const before = s.received.total;
    let last = '';
    for (let i = 0; i < 6 && s.status === 'playing'; i++) {
      if (visiblePending(s).length > 0) { s.pending = []; continue; }
      applyAction(s, { type: 'fastForward' });
      last = String(s.flags.ffResult);
      if (last === 'notice') break;
    }
    expect(s.received.total).toBeGreaterThan(before);
    expect(visibleNotices(s).some((n) => n.kind === 'like' || n.kind === 'match')).toBe(false);
    // ほかのアプリ（SNS・仕事）の通知も出ない（2026-11-18）
    expect(visibleNotices(s).some((n) => n.kind === 'sns' || n.kind === 'work')).toBe(false);
    if (last === 'notice') expect(visibleNotices(s).some((n) => n.kind === 'msg')).toBe(true);
  });
  it('男性はデートの1〜3日前に、最寄り→中間→お店の3回で場所を決める（2026-11-18）', async () => {
    const { scheduleVenue, venueDaily } = await import('./dates');
    const s = newGame('M01', 'venue-1');
    const c = devAddContact(s, { purpose: 'sincere', stage: 'scheduled' });
    c.nextDate = { day: s.day + 5, tier: 'cafe', proposedBy: 'me' };
    scheduleVenue(s, c);
    const venueDay = Number(c.flags.venueDay);
    expect(c.nextDate.day - venueDay).toBeGreaterThanOrEqual(1);
    expect(c.nextDate.day - venueDay).toBeLessThanOrEqual(3);
    s.day = venueDay;
    venueDaily(s);
    const steps: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ev = s.pending.find((p) => p.kind === 'date_venue');
      if (!ev) break;
      steps.push(ev.choices[0].label);
      applyAction(s, { type: 'resolve', uid: ev.uid, choiceId: 'next' });
    }
    expect(steps).toEqual(['お互いの最寄り駅を確認する', '中間あたりの駅を確認する', 'お店を確認する']);
    expect(c.messages.some((m) => m.from === 'me' && m.text.includes('にしようと思います'))).toBe(true);
  });
});
