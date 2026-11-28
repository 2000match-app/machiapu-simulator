// いいね：「もらったいいね」と「送ったいいね」を切り替えて見る。
// もらったいいねは実際のアプリと同じく絞り込みはなく、スクロールすると続きが出てくる。
// 未確認のまま置いておいてもライフは減らない（受信件数と実際に対応した人数は別に記録）。
// 送ったいいねは「さがす」から消えた相手をここで確認できる（結果は確定日まで「反応待ち」）。
// あしあと（2026-11-28）：自分のプロフィールを見た相手。いいねを送った相手は高い確率でここに来る。ここからいいねできる。
import { useEffect, useState, type ReactNode } from 'react';
import { areaLabel } from '../engine/data/areas';
import type { Contact, GameState, Npc } from '../engine/types';
import type { TabProps } from './GameShell';
import { NpcProfile } from './SearchTab';
import { NpcAvatar, npcRevealTags } from './Avatar';
import { Sentinel, Sheet } from './common';
import { SwipeDeck } from './SwipeDeck';
import { incomeOf } from './format';
import { agoLabel, newFootprintCount, visibleFootprints } from '../engine/footprints';

type Box = 'received' | 'sent' | 'footprints';

function sentStatus(c: Contact): { label: string; tone: string } {
  if (c.stage === 'like_sent') return { label: '反応待ち', tone: 'wait' };
  if (c.stage === 'like_failed') return { label: 'マッチせず', tone: 'none' };
  if (c.stage === 'ended') return { label: 'マッチ（終了）', tone: 'none' };
  return { label: 'マッチ', tone: 'match' };
}

function sentLikes(state: GameState): { c: Contact; npc: Npc }[] {
  return Object.values(state.contacts)
    .filter((c) => c.sentLikeDay !== undefined && state.npcs[c.npcId])
    .sort((a, b) => b.sentLikeDay! - a.sentLikeDay!)
    .map((c) => ({ c, npc: state.npcs[c.npcId] }));
}

function SentList({ state, go, act }: Pick<TabProps, 'state' | 'go' | 'act'>) {
  const all = sentLikes(state);
  const [limit, setLimit] = useState(20);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? all.find((x) => x.npc.id === openId) : undefined;
  const waiting = all.filter((x) => x.c.stage === 'like_sent').length;
  return (
    <>
      <div className="likes-head">
        <span>送ったいいね <b>{all.length.toLocaleString()}</b>件</span>
        <span className="muted small">反応待ち {waiting}件</span>
      </div>
      {all.length === 0 && <p className="card muted">まだいいねを送っていません。「さがす」で右にスワイプすると送れます。</p>}
      <ul className="grid">
        {all.slice(0, limit).map(({ c, npc }) => {
          const st = sentStatus(c);
          return (
            <li key={npc.id} className="grid-card">
              <button className="gc-open" onClick={() => { setOpenId(npc.id); act({ type: 'viewProfile', npcId: npc.id }); }} aria-label={`${npc.name}のプロフィールを見る`}>
                <NpcAvatar npc={npc} size="xl" />
                <span className="gc-name">{npc.name}・{npc.age}歳</span>
                <span className="gc-sub">{areaLabel(npc.areaId)}</span>
                <span className="gc-sub gc-income">年収{incomeOf(npc)}</span>
                <span className="gc-sub">{c.sentLikeDay! + 1}日目に送信</span>
              </button>
              {st.tone === 'match' ? (
                <button className="btn small primary" onClick={() => go('talk', npc.id)}>マッチ・トークへ</button>
              ) : (
                <span className={`sent-status ${st.tone}`}>{st.label}</span>
              )}
            </li>
          );
        })}
      </ul>
      <Sentinel enabled={limit < all.length} deps={limit} onVisible={() => setLimit(limit + 20)} />
      {open && (
        <Sheet
          title={`${open.npc.name}さんのプロフィール`}
          onClose={() => setOpenId(null)}
          footer={sentStatus(open.c).tone === 'match'
            ? <button className="btn primary" onClick={() => { setOpenId(null); go('talk', open.npc.id); }}>トークへ</button>
            : <p className="muted small">{sentStatus(open.c).label}（{open.c.sentLikeDay! + 1}日目にいいね）</p>}
        >
          <NpcProfile npc={open.npc} />
        </Sheet>
      )}
    </>
  );
}

