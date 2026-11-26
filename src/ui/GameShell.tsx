// プレイ中の画面の骨組み：上部に状態と「1日すすめる」「1週間すすめる」を常に置き、下部タブで画面を切り替える。
// ホーム画面はなく、基本の画面は「さがす」。お知らせ（できごと・予定）は上部のベルから開く。
import { useEffect, useRef, useState } from 'react';
import { scrollToTop } from './scroll';
import type { Action } from '../engine/actions';
import { isAdvancing, isResting } from '../engine/advance';
import { awaitingNow, clockOf, focusUnlocked, lifeNow, timeLabel, visiblePending } from '../engine/clock';
import { SPEC_CLEAR_REL_DATES, TUNE_VENUES } from '../engine/data/rules';
import { character, isInRelationship } from '../engine/state';
import { monthBudget } from '../engine/life';
import { activeStatuses } from '../engine/privateEvents';
import type { GameState } from '../engine/types';
import { FilterSheet, SearchTab } from './SearchTab';
import { LikesTab } from './LikesTab';
import { TalkTab } from './TalkTab';
import { MyPageTab } from './MyPageTab';
import { DateTab } from './DateTab';
import { EventModal } from './EventModal';
import { Portrait } from './Avatar';
import { ResultScreen } from './ResultScreen';
import { HistoryPanel } from './HistoryPanel';
import { Sheet } from './common';
import { dateLabel, inDays, man, weekdayLabel } from './format';

export type Tab = 'search' | 'likes' | 'talk' | 'date' | 'me';

export interface TabProps {
  state: GameState;
  act: (a: Action) => void;
  go: (t: Tab, npcId?: string) => void;
}

/** ライフが減ること・回復すること（具体的な数字は出さない） */
const LIFE_DOWN = [
  'いいねを送っても反応がない、マッチしても会話が始まらない',
  'マッチも返信も会う予定もない週が続く',
  '返信が途絶える・既読無視・ブロック',
  '会ったあとに断られる、当日のドタキャン',
  '写真と違う人が来る、失礼な態度、高いお店をねだられる',
  '業者の勧誘・詐欺・サクラ・美人局などの被害',
  '一度にたくさんの人とやり取りする（比較疲れ）',
  '予算を超えてお金を使う',
  '探すのが長引く（月末の疲れ）、望んでいた期限を過ぎる',
  '交際中のすれ違い、別れ',
];

function LifeSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="ライフについて" onClose={onClose}>
      <p className="small">ライフが0になると「マチアプ疲れ」で終了です。交際を始めてから{SPEC_CLEAR_REL_DATES}回デートした時点で1以上残っていればクリア。</p>
      <h3 className="life-h down">減りやすいこと</h3>
      <ul className="life-list">{LIFE_DOWN.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3 className="life-h up">回復について</h3>
      <p className="small">ライフは回復しません。良い出来事があっても、減った分は戻りません。</p>
      <p className="muted small">実際に増えた・減った理由は、マイページ（PCでは右側）の「ライフの増減」で確認できます。</p>
    </Sheet>
  );
}

