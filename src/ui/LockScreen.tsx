// スマホのロック画面（2026-11-13）。アプリを閉じている間はここで時間が進む。
// ・自由時間：現実約13秒＝ゲーム内1日（タイマー。タブが裏に回っている間は止める＝ずれ・二重加算をしない）
// ・睡眠・勤務・予定：約2秒の表示のあと、終わりの時刻まで一気に進める（表示中はタイマーを止める）
// ・確認が必要な出来事（デートの時刻など）が来たら時刻を止め、ロック解除をうながす
// ・操作できない時間帯は、ロック解除も通知からの起動もできない
// ・通知は「できごと」（結婚式の招待状などのプライベートの出来事）・「マチアプ」・「ほかのアプリ」（表示だけ）の欄に分ける。
//   ロックを解除すると、いま出ている通知は消える（2026-11-14）
import { useEffect, useRef, useState } from 'react';
import type { Action } from '../engine/actions';
import { GAME_MIN_PER_REAL_SEC, canOpenApp, clockOf, focusUnlocked, lifeNow, lockMode, noticeSection, skipMode, timeLabel, visibleNotices, visiblePending } from '../engine/clock';
import type { GameState, Notice } from '../engine/types';
import { dateLabel, weekdayLabel } from './format';
import type { Tab } from './GameShell';

type Popup = { icon: string; title: string; sub: string };

function popupOf(state: GameState): Popup {
  const now = lifeNow(state);
  const until = now.untilLabel ?? '';
  if (now.state === 'SLEEPING') return { icon: '🌙', title: '睡眠中...', sub: `${until}まで睡眠しています` };
  if (now.state === 'WORKING') return { icon: now.icon, title: `${now.label}...`, sub: `${until}まで仕事をしています` };
  if (now.label.includes('飲み会')) return { icon: now.icon, title: `${now.label}...`, sub: `${until}まで飲み会に参加しています` };
  return { icon: now.icon, title: `${now.label}...`, sub: `${until}まで${now.label.replace(/中$/, '')}の予定です` };
}

function targetOf(n: Notice): { tab: Tab; npcId?: string } {
  if (n.target === 'talk') return { tab: 'talk', npcId: n.npcId };
  if (n.target === 'likes') return { tab: 'likes' };
  if (n.target === 'date') return { tab: 'date' };
  return { tab: n.npcId ? 'talk' : 'search', npcId: n.npcId };
}

function whenOf(state: GameState, n: Notice): string {
  if (n.day === state.day) return clockOf(state) - n.minute < 10 ? '今' : timeLabel(n.minute);
  if (n.day === state.day - 1) return `昨日 ${timeLabel(n.minute)}`;
  return `${dateLabel(n.day)} ${timeLabel(n.minute)}`;
}

