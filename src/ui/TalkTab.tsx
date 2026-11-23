// トーク：アプリ内のやり取りと、LINE・外部サイトへ移ったやり取りを1つの一覧に、最新のやり取り順で並べる。
// 場所は行の背景色（LINE＝緑、外部サイト＝紫）と小さな札で見分ける。
// 男性はアプリ内でメッセージを送るのに有料会員（30日4,000円）が必要。返事が来なくても返金はない。
import { useEffect, useRef, useState } from 'react';
import { PLAYER_FACE } from '../engine/data/faceReveal';
import { Hensachi } from './preview';
import type { Action } from '../engine/actions';
import { SITE_MESSAGE_YEN, SITE_NAME, firstMessageOptions, needsMembership, replyOptions } from '../engine/chat';
import { channelOf } from '../engine/contact';
import { talkMenu } from '../engine/conversation';
import { awaitingNow, visibleMessages } from '../engine/clock';
import { isMember, memberFee, monthBudget } from '../engine/life';
import { unavailableReason } from '../engine/privateEvents';
import type { Channel, Contact, GameState } from '../engine/types';
import type { TabProps } from './GameShell';
import { NpcAvatar, npcPhotoLabel, npcPhotoUrl, npcRevealTags } from './Avatar';
import { NpcProfile } from './SearchTab';
import { Sheet } from './common';
import { contactStatus, inDays, man } from './format';

/** 最後にやり取りした日（メッセージがなければマッチした日） */
function lastActivity(c: Contact): number {
  return c.messages.at(-1)?.day ?? c.matchedDay ?? c.createdDay;
}

export function TalkTab({ state, act, openNpc, setOpenNpc }: TabProps & { openNpc?: string; setOpenNpc: (id?: string) => void }) {
  const [showEnded, setShowEnded] = useState(false);
  const all = Object.values(state.contacts).filter((c) => c.stage !== 'like_sent' && c.stage !== 'like_failed');
  const newest = (a: Contact, b: Contact) => lastActivity(b) - lastActivity(a) || (b.matchedDay ?? 0) - (a.matchedDay ?? 0);
  const list = all.filter((c) => c.stage !== 'ended').sort(newest);
  const ended = all.filter((c) => c.stage === 'ended').sort((a, b) => (b.endedDay ?? 0) - (a.endedDay ?? 0));
  const hasOutside = list.some((c) => channelOf(c) !== 'app');

  if (openNpc && state.contacts[openNpc]) {
    return <ChatView state={state} act={act} contact={state.contacts[openNpc]} onBack={() => setOpenNpc(undefined)} />;
  }
  return (
    <div className="talk">
      <MemberNote state={state} act={act} />
      {hasOutside && (
        <p className="ch-legend small" aria-label="背景色の見方">
          <span className="lg app">アプリ</span><span className="lg line">LINE</span><span className="lg external">外部サイト</span>
        </p>
      )}
      {list.length === 0 && <p className="card muted">まだトークはありません。「さがす」でいいねを送るか、「いいね」から返してみましょう。</p>}
      <ul className="talk-list">
        {list.map((c) => <TalkRow key={c.npcId} state={state} act={act} c={c} onOpen={() => setOpenNpc(c.npcId)} />)}
      </ul>
      {ended.length > 0 && (
        <div className="ended">
          <button className="link" onClick={() => setShowEnded(!showEnded)}>{showEnded ? '終了したトークを隠す' : `終了したトーク（${ended.length}）`}</button>
          {showEnded && <ul className="talk-list dim">{ended.map((c) => <TalkRow key={c.npcId} state={state} c={c} onOpen={() => setOpenNpc(c.npcId)} />)}</ul>}
        </div>
      )}
    </div>
  );
}

/** 男性の有料会員の状態 */
function MemberNote({ state, act }: { state: GameState; act: (a: Action) => void }) {
  if (state.gender !== 'M') return null;
  const until = state.player.memberUntil;
  if (isMember(state)) return <p className="member-note small">有料会員：あと{(until ?? state.day) - state.day}日（{(until ?? 0)}日目まで）</p>;
  return (
    <p className="member-note small off">
      有料会員ではありません。アプリ内でメッセージを送るには加入が必要です（LINE・外部サイトは不要）。
      <button className="link" onClick={() => act({ type: 'subscribe' })}>{memberFee(state).toLocaleString()}円で加入する</button>
    </p>
  );
}