/** あしあと：自分のプロフィールを見た相手（新しい順） */
function FootprintList({ state, act, go }: TabProps) {
  const [limit, setLimit] = useState(20);
  const [openId, setOpenId] = useState<string | null>(null);
  const [seenAt] = useState(state.footprintsSeenAt ?? -1);
  const visitors = state.footprintVisitors ?? 0;
  // 開いたら既読にする。見ただけの人のプロフィールは、開いたときに少しずつ作る
  useEffect(() => { act({ type: 'seeFootprints' }); }, [act]);
  useEffect(() => {
    if (visitors > 0 && visibleFootprints(state).length < limit) act({ type: 'loadFootprints', count: 10 });
  }, [visitors, limit, act, state]);
  const list = visibleFootprints(state);
  const openNpc = openId ? state.npcs[openId] : undefined;
  const status = (npcId: string): ReactNode => {
    const c = state.contacts[npcId];
    if (c) {
      const st = sentStatus(c);
      return st.tone === 'match'
        ? <button className="btn small primary" onClick={() => go('talk', npcId)}>トークへ</button>
        : <span className={`sent-status ${st.tone}`}>{c.sentLikeDay !== undefined ? st.label : 'マッチ（終了）'}</span>;
    }
    if (state.received.queue.includes(npcId)) {
      return <button className="btn small like" onClick={() => act({ type: 'acceptReceived', npcId })}>♡ いいね返し</button>;
    }
    return <button className="btn small like" onClick={() => act({ type: 'like', npcId })}>♡ いいね</button>;
  };
  return (
    <>
      <div className="likes-head">
        <span>あしあと <b>{list.length.toLocaleString()}</b>件</span>
        <span className="muted small">あなたのプロフィールを見た人</span>
      </div>
      {list.length === 0 && visitors === 0 && <p className="card muted">まだあしあとはありません。いいねを送ると、相手が見に来ることがあります。</p>}
      <ul className="grid">
        {list.slice(0, limit).map((f) => {
          const npc = state.npcs[f.npcId];
          const isNew = f.day * 1440 + f.minute > seenAt;
          return (
            <li key={f.npcId} className="grid-card">
              <button className="gc-open" onClick={() => { setOpenId(npc.id); act({ type: 'viewProfile', npcId: npc.id }); }} aria-label={`${npc.name}のプロフィールを見る`}>
                <NpcAvatar npc={npc} size="xl" />
                <span className="gc-name">{npc.name}・{npc.age}歳{isNew && <i className="fp-new">NEW</i>}</span>
                <span className="gc-sub">{areaLabel(npc.areaId)}</span>
                <span className="gc-sub gc-income">年収{incomeOf(npc)}</span>
                <span className="gc-sub">{agoLabel(state, f)}</span>
              </button>
              {status(npc.id)}
            </li>
          );
        })}
      </ul>
      <Sentinel enabled={limit < list.length + visitors} deps={limit} onVisible={() => setLimit(limit + 20)} />
      {openNpc && (
        <Sheet title={`${openNpc.name}さんのプロフィール`} onClose={() => setOpenId(null)} footer={status(openNpc.id)}>
          <NpcProfile npc={openNpc} reveal={npcRevealTags(state, openNpc)} large />
        </Sheet>
      )}
    </>
  );
}

/** もらったいいねの表示（2026-11-16 指示：さがすと同じくスワイプでも選べる）。選んだ方をこの端末に覚えておく */
type RcvMode = 'swipe' | 'list';
const RCV_MODE_KEY = 'machiapu-sim:rcv-mode';
function loadRcvMode(): RcvMode {
  try { return localStorage.getItem(RCV_MODE_KEY) === 'list' ? 'list' : 'swipe'; } catch { return 'swipe'; }
}