function TopBar({ state, act, onBell, onLife, unread }: { state: GameState; act: (a: Action) => void; onBell: () => void; onLife: () => void; unread: number }) {
  const budget = monthBudget(state);
  const ratio = state.monthSpend / budget;
  const statuses = activeStatuses(state);
  const lifeTone = state.life > 60 ? 'ok' : state.life > 30 ? 'mid' : 'low';
  const partner = state.partnerId ? state.contacts[state.partnerId] : undefined;
  const resting = isResting(state);
  const busy = visiblePending(state).length > 0;
  // トークに集中するモードへの誘導（2026-11-15）：やり取り中の相手がいるとき、閉じ方を選べるようにする
  const [chooseClose, setChooseClose] = useState(false);
  const talkingNow = Object.values(state.contacts).some((c) => ['matched', 'talking', 'scheduled', 'dating'].includes(c.stage));
  const inRel = !!partner && isInRelationship(state);
  const onClose = () => {
    if (!inRel && !state.focusMode && talkingNow && focusUnlocked(state)) setChooseClose(true);
    else act({ type: 'closeApp' });
  };
  return (
    <div className="status-bar">
      <div className="sb-row">
        <button className="life" onClick={onLife} aria-label={`ライフ ${state.life}/100。タップで減ること・回復することを見る`}>
          <span className="lbl">ライフ<i className="q" aria-hidden="true">?</i></span>
          <div className={`bar ${lifeTone}`}><i style={{ width: `${state.life}%` }} /></div>
          <b>{state.life}<small>/100</small></b>
        </button>
        <button className="bell" onClick={onBell} aria-label={`お知らせ${unread > 0 ? `（新着${unread}件）` : ''}`}>
          <span aria-hidden="true">🔔</span>{unread > 0 && <i className="dot">{unread > 99 ? '99+' : unread}</i>}
        </button>
      </div>
      {/* 日付・年齢・予算は大きく表示（2026-11-09 指示） */}
      <div className="meta-big">
        <div className="mb-cell">
          <b className="mb-date">{dateLabel(state.day)}<small>（{weekdayLabel(state.day)}）</small></b>
          <span>{state.day + 1}日目</span>
        </div>
        <div className="mb-cell">
          <b>{state.player.age}<small>歳</small></b>
          <span>年齢</span>
        </div>
        <div className={`mb-cell money ${ratio > 1 ? 'over' : ''}`}>
          <b>{man(state.monthSpend)}<small>／{man(budget)}</small></b>
          <span>支出／予算・あと{30 - (state.day % 30)}日</span>
        </div>
      </div>
      {((partner && isInRelationship(state)) || resting) && (
        <div className="meta">
          {partner && isInRelationship(state) && <span className="badge rel">交際後のデート {Number(partner.flags.relDates ?? 0)}/{SPEC_CLEAR_REL_DATES}回</span>}
          {resting && <span className="badge warn">休息中 あと{(state.restingUntil ?? state.day) - state.day}日</span>}
        </div>
      )}
      {statuses.length > 0 && (
        <div className="status-chips" aria-label="いま効いている出来事">
          {statuses.map((x) => <span key={x.label} className={`sc ${x.tone}`}>{x.label}</span>)}
        </div>
      )}
      {/* 時間はアプリを閉じたロック画面で進む（2026-11-13。「1日すすめる」「1週間すすめる」は廃止） */}
      <div className="advance-row clock-row">
        <span className="now-clock" aria-label={`いまの時刻 ${timeLabel(clockOf(state))}`}>
          <b>{timeLabel(clockOf(state))}</b><small>{lifeNow(state).icon} {lifeNow(state).label}</small>
        </span>
        <button className="btn adv primary" disabled={busy} onClick={onClose} title={busy ? '先に出来事を確認してください' : 'アプリを閉じると時間が進みます'}>アプリを閉じる</button>
      </div>
      {state.focusMode && !inRel && focusUnlocked(state) && (
        <p className="focus-note">💬 トークに集中モード中（いいね・ほかのアプリの通知オフ・メッセージまで早送り）<button className="link" onClick={() => act({ type: 'setFocus', on: false })}>やめる</button></p>
      )}
      {inRel && <p className="focus-note">💕 交際中：いいねの通知は出さず、恋人からの連絡まで早送りします</p>}
      {chooseClose && (
        <div className="close-choice" role="dialog" aria-label="アプリの閉じ方">
          <p className="small">やり取り中の相手がいます。どう閉じますか？</p>
          <button className="btn primary" onClick={() => { setChooseClose(false); act({ type: 'setFocus', on: true }); act({ type: 'closeApp' }); }}>
            💬 トークに集中して閉じる<small>いいねの通知を止め、メッセージが届くまで早送り（いいねはたまっていく）</small>
          </button>
          <button className="btn ghost" onClick={() => { setChooseClose(false); act({ type: 'closeApp' }); }}>ふつうに閉じる</button>
          <button className="link small" onClick={() => setChooseClose(false)}>閉じない</button>
        </div>
      )}
    </div>
  );
}

