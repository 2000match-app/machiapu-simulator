// アセット台帳（production/asset-ledger.json）。
// 人物ID・プロンプト・モデル・設定・生成日時・試行数・ファイル・レビュー結果・ユーザーの承認状態を保存する。
import fs from 'node:fs';
import path from 'node:path';
import type { Attempt } from './client';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const PRODUCTION = path.join(ROOT, 'production');
export const LEDGER_PATH = path.join(PRODUCTION, 'asset-ledger.json');
export const PUBLIC_PORTRAITS = path.join(ROOT, 'public', 'portraits');

export type ApprovalStatus = 'not_generated' | 'awaiting_user_review' | 'approved' | 'rejected' | 'needs_revision';

export interface PortraitVersion {
  version: number;
  file: string;
  createdAt: string;
  model: string;
  settings: { aspectRatio: string; imageSize: string };
  prompt: string;
  revisionNote?: string;
  /** 通信エラーの再送を含む、このバージョンのための試行 */
  attempts: Attempt[];
  sha256: string;
  bytes: number;
  mimeType: string;
  reviewFile?: string;
  approval: ApprovalStatus;
  approvalNote?: string;
}

export interface PortraitEntry {
  id: string;
  kind: 'playable_portrait';
  /** 採用中のバージョン（承認済みは上書きしない） */
  adoptedVersion?: number;
  versions: PortraitVersion[];
  /** 失敗に終わった試行（画像なし） */
  failedAttempts: Attempt[];
}

export interface Ledger {
  schema: 1;
  note: string;
  portraits: Record<string, PortraitEntry>;
  reviews: { file: string; createdAt: string; kind: string; model: string; targets: string[] }[];
  npcImages: { status: 'not_started'; note: string };
}

export function loadLedger(): Ledger {
  if (fs.existsSync(LEDGER_PATH)) return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as Ledger;
  return {
    schema: 1,
    note: 'プレイ可能20人の基準ポートレートの台帳。相手NPCの画像は未制作（後続作業）。',
    portraits: {},
    reviews: [],
    npcImages: { status: 'not_started', note: 'NPC画像の全量生成・自動生成・挿絵・表情差分は今回の範囲外。NPCは共通アイコンを表示する。' },
  };
}

export function saveLedger(l: Ledger): void {
  fs.mkdirSync(PRODUCTION, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(l, null, 2), 'utf8');
}

export function entry(l: Ledger, id: string): PortraitEntry {
  l.portraits[id] ??= { id, kind: 'playable_portrait', versions: [], failedAttempts: [] };
  return l.portraits[id];
}