/** 左にこの幅以上スワイプしたら非表示 */
const HIDE_SWIPE_PX = 90;

function TalkRow({ state, act, c, onOpen }: { state: GameState; act?: (a: Action) => void; c: Contact; onOpen: () => void }) {
  const npc = state.npcs[c.npcId];
  const st = contactStatus(state, c);
  const ch = channelOf(c);
  const vis = visibleMessages(state, c);
  const last = [...vis].reverse().find((m) => m.from !== 'system') ?? vis.at(-1);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  // 一覧から1回で：相槌だけ返す・非表示（2026-11-06 指示）
  const canAizuchi = !!act && awaitingNow(state, c) && ch !== 'external' && !needsMembership(state, c) && !unavailableReason(state)
    && replyOptions(state, c).some((o) => o.id === 'aizuchi');
  const canHide = !!act && c.stage !== 'ended' && c.stage !== 'relationship';
  const hide = () => act?.({ type: 'hideContact', npcId: c.npcId });
  return (
    <li className="tr-li">
      {canHide && <span className="tr-swipe-bg" aria-hidden="true">非表示</span>}
      <div
        className="tr-wrap"
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={canHide ? (e) => { start.current = { x: e.clientX, y: e.clientY }; } : undefined}
        onPointerMove={canHide ? (e) => {
          if (!start.current) return;
          const mx = e.clientX - start.current.x;
          if (Math.abs(e.clientY - start.current.y) > 30) { start.current = null; setDx(0); return; }
          setDx(Math.min(0, mx));
        } : undefined}
        onPointerUp={canHide ? () => { if (dx < -HIDE_SWIPE_PX) hide(); start.current = null; setDx(0); } : undefined}
        onPointerCancel={() => { start.current = null; setDx(0); }}
      >
      <button className={`talk-row ch-${ch}`} onClick={() => { if (dx === 0) onOpen(); }} data-npc={c.npcId}>
        <NpcAvatar npc={npc} size="lg" />
        <span className="tr-main">
          <span className="tr-top">
            <b>{npc.name}（{npc.age}）</b>
            {ch !== 'app' && <span className={`ch-tag ${ch}`}>{ch === 'line' ? 'LINE' : SITE_NAME}</span>}
            <span className={`st st-${st.tone}`}>{st.label}</span>
          </span>
          <span className="tr-last">{last ? last.text : 'マッチしました'}</span>
        </span>
      </button>
      {(canAizuchi || canHide) && (
        <span className="tr-actions">
          {canAizuchi && <button className="tr-btn" onClick={() => act!({ type: 'reply', npcId: c.npcId, optionId: 'aizuchi' })} aria-label={`${npc.name}に相槌だけ返す`}>相槌</button>}
          {canHide && <button className="tr-btn ghost" onClick={hide} aria-label={`${npc.name}とのトークを非表示にする`}>非表示</button>}
        </span>
      )}
      </div>
    </li>
  );
}

const CHANNEL_HEAD: Record<Channel, string> = {
  app: 'アプリのトーク',
  line: 'LINE',
  external: `外部サイト「${SITE_NAME}」（1通${SITE_MESSAGE_YEN}円分のポイント）`,
};