function NewsSheet({ state, onClose, go }: { state: GameState; onClose: () => void; go: (t: Tab, npcId?: string) => void }) {
  const dates = Object.values(state.contacts).filter((c) => c.nextDate).sort((a, b) => a.nextDate!.day - b.nextDate!.day);
  const feed = [...state.feed].reverse().slice(0, 40);
  return (
    <Sheet title="お知らせ" onClose={onClose}>
      {dates.length > 0 && (
        <>
          <h3>予定</h3>
          <ul className="plans">
            {dates.map((c) => {
              const npc = state.npcs[c.npcId];
              return (
                <li key={c.npcId}>
                  <button className="link" onClick={() => { onClose(); go('talk', c.npcId); }}>
                    {inDays(c.nextDate!.day - state.day)}（{weekdayLabel(c.nextDate!.day)}）{npc.name}と{TUNE_VENUES[c.nextDate!.tier].label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h3>できごと</h3>
      <ul className="feed-list">
        {feed.map((f, i) => (
          <li key={`${f.day}-${i}`} className={`tone-${f.tone ?? 'neutral'}`}>
            <span className="day">{f.day}日目</span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function GameShell({ state, act, onQuit, onRestart, nav }: { state: GameState; act: (a: Action) => void; onQuit: () => void; onRestart: () => void; nav?: { tab: Tab; npcId?: string } }) {
  // ロック画面の通知から開いたときは、その画面から（2026-11-13）
  const [tab, setTab] = useState<Tab>(nav?.tab ?? 'search');
  const [openNpc, setOpenNpc] = useState<string | undefined>(nav?.npcId);
  const [newsOpen, setNewsOpen] = useState(false);
  const [lifeOpen, setLifeOpen] = useState(false);
  const seenFeed = useRef(state.feed.length);
  const toastFrom = useRef(state.feed.length);
  const snap = useRef({ received: state.received.total, matches: state.stats.matches, life: state.life, days: state.day });
  const [toast, setToast] = useState<{ day: number; items: string[]; chips: string[] } | null>(null);
  const prevDay = useRef(state.day);
  const go = (t: Tab, npcId?: string) => {
    setTab(t);
    setOpenNpc(npcId);
    scrollToTop();
  };
  const ch = character(state);

  // 日が進んだら、その間のできごとを短く知らせる
  useEffect(() => {
    if (state.day !== prevDay.current && !isAdvancing(state) && state.pending.length === 0) {
      const fresh = state.feed.slice(toastFrom.current).map((f) => f.text);
      toastFrom.current = state.feed.length;
      const s0 = snap.current;
      const chips: string[] = [`${state.day - s0.days}日経過`];
      if (state.received.total > s0.received) chips.push(`いいね +${state.received.total - s0.received}`);
      if (state.stats.matches > s0.matches) chips.push(`マッチ +${state.stats.matches - s0.matches}`);
      if (state.life !== s0.life) chips.push(`ライフ ${state.life > s0.life ? '+' : ''}${state.life - s0.life}`);
      snap.current = { received: state.received.total, matches: state.stats.matches, life: state.life, days: state.day };
      setToast({ day: state.day, items: fresh, chips });
      prevDay.current = state.day;
    }
  }, [state.day, state.feed, state]);

  if (state.status !== 'playing' && state.result) {
    return <ResultScreen state={state} onQuit={onQuit} onRestart={onRestart} />;
  }

  const unread = state.feed.length - seenFeed.current;
  const talkBadge = Object.values(state.contacts).filter((c) => (awaitingNow(state, c) && c.stage !== 'ended') || (c.stage === 'matched' && c.firstMessageSentDay === undefined && !c.awaitingMe)).length;
  const dateBadge = Object.values(state.contacts).filter((c) => c.nextDate && c.nextDate.day - state.day <= 7).length;
  const props: TabProps = { state, act, go };
  // 交際を始めてほかの相手とのやり取りを終えたら、交際中は「さがす」「いいね」を使わない
  const locked = isInRelationship(state) && !!state.flags.closedOthers;
  const shownTab: Tab = locked && (tab === 'search' || tab === 'likes') ? 'talk' : tab;
  const partner = isInRelationship(state) && state.partnerId ? state.contacts[state.partnerId] : undefined;
  const relDays = partner?.relationship ? state.day - partner.relationship.startDay : 0;

  return (
    <div className="game">
      <div className="app-col">
        <header className="app-header">
          <div className="who">
            <b>{ch.name}</b>
            <span>{ch.gender === 'M' ? '男性' : '女性'}・{ch.job}</span>
          </div>
          <button className="link" onClick={onQuit} aria-label="タイトルへ戻る（自動保存されます）">タイトルへ</button>
        </header>
        <TopBar state={state} act={act} unread={Math.max(0, unread)} onLife={() => setLifeOpen(true)} onBell={() => { setNewsOpen(true); seenFeed.current = state.feed.length; setToast(null); }} />
        {partner && (
          <button className="rel-banner" onClick={() => go('talk', partner.npcId)}>
            <span className="rb-tag">交際中</span>
            <span className="rb-main"><b>{state.npcs[partner.npcId].name}</b>さんと交際{relDays}日目</span>
            <span className="rb-goal">交際後のデート{SPEC_CLEAR_REL_DATES}回でクリア・あと{Math.max(0, SPEC_CLEAR_REL_DATES - Number(partner.flags.relDates ?? 0))}回</span>
            <span className="rb-note">ほかの人とのトークも続けられます（知られると関係に影響することがあります）</span>
          </button>
        )}
        {state.flags.dataVersionMismatch && <p className="warn-line">セーブデータのデータ版が異なります（{String(state.flags.dataVersionMismatch)}）。</p>}
        {toast && (
          <div className="toast" role="status">
            <div className="toast-head">
              <b>{dateLabel(toast.day)}（{weekdayLabel(toast.day)}）になりました</b>
              <button className="link" onClick={() => { setToast(null); seenFeed.current = state.feed.length; }} aria-label="閉じる">×</button>
            </div>
            <div className="chips">{toast.chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>
            {toast.items.length === 0 ? <p className="small muted">ほかに新しいできごとはありませんでした。</p> : (
              <ul>
                {toast.items.slice(-4).map((t, i) => <li key={i} className="small">{t}</li>)}
              </ul>
            )}
            {toast.items.length > 4 && <button className="link small" onClick={() => { setNewsOpen(true); seenFeed.current = state.feed.length; setToast(null); }}>ほか{toast.items.length - 4}件を見る</button>}
          </div>
        )}
        <main className="tab-body">
          {locked && (tab === 'search' || tab === 'likes') && <p className="warn-line">交際中のため「さがす」「いいね」は使いません。ほかの相手とのやり取りは終えました。</p>}
          {shownTab === 'search' && <SearchTab {...props} />}
          {shownTab === 'likes' && <LikesTab {...props} />}
          {shownTab === 'talk' && <TalkTab {...props} openNpc={openNpc} setOpenNpc={setOpenNpc} />}
          {tab === 'date' && <DateTab {...props} />}
          {tab === 'me' && <MyPageTab {...props} />}
        </main>
        <nav className="tabbar" aria-label="メニュー">
          {([
            ['search', 'さがす', '⌕'],
            ['likes', 'いいね', '♡'],
            ['talk', 'トーク', '✉'],
            ['date', 'デート', '📅'],
            ['me', 'マイページ', '☺'],
          ] as [Tab, string, string][]).map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}
              disabled={locked && (k === 'search' || k === 'likes')} title={locked && (k === 'search' || k === 'likes') ? '交際中のため使いません' : undefined}>
              <span className="ico" aria-hidden="true">{icon}</span>
              <span>{label}</span>
              {k === 'likes' && state.received.unseen > 0 && <i className="dot">{state.received.unseen > 99 ? '99+' : state.received.unseen}</i>}
              {k === 'talk' && talkBadge > 0 && <i className="dot">{talkBadge}</i>}
              {k === 'date' && dateBadge > 0 && <i className="dot">{dateBadge}</i>}
            </button>
          ))}
        </nav>
      </div>
      <aside className="side-col" aria-label="ライフと支出の履歴">
        <HistoryPanel state={state} />
      </aside>
      {newsOpen && <NewsSheet state={state} go={go} onClose={() => setNewsOpen(false)} />}
      {lifeOpen && <LifeSheet onClose={() => setLifeOpen(false)} />}
      {!state.flags.prologueSeen && state.day === 0 && character(state).prologue
        ? <Prologue state={state} onClose={() => act({ type: 'closePrologue' })} />
        : !state.flags.startPrefsSet && state.day === 0
          // 開始時に検索条件を選ぶ（2026-11-09 指示）。初期値はその人物の初期条件。閉じたときもそのまま始める
          ? <FilterSheet
            state={state}
            title="最初の検索条件"
            applyLabel="この条件ではじめる"
            lead="さがす画面で表示する相手の条件です。あとから「さがす」の絞り込みでいつでも変えられます。"
            onClose={() => act({ type: 'setStartPrefs', prefs: state.player.prefs })}
            onApply={(p) => act({ type: 'setStartPrefs', prefs: p })}
          />
          : visiblePending(state).length > 0 && <EventModal state={state} act={act} />}
    </div>
  );
}

/** 開始時のプロローグ：その人物がアプリを始めた事情（2026-11-07 指示） */
function Prologue({ state, onClose }: { state: GameState; onClose: () => void }) {
  const ch = character(state);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
      <div className="modal prologue">
        <div className="pro-head">
          <Portrait id={ch.id} gender={ch.gender} className="pro-portrait" />
          <div>
            <div className="muted small">プロローグ</div>
            <h2 id="prologue-title">{ch.name}（{ch.age}）</h2>
            <div className="small muted">{ch.job}</div>
          </div>
        </div>
        <div className="pro-text">
          {ch.prologue!.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <button className="btn primary pro-start" onClick={onClose} autoFocus>はじめる</button>
      </div>
    </div>
  );
}