function ReceivedList({ state, act, go }: TabProps) {
  const [matchedName, setMatchedName] = useState<string | null>(null);
  const [mode, setModeState] = useState<RcvMode>(loadRcvMode);
  const setMode = (m: RcvMode) => { setModeState(m); try { localStorage.setItem(RCV_MODE_KEY, m); } catch { /* 保存できなくても動く */ } };
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = state.received.queue.map((id) => state.npcs[id]).filter(Boolean);
  const hasMore = state.received.unseen > 0;
  const accept = (id: string) => { const n = state.npcs[id]; act({ type: 'acceptReceived', npcId: id }); if (n) setMatchedName(n.name); };
  const skip = (id: string) => act({ type: 'skipReceived', npcIds: [id] });
  const openNpc = openId ? state.npcs[openId] : undefined;

  // 開いた時に一覧が空なら最初の分を読み込む。スワイプでは残りが少なくなったら続きを読み込む
  useEffect(() => {
    if (state.received.queue.length <= (mode === 'swipe' ? 2 : 0) && state.received.unseen > 0) act({ type: 'loadReceived', count: 10, onlyMatching: false });
  }, [state.received.queue.length, state.received.unseen, act, mode]);

  return (
    <>
      <div className="likes-head">
        <span>届いたいいね <b>{state.received.total.toLocaleString()}</b>件</span>
        <span className="muted small">いいね返し {state.stats.receivedAccepted}人</span>
      </div>
      {matchedName && (
        <div className="toast good" role="status">
          {matchedName}さんとマッチしました。<button className="link" onClick={() => go('talk')}>トークへ</button>
          <button className="link" onClick={() => setMatchedName(null)} aria-label="閉じる">×</button>
        </div>
      )}
      {queue.length === 0 && !hasMore && <p className="card muted">まだいいねは届いていません。日を進めると届きます。</p>}
      {queue.length > 0 && (
        <div className="seg view-toggle" role="tablist" aria-label="表示の切り替え">
          <button role="tab" aria-selected={mode === 'swipe'} className={mode === 'swipe' ? 'on' : ''} onClick={() => setMode('swipe')}>フリック</button>
          <button role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>一覧</button>
        </div>
      )}
      {mode === 'swipe' && queue[0] && (
        <SwipeDeck
          top={queue[0]}
          next={queue[1]}
          canLike
          likeLabel="マッチ"
          skipLabel="見送る"
          onLike={accept}
          onSkip={skip}
          onOpen={(id) => { setOpenId(id); act({ type: 'viewProfile', npcId: id }); }}
          reveal={(n) => npcRevealTags(state, n)}
        />
      )}
      {openNpc && (
        <Sheet
          title={`${openNpc.name}さんのプロフィール`}
          onClose={() => setOpenId(null)}
          footer={(
            <div className="row cand-actions">
              <button className="btn ghost" onClick={() => { skip(openNpc.id); setOpenId(null); }}>見送る</button>
              <button className="btn like" onClick={() => { accept(openNpc.id); setOpenId(null); }}>♡ いいね返し（マッチ）</button>
            </div>
          )}
        >
          <NpcProfile npc={openNpc} reveal={npcRevealTags(state, openNpc)} large />
        </Sheet>
      )}
      {mode === 'list' && <ul className="cand-list">
        {queue.map((npc) => (
          <li key={npc.id} className="cand">
            <NpcProfile npc={npc} reveal={npcRevealTags(state, npc)} large />
            <div className="row cand-actions">
              <button className="btn ghost" onClick={() => act({ type: 'skipReceived', npcIds: [npc.id] })}>見送る</button>
              <button className="btn like" onClick={() => { act({ type: 'acceptReceived', npcId: npc.id }); setMatchedName(npc.name); }}>♡ いいね返し（マッチ）</button>
            </div>
          </li>
        ))}
      </ul>}
      {mode === 'list' && <Sentinel enabled={hasMore} deps={queue.length} onVisible={() => act({ type: 'loadReceived', count: 10, onlyMatching: false })} />}
      {!hasMore && queue.length > 0 && <p className="muted small center">届いているいいねはここまでです。</p>}
    </>
  );
}

export function LikesTab(props: TabProps) {
  const { state } = props;
  const [box, setBox] = useState<Box>('received');
  const sentCount = Object.values(state.contacts).filter((c) => c.sentLikeDay !== undefined).length;
  const fpNew = newFootprintCount(state);
  return (
    <div className="likes">
      <div className="seg talk-switch" role="tablist" aria-label="いいねの種類">
        <button role="tab" aria-selected={box === 'received'} className={box === 'received' ? 'on' : ''} onClick={() => setBox('received')}>
          もらったいいね{state.received.unseen > 0 && <i className="dot">{state.received.unseen > 99 ? '99+' : state.received.unseen}</i>}
        </button>
        <button role="tab" aria-selected={box === 'sent'} className={box === 'sent' ? 'on' : ''} onClick={() => setBox('sent')}>
          送ったいいね（{sentCount}）
        </button>
        <button role="tab" aria-selected={box === 'footprints'} className={box === 'footprints' ? 'on' : ''} onClick={() => setBox('footprints')}>
          あしあと{fpNew > 0 && box !== 'footprints' && <i className="dot">{fpNew > 99 ? '99+' : fpNew}</i>}
        </button>
      </div>
      {box === 'received' ? <ReceivedList {...props} /> : box === 'sent' ? <SentList state={state} go={props.go} act={props.act} /> : <FootprintList {...props} />}
    </div>
  );
}