export function LockScreen({ state, act, onUnlock }: { state: GameState; act: (a: Action) => void; onUnlock: (to?: { tab: Tab; npcId?: string }) => void }) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const [popup, setPopup] = useState<Popup | null>(null);
  const popupOn = useRef(false);
  // 同じ表示（睡眠・勤務など）は2回目から短く（初回2秒、以降0.5秒。2026-11-14）
  const seenPopups = useRef(new Set<string>());
  const [showAll, setShowAll] = useState(false);
  const [showOther, setShowOther] = useState(false);
  // 通知やボタンに触れている間（とその直後）は時刻を止める。押そうとした瞬間に予定へ入って開けなくなるのを防ぐ
  const holdUntil = useRef(0);
  const hold = (ms = 1200) => { holdUntil.current = performance.now() + ms; };

  // 時間を進めるタイマー（1つだけ。アンマウントで止める）
  useEffect(() => {
    let last = performance.now();
    let carry = 0;
    let timer: number | undefined;
    const onVis = () => { last = performance.now(); carry = 0; };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1000, now - last); // 処理が詰まっても一度に大きく進めない
      last = now;
      if (document.hidden || popupOn.current || now < holdUntil.current) return;
      const s = stateRef.current;
      // 集中モード・交際中は下の早送りで進める。早送りが止まった後（メッセージが届いた・待つ相手がいない）は、ふつうの速さで進む（2026-11-16 指示）
      const ff = String(s.flags.ffResult ?? '');
      if (skipMode(s) !== 'normal' && ff !== 'notice' && ff !== 'idle') return;
      const mode = lockMode(s);
      if (mode === 'block') {
        popupOn.current = true;
        const pop = popupOf(s);
        const ms = seenPopups.current.has(pop.title) ? 500 : 2000;
        seenPopups.current.add(pop.title);
        setPopup(pop);
        timer = window.setTimeout(() => {
          act({ type: 'skipBlock' });
          popupOn.current = false;
          setPopup(null);
          last = performance.now();
          carry = 0;
        }, ms);
        return;
      }
      if (mode !== 'free') { carry = 0; return; }
      carry += (dt / 1000) * GAME_MIN_PER_REAL_SEC;
      const whole = Math.floor(carry);
      if (whole >= 1) {
        carry -= whole;
        act({ type: 'advanceFree', minutes: whole });
      }
    }, 250);
    return () => {
      window.clearInterval(id);
      if (timer) window.clearTimeout(timer);
      popupOn.current = false;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [act]);

  const mode = lockMode(state);
  const can = canOpenApp(state) || state.status !== 'playing';
  // 集中モード・交際中（2026-11-15）：仕事・睡眠・プライベートの出来事は飛ばし、メッセージ（交際中は恋人から）か場面が来るまで早送り
  const sm = skipMode(state);
  const ffResult = String(state.flags.ffResult ?? '');
  useEffect(() => {
    if (sm === 'normal' || state.status !== 'playing' || ffResult === 'notice' || ffResult === 'idle' || lockMode(state) === 'pending') return;
    const t = window.setTimeout(() => act({ type: 'fastForward' }), 900);
    return () => window.clearTimeout(t);
  }, [sm, ffResult, state.day, state.clock, state.status, act]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = lifeNow(state);
  const notices = visibleNotices(state);
  const life = notices.filter((n) => noticeSection(n) === 'life');
  const appN = notices.filter((n) => noticeSection(n) === 'app');
  const other = notices.filter((n) => noticeSection(n) === 'other');
  const unread = appN.filter((n) => !n.read).length;
  const list = showAll ? appN.slice(0, 60) : appN.slice(0, 4);
  const otherList = showOther ? other.slice(0, 40) : other.slice(0, 3);
  const pend = visiblePending(state);

  // 出来事の通知が届いたら、少しのあいだ時刻を止めて読めるようにする
  const seenLife = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seenLife.current) { seenLife.current = new Set(life.map((n) => n.id)); return; }
    const fresh = life.filter((n) => !seenLife.current!.has(n.id));
    if (fresh.length > 0) {
      fresh.forEach((n) => seenLife.current!.add(n.id));
      hold(3500);
    }
  });
  const unlockNote = state.status !== 'playing' ? '' : mode === 'pending' ? '確認が必要な出来事があります' : !can ? `${now.label}のため開けません（${now.untilLabel ?? ''}まで）` : '';

  const open = (to?: { tab: Tab; npcId?: string }) => {
    if (!can) return;
    onUnlock(to);
  };

  return (
    <div className="lock" aria-label="スマホのロック画面">
      <div className="lock-phone" onPointerDown={() => hold()} onPointerMove={(e) => { if ((e.target as HTMLElement).closest('button')) hold(600); }} onFocus={() => hold()}>
        <div className="lock-status" aria-hidden="true">
          <span>{timeLabel(clockOf(state))}</span>
          <span className="lock-icons">📶 Wi-Fi <span className="batt">🔋 {Math.max(12, 100 - Math.floor(clockOf(state) / 18))}%</span></span>
        </div>
        <div className="lock-top">
          <div className="lock-date">{dateLabel(state.day)}（{weekdayLabel(state.day)}）</div>
          <div className="lock-clock" aria-live="off">{timeLabel(clockOf(state))}</div>
          <div className={`lock-life st-${now.state.toLowerCase()}`}>
            <span aria-hidden="true">{now.icon}</span> {now.label}{now.untilLabel && now.state !== 'FREE' ? `（${now.untilLabel}まで）` : ''}
          </div>
          <div className="lock-hp">ライフ {state.life}/100</div>
          {state.flags.lockReason && <div className="lock-reason">{String(state.flags.lockReason)}</div>}
          {sm !== 'normal' && state.status === 'playing' && (
            <div className="lock-focus">
              <b>{sm === 'partner' ? '💕 交際中' : '💬 トークに集中モード'}</b>
              <span>{ffResult === 'idle' ? '返事を待っている相手がいないので、早送りを止めました（時間はふつうに進みます）' : ffResult === 'notice' ? (sm === 'partner' ? '恋人から連絡が届きました' : 'メッセージが届きました') : sm === 'partner' ? '恋人からの連絡か予定まで早送りしています' : 'メッセージが届くまで早送りしています（いいね・ほかのアプリの通知は出ません）'}</span>
              {sm === 'focus' && <button className="link" onClick={() => { hold(); act({ type: 'setFocus', on: false }); }}>集中モードをやめる</button>}
            </div>
          )}
        </div>

        {pend.length > 0 && (
          <button className="lock-alert" onClick={() => open()} disabled={!can}>
            <b>📌 {pend[0].title}</b>
            <span>ロックを解除して確認してください{pend.length > 1 ? `（ほか${pend.length - 1}件）` : ''}</span>
          </button>
        )}

        {life.length > 0 && (
          <div className="lock-sec" aria-label="できごと">
            {life.slice(0, 3).map((n) => (
              <div key={n.id} className="lock-card lock-life-card" role="note" aria-label={`${n.from}：${n.text}`}>
                <span className="lc-icon" aria-hidden="true">{n.icon}</span>
                <span className="lc-body">
                  <span className="lc-head"><b>できごと</b><small>{whenOf(state, n)}</small></span>
                  <span className="lc-from">{n.from}</span>
                  <span className="lc-text">{n.text}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="lock-notices" aria-label={`マチアプの通知 ${appN.length}件（未読${unread}件）`}>
          <h3 className="lock-sec-title">マチアプ</h3>
          {list.map((n) => (
            <button key={n.id} className={`lock-card${n.read ? '' : ' unread'}`} onClick={() => { act({ type: 'readNotices', ids: [n.id] }); open(targetOf(n)); }} disabled={!can}
              aria-label={`${n.app}・${n.from}：${n.text}`}>
              <span className="lc-icon" aria-hidden="true">{n.icon}</span>
              <span className="lc-body">
                <span className="lc-head"><b>{n.app}</b><small>{whenOf(state, n)}</small></span>
                <span className="lc-from">{n.from}</span>
                <span className="lc-text">{n.text}</span>
              </span>
            </button>
          ))}
          {appN.length > 4 && (
            <button className="link lock-more" onClick={() => setShowAll(!showAll)}>{showAll ? '閉じる' : `すべて見る（${appN.length}件）`}</button>
          )}
          {appN.length === 0 && <p className="lock-empty">マチアプの通知はありません</p>}

          {other.length > 0 && (
            <div className="lock-sec lock-other" aria-label={`ほかのアプリの通知 ${other.length}件`}>
              <h3 className="lock-sec-title">ほかのアプリ</h3>
              {otherList.map((n) => (
                <div key={n.id} className="lock-card static" aria-label={`${n.app}・${n.from}：${n.text}`}>
                  <span className="lc-icon" aria-hidden="true">{n.icon}</span>
                  <span className="lc-body">
                    <span className="lc-head"><b>{n.app}</b><small>{whenOf(state, n)}</small></span>
                    <span className="lc-from">{n.from}</span>
                    <span className="lc-text">{n.text}</span>
                  </span>
                </div>
              ))}
              {other.length > 3 && (
                <button className="link lock-more" onClick={() => setShowOther(!showOther)}>{showOther ? '閉じる' : `すべて見る（${other.length}件）`}</button>
              )}
            </div>
          )}
        </div>

        <div className="lock-bottom">
          {unlockNote && <p className="lock-note">{unlockNote}</p>}
          {state.status === 'playing' && mode !== 'pending' && (sm === 'normal' || ffResult === 'notice') && (
            <button className="lock-ff" onClick={() => { hold(400); act({ type: 'fastForward' }); }}>⏩ {sm === 'normal' ? '次の通知まで進める' : sm === 'partner' ? '次の連絡まで進める' : '次のメッセージまで進める'}</button>
          )}
          {state.status === 'playing' && sm === 'normal' && focusUnlocked(state) && (
            <button className="link lock-focus-on" onClick={() => { hold(); act({ type: 'setFocus', on: true }); }}>💬 トークに集中する（いいね・ほかのアプリの通知オフ・メッセージまで早送り）</button>
          )}
          <button className="lock-unlock" onClick={() => open()} disabled={!can}>{state.status !== 'playing' ? '結果を見る' : 'ロックを解除してマチアプを開く'}</button>
        </div>
      </div>

      {popup && (
        <div className="skip-pop" role="status" aria-live="polite">
          <div className="skip-card">
            <div className="skip-icon" aria-hidden="true">{popup.icon}</div>
            <b>{popup.title}</b>
            <span>{popup.sub}</span>
          </div>
        </div>
      )}
    </div>
  );
}
