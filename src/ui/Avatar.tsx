// 人物の表示。
// ・プレイ可能キャラ：基準ポートレート（public/portraits/ID.png）。未制作なら仮のシルエット。
// ・相手NPC：提供素材の写真を割り当てた相手はその写真、それ以外は共通アイコン。ゲーム中は容姿の評価値を出さない（選択画面だけ）。
// ・顔写真を公開していないプロフィール：風景・趣味の仮画像（顔が見える画像を流用しない）。
// 「画像ファイルがない」ことと「プロフィールで顔を公開していない」ことは別の状態として扱う。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState, Npc } from '../engine/types';

const SCENERY = [
  { bg: 'linear-gradient(160deg,#9fd3e6 0%,#d8eef5 55%,#7fb07a 56%,#5b8f58 100%)', icon: '⛰️', label: '山の写真' },
  { bg: 'linear-gradient(160deg,#f6d7b0 0%,#f1b98a 60%,#c98a5c 100%)', icon: '☕', label: 'カフェの写真' },
  { bg: 'linear-gradient(160deg,#cfe3c5 0%,#a9c89b 100%)', icon: '🌿', label: '植物の写真' },
  { bg: 'linear-gradient(160deg,#c9d3f2 0%,#8fa1d9 100%)', icon: '🌙', label: '夜景の写真' },
  { bg: 'linear-gradient(160deg,#f3e2a9 0%,#e8c25f 100%)', icon: '📚', label: '本の写真' },
];

export function Silhouette({ gender, tone = '#c8ccd6', cover }: { gender: 'M' | 'F'; tone?: string; cover?: boolean }) {
  return (
    <svg viewBox="0 0 100 125" className="silhouette" aria-hidden="true" preserveAspectRatio={cover ? 'xMidYMin slice' : undefined}>
      <rect width="100" height="125" fill="#eef0f4" />
      <circle cx="50" cy="48" r="20" fill={tone} />
      {gender === 'F' ? (
        <path d="M27 52c0-22 9-32 23-32s23 10 23 32c-4-5-8-8-8-8H35s-4 3-8 8z" fill="#b5bac6" />
      ) : (
        <path d="M30 44c0-14 8-22 20-22s20 8 20 22c-3-5-8-8-20-8s-17 3-20 8z" fill="#b5bac6" />
      )}
      <path d="M14 125c2-26 17-38 36-38s34 12 36 38z" fill={tone} />
    </svg>
  );
}

/** public/npc/ の写真（提供素材・風景写真）のURL */
const RENAMED: Record<string, string> = { 's-sea.jpg': 's36.jpg', 's-steak.jpg': 's37.jpg', 's-ramen.jpg': 's38.jpg' }; // 第1版のセーブ用
export function npcPhotoUrl(file: string): string {
  return `${import.meta.env.BASE_URL}npc/${RENAMED[file] ?? file}`;
}

export function Scenery({ seed, compact, photo }: { seed: string; compact?: boolean; photo?: string }) {
  if (photo) {
    return (
      <div className={`scenery ${compact ? 'compact' : ''}`}>
        <img src={npcPhotoUrl(photo)} alt="風景・料理の写真（顔写真なし）" draggable={false} />
      </div>
    );
  }
  const s = SCENERY[[...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0) % SCENERY.length];
  return (
    <div className={`scenery ${compact ? 'compact' : ''}`} style={{ background: s.bg }} role="img" aria-label={`${s.label}（顔写真なし）`}>
      <span>{s.icon}</span>
    </div>
  );
}