function ChatView({ state, act, contact: c, onBack }: Pick<TabProps, 'state' | 'act'> & { contact: Contact; onBack: () => void }) {
  const npc = state.npcs[c.npcId];
  const [showProfile, setShowProfile] = useState(false);
  const [confirmBreakup, setConfirmBreakup] = useState(false);
  const [paywall, setPaywall] = useState<Action | null>(null);
  // 会う前の会話（2026-11-11）：答え方を選んだ後の2段目と、質問を選ぶプロフィール画面
  const [draft, setDraft] = useState<'ans_d' | 'ans_c' | null>(null);
  const [askFrom, setAskFrom] = useState<'talk' | 'answer' | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmFace, setConfirmFace] = useState(false);
  useEffect(() => { setDraft(null); setAskFrom(null); setConfirmBlock(false); setConfirmFace(false); }, [c.messages.length, c.npcId]);
  useEffect(() => { setShowProfile(false); }, [c.npcId]);
  const bottom = useRef<HTMLDivElement>(null);
  // トークの見出し（名前・プロフィール）は、上のステータス欄の真下に固定する（2026-11-23 指示：一番上まで戻らないとプロフィールが出なかった）
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.status-bar');
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty('--sb-h', `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // 新しいブラウザでは scrollIntoView が Promise を返すため、戻り値を useEffect から返さない
    void bottom.current?.scrollIntoView({ block: 'end' });
  }, [c.messages.length]);
  const st = contactStatus(state, c);
  const channel = channelOf(c);
  const canFirst = c.stage === 'matched' && c.firstMessageSentDay === undefined && !c.awaitingMe;
  // 相手のメッセージが届く時刻までは、返事をする番にならない（2026-11-13）
  const awaiting = awaitingNow(state, c);
  const shown = visibleMessages(state, c);
  const options = awaiting ? replyOptions(state, c) : [];
  const waitingDays = shown.length ? state.day - shown[shown.length - 1].day : 0;
  const invites = options.filter((o) => o.id.startsWith('invite_'));
  const others = options.filter((o) => !o.id.startsWith('invite_'));
  /** 送る操作：男性で未加入なら、先に有料会員の画面を出す */
  const send = (a: Action) => {
    if (needsMembership(state, c)) setPaywall(a);
    else act(a);
  };
  const spentOnThem = c.spentYen;

  return (
    <div className={`chat ch-${channel}`}>
      <div className="chat-head">
        <button className="link" onClick={onBack} aria-label="トーク一覧へ戻る">‹ 戻る</button>
        {/* 名前・アイコンか「プロフィール」で、いつでも相手のプロフィールを開ける（2026-11-19 指示） */}
        <button className="ch-who" onClick={() => setShowProfile(true)} aria-label={`${npc.name}さんのプロフィールを見る`}>
          <NpcAvatar npc={npc} size="sm" />
          <span><b>{npc.name}（{npc.age}）</b><Hensachi of={npc} /><small>{npcPhotoLabel(npc)}</small></span>
        </button>
        <span className="ch-head-side">
          <span className={`st st-${st.tone}`}>{st.label}</span>
          <button className="ch-profile" onClick={() => setShowProfile(true)}><span aria-hidden="true">👤</span>プロフィール</button>
        </span>
      </div>
      <div className={`channel-bar ${channel}`}>{CHANNEL_HEAD[channel]}{channel === 'external' && spentOnThem > 0 ? `・ここまでのポイント ${Number(c.flags.sakuraPaid ?? 0).toLocaleString()}円` : ''}</div>
      {showProfile && (
        <Sheet title={`${npc.name}さんのプロフィール`} onClose={() => setShowProfile(false)}>
          <NpcProfile npc={npc} reveal={npcRevealTags(state, npc)} large />
        </Sheet>
      )}
      <div className="messages" role="log" aria-live="polite">
        {shown.map((m, i) => (
          <div key={i} className={`msg ${m.from} ${m.channel ?? 'app'}`}>
            {m.from === 'system' ? <span className="sys">{m.text}</span> : (
              <>
                <span className="bubble">
                  {m.image && <img className="bubble-img" src={npcPhotoUrl(m.image)} alt="送った写真" draggable={false} />}
                  {m.text}
                </span>
                <span className="meta">{m.day + 1}日目</span>
              </>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {c.stage !== 'ended' && (
        <div className="composer">
          {unavailableReason(state) && (canFirst || awaiting) && <p className="warn-line small">今日は{unavailableReason(state)}ため、メッセージを送れません。</p>}
          {canFirst && !unavailableReason(state) && (
            <>
              <p className="muted small">最初のメッセージを選んでください。{needsMembership(state, c) ? '（送るには有料会員が必要です）' : ''}</p>
              {firstMessageOptions().map((o) => (
                <button key={o.id} className="btn choice" onClick={() => send({ type: 'firstMessage', npcId: c.npcId, optionId: o.id })}>{o.label}</button>
              ))}
            </>
          )}
          {awaiting && !unavailableReason(state) && (
            <>
              {draft ? (
                <AnswerStep state={state} contact={c} draft={draft} onBack={() => setDraft(null)}
                  onSend={(optionId) => send({ type: 'reply', npcId: c.npcId, optionId })} onAsk={() => setAskFrom('answer')} />
              ) : others.map((o) => {
                const reply = () => send({ type: 'reply', npcId: c.npcId, optionId: o.id });
                const click = o.id === 'ans_d' || o.id === 'ans_c' ? () => setDraft(o.id as 'ans_d' | 'ans_c')
                  : o.id === 'profile_q' ? () => setAskFrom('talk')
                  : o.id === 'block' ? () => setConfirmBlock(true)
                  : o.id === 'publish' ? () => setConfirmFace(true)
                  : reply;
                const preview = ['aizuchi', 'ans_d', 'ans_c'].includes(o.id);
                return (
                  <button key={o.id} className={`btn choice${preview ? ' with-preview' : ''}`} onClick={click}>
                    {o.label}{o.sub && (preview ? <small className="msg-preview">「{o.sub}」</small> : <small>{o.sub}</small>)}
                  </button>
                );
              })}
              {confirmFace && (
                <div className="confirm-face" role="dialog" aria-label="顔写真を載せる確認">
                  <p className="small"><b>本当に顔を出しますか？</b>この写真をプロフィールに載せます。公開すると元に戻せません。</p>
                  {PLAYER_FACE[state.characterId] && <img className="confirm-face-img" src={`${import.meta.env.BASE_URL}npc/${PLAYER_FACE[state.characterId]}`} alt="載せる顔写真" />}
                  <div className="row">
                    <button className="btn primary small" onClick={() => { setConfirmFace(false); send({ type: 'reply', npcId: c.npcId, optionId: 'publish' }); }}>顔を出す</button>
                    <button className="btn ghost small" onClick={() => setConfirmFace(false)}>やめる</button>
                  </div>
                </div>
              )}
              {confirmBlock && (
                <div className="confirm-row">
                  <span className="small">{npc.name}をブロックしますか？（やり取りは終わります）</span>
                  <button className="btn danger small" onClick={() => send({ type: 'reply', npcId: c.npcId, optionId: 'block' })}>ブロックする</button>
                  <button className="btn ghost small" onClick={() => setConfirmBlock(false)}>やめる</button>
                </div>
              )}
              {invites.length > 0 && (
                <div className="invite-row">
                  <span className="muted small">デートに誘う：</span>
                  {invites.map((o) => (
                    <button key={o.id} className="btn small invite" onClick={() => send({ type: 'reply', npcId: c.npcId, optionId: o.id })}>{o.label.replace('デートに誘う：', '')}{o.sub && <small>{o.sub}</small>}</button>
                  ))}
                </div>
              )}
            </>
          )}
          {!canFirst && !awaiting && c.stage !== 'relationship' && (
            <div className="waiting">
              <span className="muted small">
                {c.nextDate ? `${inDays(c.nextDate.day - state.day)}会う予定です。` : `相手の返事を待っています（最後のやり取りから${waitingDays}日）。返事は時間が進むと届きます（アプリを閉じると、ロック画面で時間が進みます）。`}
              </span>
              {!c.nextDate && c.firstMessageSentDay !== undefined && channel !== 'external' && (
                <button className="btn ghost small" onClick={() => send({ type: 'followUp', npcId: c.npcId })}>もう一度送る</button>
              )}
            </div>
          )}
          {c.stage === 'relationship' && !awaiting && <p className="muted small">交際中の出来事は、時間が進むと相手からの連絡や相談として届きます（アプリを閉じるとロック画面で時間が進みます）。</p>}
          <div className="end-row">
            {c.stage !== 'relationship' ? (
              <button className="link danger" onClick={() => act({ type: 'endContact', npcId: c.npcId })}>やり取りを終える</button>
            ) : !confirmBreakup ? (
              <button className="link danger" onClick={() => setConfirmBreakup(true)}>別れる</button>
            ) : (
              <span>
                別れると交際日数は0に戻り、ライフも大きく減ります。
                <button className="btn small danger" onClick={() => { act({ type: 'endContact', npcId: c.npcId }); setConfirmBreakup(false); }}>別れる</button>
                <button className="btn ghost small" onClick={() => setConfirmBreakup(false)}>やめる</button>
              </span>
            )}
          </div>
        </div>
      )}
      {c.stage === 'ended' && <p className="muted small center">このトークは終了しました。{c.endedBy === 'me' ? '（自分から終了）' : ''}</p>}

      {askFrom && (
        <AskSheet state={state} contact={c} onClose={() => setAskFrom(null)}
          onPick={(key) => { setAskFrom(null); send({ type: 'reply', npcId: c.npcId, optionId: askFrom === 'answer' && draft ? `${draft}+q:${key}` : `q:${key}` }); }} />
      )}
      {paywall && (
        <Sheet
          title="有料会員プラン"
          onClose={() => setPaywall(null)}
          footer={(
            <div className="row">
              <button className="btn primary" onClick={() => { act({ type: 'subscribe' }); act(paywall); setPaywall(null); }}>{memberFee(state).toLocaleString()}円を払ってメッセージを送る</button>
              <button className="btn ghost" onClick={() => setPaywall(null)}>やめておく</button>
            </div>
          )}
        >
          <div className="paywall">
            <p className="pw-price"><b>{memberFee(state).toLocaleString()}円</b>／30日</p>
            <p>男性がアプリ内でメッセージを送るには、有料会員になる必要があります。いいねを送るのは無料です。</p>
            <ul className="small">
              <li>会員期間は今日から30日間。自動では更新されず、切れたらまた加入が必要です。</li>
              <li>相手から返事が来なくても、利用料は戻りません。</li>
              <li>今月の支出 {man(state.monthSpend)}／活動予算 {man(monthBudget(state))}（加入すると {man(state.monthSpend + memberFee(state))}）</li>
              <li>LINEを交換した相手とのやり取りには、会員は必要ありません。</li>
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** 答え方を選んだ後：聞き返す・プロフィールを見て質問を添える・答えだけ送る（2026-11-11） */
function AnswerStep({ state, contact: c, draft, onBack, onSend, onAsk }: { state: GameState; contact: Contact; draft: 'ans_d' | 'ans_c'; onBack: () => void; onSend: (optionId: string) => void; onAsk: () => void }) {
  const npc = state.npcs[c.npcId];
  const m = talkMenu(state, c, npc);
  const ans = draft === 'ans_d' ? m.detailed : m.casual;
  return (
    <div className="answer-step">
      <p className="small muted">{draft === 'ans_d' ? '詳しく答える' : '適当に答える'}：<span className="msg-preview">「{ans}」</span></p>
      {!m.askedBack && <button className="btn choice" onClick={() => onSend(`${draft}+back`)}>答えて、聞き返す<small className="msg-preview">「{m.askBack}」を付ける</small></button>}
      <button className="btn choice" onClick={onAsk}>答えて、プロフィールを見て質問する</button>
      <button className="btn choice" onClick={() => onSend(draft)}>答えだけ送る</button>
      <button className="link small" onClick={onBack}>‹ 答え方を選び直す</button>
    </div>
  );
}

/** プロフィールを見て質問する：相手のプロフィールと、聞ける質問の一覧（2026-11-11） */
function AskSheet({ state, contact: c, onClose, onPick }: { state: GameState; contact: Contact; onClose: () => void; onPick: (key: string) => void }) {
  const npc = state.npcs[c.npcId];
  const m = talkMenu(state, c, npc);
  const groups = [...new Set(m.questions.map((q) => q.group))];
  return (
    <Sheet title={`${npc.name}さんのプロフィール`} onClose={onClose}>
      <NpcProfile npc={npc} large />
      <h3 className="ask-head">プロフィールを見て質問する</h3>
      {groups.map((g) => (
        <div key={g} className="ask-group">
          <p className="small muted">{g}</p>
          {m.questions.filter((q) => q.group === g).map((q) => (
            <button key={q.key} className="btn choice msg-choice" onClick={() => onPick(q.key)}>{q.text}</button>
          ))}
        </div>
      ))}
      {m.questions.length === 0 && <p className="small muted">聞けそうなことはもう聞いた。</p>}
    </Sheet>
  );
}
