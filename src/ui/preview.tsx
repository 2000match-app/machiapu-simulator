// 魅力度の偏差値のバッジ（2026-11-16 指示）。偏差値が見える版と見えない版の2つを作る：
// ふつうのビルド（npm run build）では出さず、偏差値つきのビルド（npm run build:hensachi ＝ vite build --mode hensachi）と
// 開発用サーバーでは出す。切り替えは vite.config.ts の __SHOW_HENSACHI__
import { hensachiOf } from '../engine/npc';

declare const __SHOW_HENSACHI__: boolean | undefined;
export const SHOW_HENSACHI = typeof __SHOW_HENSACHI__ !== 'undefined' && __SHOW_HENSACHI__;

export function Hensachi({ of, faceHidden }: { of: Parameters<typeof hensachiOf>[0]; faceHidden?: boolean }) {
  if (!SHOW_HENSACHI) return null;
  return <span className="hensachi" title="魅力度の偏差値（プレビュー用の一時表示）">偏差値{hensachiOf(faceHidden === undefined ? of : { ...of, faceHidden })}</span>;
}
