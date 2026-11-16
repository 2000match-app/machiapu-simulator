// 最終プレビュー用（2026-11-16 指示）：魅力度の偏差値を一時的に画面に出す。
// プレビューが終わったら SHOW_HENSACHI を false にすれば、すべての表示が消える。
import { hensachiOf } from '../engine/npc';

export const SHOW_HENSACHI = true;

export function Hensachi({ of, faceHidden }: { of: Parameters<typeof hensachiOf>[0]; faceHidden?: boolean }) {
  if (!SHOW_HENSACHI) return null;
  return <span className="hensachi" title="魅力度の偏差値（プレビュー用の一時表示）">偏差値{hensachiOf(faceHidden === undefined ? of : { ...of, faceHidden })}</span>;
}
