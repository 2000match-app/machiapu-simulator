// さがすの大きなカード：右にスワイプでいいね、左でスキップ（指・マウスのどちらでも）。タップでプロフィール。
// 縦方向のスクロールはブラウザに任せる（touch-action: pan-y）。
import { useEffect, useRef, useState } from 'react';
import { Hensachi } from './preview';
import type { KeyboardEvent, PointerEvent } from 'react';
import { areaLabel } from '../engine/data/areas';
import { MARITAL_LABEL } from '../engine/data/characters';
import type { Npc } from '../engine/types';
import { Scenery, Silhouette, npcPhotoLabel, npcPhotoUrl } from './Avatar';
import { incomeOf } from './format';

const THRESHOLD = 90; // これ以上動かして離すと確定
const TAP = 8; // これ未満ならタップ扱い

function CardFace({ npc, reveal }: { npc: Npc; reveal?: string[] }) {
  return (
    <>
      <div className="sw-photo">
        {npc.photo ? <img src={npcPhotoUrl(npc.photo)} alt="" draggable={false} />
          : npc.profilePhotoVisible ? <Silhouette gender={npc.gender} cover /> : <Scenery seed={npc.id} />}
      </div>
      <div className="sw-info">
        <div className="sw-name"><b>{npc.name}</b> {npc.age}歳<Hensachi of={npc} /></div>
        <div className="sw-line">{areaLabel(npc.areaId)}・{npc.heightCm}cm</div>
        <div className="sw-line">{npc.job}・年収{incomeOf(npc)}</div>
        <div className="sw-tags">
          {reveal?.map((t) => <span key={t} className="reveal">{t}</span>)}
          {!npc.profilePhotoVisible && <span>{npcPhotoLabel(npc)}</span>}
          {npc.profileDepth !== 'bare' && npc.hobbies.slice(0, 2).map((h) => <span key={h}>{h}</span>)}
          {npc.marital !== 'never' && <span>{MARITAL_LABEL[npc.marital]}</span>}
        </div>
      </div>
    </>
  );
}

export function SwipeDeck({ top, next, canLike, onLike, onSkip, onOpen, reveal, likeLabel = 'いいね', skipLabel = 'スキップ' }: {
  /** 右・左の表示（もらったいいねでは「マッチ」「見送る」。2026-11-16） */
  likeLabel?: string;
  skipLabel?: string;
  top: Npc;
  next?: Npc;
  canLike: boolean;
  onLike: (id: string) => void;
  onSkip: (id: string) => void;
  onOpen: (id: string) => void;
  reveal?: (npc: Npc) => string[];
}) {
  // 位置と状態はカードの持ち主（相手のID）ごとに持つ。次の人に替わった瞬間から定位置で表示し、右から滑り込ませない
  type Anim = { id: string; x: number; y: number; active: boolean; leaving: 'left' | 'right' | null };
  const [anim, setAnim] = useState<Anim>({ id: top.id, x: 0, y: 0, active: false, leaving: null });
  const cur: Anim = anim.id === top.id ? anim : { id: top.id, x: 0, y: 0, active: false, leaving: null };
  const drag = cur;
  const leaving = cur.leaving;
  const setDrag = (d: { x: number; y: number; active: boolean }) => setAnim({ ...cur, ...d });
  const setLeaving = (dir: 'left' | 'right') => setAnim({ ...cur, leaving: dir });
  const [notice, setNotice] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const decide = (dir: 'left' | 'right') => {
    if (leaving) return;
    if (dir === 'right' && !canLike) {
      setNotice('今週のいいねは残っていません');
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    setNotice(null);
    setLeaving(dir);
    timer.current = window.setTimeout(() => (dir === 'right' ? onLike(top.id) : onSkip(top.id)), 230);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (dx > THRESHOLD) decide('right');
    else if (dx < -THRESHOLD) decide('left');
    else {
      setDrag({ x: 0, y: 0, active: false });
      if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) onOpen(top.id);
    }
  };
  const onCancel = () => {
    start.current = null;
    setDrag({ x: 0, y: 0, active: false });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') decide('right');
    else if (e.key === 'ArrowLeft') decide('left');
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(top.id); }
  };

  const x = leaving === 'right' ? 520 : leaving === 'left' ? -520 : drag.x;
  const y = leaving ? drag.y : drag.y * 0.25;
  const style = {
    transform: `translate(${x}px, ${y}px) rotate(${x / 18}deg)`,
    transition: drag.active && !leaving ? 'none' : 'transform 0.23s ease-out',
  };
  const likeOpacity = Math.max(0, Math.min(1, (leaving === 'right' ? THRESHOLD : drag.x) / THRESHOLD));
  const skipOpacity = Math.max(0, Math.min(1, (leaving === 'left' ? THRESHOLD : -drag.x) / THRESHOLD));

  return (
    <div className="swipe">
      <div className="sw-stack">
        {next && <div key={next.id} className="sw-card back" aria-hidden="true"><CardFace npc={next} reveal={reveal?.(next)} /></div>}
        <div
          key={top.id}
          className="sw-card"
          style={style}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onKeyDown={onKey}
          tabIndex={0}
          role="group"
          aria-roledescription="スワイプカード"
          aria-label={`${top.name}、${top.age}歳。右にスワイプで${likeLabel}、左で${skipLabel}、タップでプロフィール`}
        >
          <CardFace npc={top} reveal={reveal?.(top)} />
          <span className="sw-stamp like" style={{ opacity: likeOpacity }} aria-hidden="true">{likeLabel}</span>
          <span className="sw-stamp skip" style={{ opacity: skipOpacity }} aria-hidden="true">{skipLabel}</span>
        </div>
      </div>
      <div className="sw-actions">
        <button className="sw-btn skip" onClick={() => decide('left')} aria-label={skipLabel}>✕</button>
        <button className="sw-btn info" onClick={() => onOpen(top.id)} aria-label="プロフィールを見る">i</button>
        <button className="sw-btn like" onClick={() => decide('right')} disabled={!canLike} aria-label={likeLabel}>♥</button>
      </div>
      <p className={`sw-hint small ${notice ? 'warn' : 'muted'}`} role={notice ? 'status' : undefined}>
        {notice ?? `右にスワイプで${likeLabel}・左で${skipLabel}・タップでプロフィール`}
      </p>
    </div>
  );
}