type Manifest = Record<string, { file: string; version: number; approval: string }>;
let manifestPromise: Promise<Manifest> | null = null;
declare const __PORTRAIT_MANIFEST__: Manifest | undefined;
function loadManifest(): Promise<Manifest> {
  // ビルドしたゲームはマニフェストを中に持つ（ファイルを直接開いて遊ぶオフライン版では fetch できないため。2026-11-13）
  if (!import.meta.env.DEV && typeof __PORTRAIT_MANIFEST__ !== 'undefined') return Promise.resolve(__PORTRAIT_MANIFEST__);
  manifestPromise ??= fetch(`${import.meta.env.BASE_URL}portraits/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}));
  return manifestPromise;
}

export function usePortraitManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest().then((x) => alive && setM(x));
    return () => {
      alive = false;
    };
  }, []);
  return m;
}

/** プレイ可能キャラの基準ポートレート（本人用表示・キャラ選択用） */
export function Portrait({ id, gender, className, showStatus }: { id: string; gender: 'M' | 'F'; className?: string; showStatus?: boolean }) {
  const manifest = usePortraitManifest();
  const [failed, setFailed] = useState(false);
  const entry = manifest?.[id];
  return (
    <div className={`portrait ${className ?? ''}`}>
      {!entry || failed ? (
        <div className="portrait-missing">
          <Silhouette gender={gender} />
          {manifest && <span className="asset-note">写真準備中</span>}
        </div>
      ) : (
        <>
          <img src={`${import.meta.env.BASE_URL}portraits/${entry.file}`} alt={`${id}の基準ポートレート`} onError={() => setFailed(true)} />
          {showStatus && entry.approval !== 'approved' && <span className="asset-note">確認待ちの画像</span>}
        </>
      )}
    </div>
  );
}

/** 相手NPCのアイコン。写真素材を割り当てた相手はその写真、それ以外は共通アイコン（顔を出していない人は風景） */
/** 写真を大きく表示する（アイコンを押したとき。2026-11-11 指示） */
export function PhotoZoom({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="photo-zoom" role="dialog" aria-label={alt} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <img src={src} alt={alt} draggable={false} />
      <button className="btn small photo-zoom-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>閉じる</button>
    </div>,
    document.body,
  );
}

export function NpcAvatar({ npc, size = 'md' }: { npc: Npc; size?: 'sm' | 'md' | 'lg' | 'big' | 'xl' | 'hero' }) {
  const [zoom, setZoom] = useState(false);
  if (npc.photo) {
    const alt = npc.profilePhotoVisible ? `${npc.name}のプロフィール写真` : '風景・料理の写真（顔写真なし）';
    // 小さいアイコンは押すと大きく表示（大きい写真はスワイプなどに使うので対象外）
    const zoomable = size === 'sm' || size === 'md' || size === 'lg' || size === 'hero';
    return (
      <div
        className={`npc-avatar ${size}${zoomable ? ' zoomable' : ''}`}
        role={zoomable ? 'button' : undefined}
        aria-label={zoomable ? `${npc.name}の写真を大きく表示` : undefined}
        onClick={zoomable ? (e) => { e.stopPropagation(); e.preventDefault(); setZoom(true); } : undefined}
      >
        <img src={npcPhotoUrl(npc.photo)} alt={alt} draggable={false} />
        {zoom && <PhotoZoom src={npcPhotoUrl(npc.photo)} alt={alt} onClose={() => setZoom(false)} />}
      </div>
    );
  }
  if (!npc.profilePhotoVisible) {
    return (
      <div className={`npc-avatar ${size}`}>
        <Scenery seed={npc.id} compact />
      </div>
    );
  }
  // 共通アイコン（外見の設定値は色や形で表さない）
  return (
    <div className={`npc-avatar ${size}`}>
      <Silhouette gender={npc.gender} />
    </div>
  );
}

/**
 * ライフが減ると見えてくる相手の情報（以前は50未満で容姿、30未満で偏差値）。
 * 実際のアプリにない機能なので 2026-11-13 にやめた（何も出さない）。呼び出し側はそのまま
 */
export function npcRevealTags(_state: GameState, _npc: Npc): string[] {
  return [];
}

export function npcPhotoLabel(npc: Npc): string {
  if (npc.profilePhotoVisible) return '顔写真あり';
  // 人物の写真だが顔が分からない（後ろ姿・スマホで隠れる・シルエット）か、風景・料理などの写真か
  if (npc.photo?.startsWith('m')) return '顔がはっきり写っていない写真';
  return '顔写真なし（風景などの写真）';
}
