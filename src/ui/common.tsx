// 画面共通の部品：下から出るシート、無限スクロールの読み込み位置
import { useEffect, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose} aria-label="閉じる">閉じる</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * 一覧の末尾に置き、画面に入ったら onVisible を呼ぶ（無限スクロール）。
 * 読み込み後も末尾が見えたままなら、続けて読み込む。
 */
export function Sentinel({ onVisible, enabled, deps }: { onVisible: () => void; enabled: boolean; deps: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, deps]);
  return <div ref={ref} className="sentinel" aria-hidden="true" />;
}
