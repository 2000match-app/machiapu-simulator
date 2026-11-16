// Gemini API（Interactions API: POST /v1beta/interactions）の最小クライアント。
// 2026-10-18に公式資料（image-generation / structured-output）で確認した形式に合わせる。
// - キーは環境変数 GEMINI_API_KEY（または GEMINI_API_KEY_FILE が指すファイル）から読み、表示・保存しない。
// - モデル名は GEMINI_IMAGE_MODEL / GEMINI_REVIEW_MODEL で切り替える。
// - 通信エラーの再送と、画質改善の再生成は別物。再送も課金され得る試行として記録する。
// - 結果不明のタイムアウトは自動で再送しない。
import fs from 'node:fs';

export const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
export const REVIEW_MODEL = process.env.GEMINI_REVIEW_MODEL || 'gemini-3.8-flash';

export function loadApiKey(): string {
  const direct = process.env.GEMINI_API_KEY?.trim();
  if (direct) return direct;
  const file = process.env.GEMINI_API_KEY_FILE;
  if (file && fs.existsSync(file)) {
    // 2026-11-14：同じファイルに ChatGPT（OpenAI）のキー（sk- で始まる行）も入ったので、それ以外の行を Gemini のキーとして読む
    const v = keyLines(file).find((l) => !l.startsWith('sk-'));
    if (v) return v;
  }
  throw new Error('GEMINI_API_KEY（または GEMINI_API_KEY_FILE）が設定されていません。キー不要のゲーム本体とテストは実行できます。');
}

/** キーのファイルの、空でない行（前後の空白・BOMを除く） */
function keyLines(file: string): string[] {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** ChatGPT（OpenAI）のキー：環境変数 OPENAI_API_KEY、または GEMINI_API_KEY_FILE の中の sk- で始まる行。表示・保存しない */
export function loadOpenAiKey(): string {
  const direct = process.env.OPENAI_API_KEY?.trim();
  if (direct) return direct;
  const file = process.env.OPENAI_API_KEY_FILE || process.env.GEMINI_API_KEY_FILE;
  if (file && fs.existsSync(file)) {
    const v = keyLines(file).find((l) => l.startsWith('sk-'));
    if (v) return v;
  }
  throw new Error('OPENAI_API_KEY（または sk- で始まる行のあるキーのファイル）が設定されていません。');
}

export type AttemptOutcome = 'ok' | 'http_error' | 'network_error' | 'timeout_unknown' | 'no_image' | 'invalid_json';

export interface Attempt {
  at: string;
  model: string;
  outcome: AttemptOutcome;
  httpStatus?: number;
  /** 課金され得る試行か（リクエストが送信された可能性があるもの） */
  billable: boolean;
  message?: string;
  usage?: unknown;
  interactionId?: string;
}

export interface InteractionResult {
  json: Record<string, unknown>;
  attempt: Attempt;
}

export class RequestBudget {
  used = 0;
  constructor(public readonly max: number) {}
  take(): void {
    if (this.used >= this.max) throw new Error(`このジョブのリクエスト上限（${this.max}）に達しました`);
    this.used += 1;
  }
}

/**
 * 1回のリクエスト。retryable な失敗（429・5xx・送信前の通信失敗）のみ、上限内で再送する。
 * すべての試行は attempts に記録される。
 */
export async function callInteractions(
  body: Record<string, unknown>,
  opts: { budget: RequestBudget; attempts: Attempt[]; timeoutMs?: number; maxRetries?: number },
): Promise<InteractionResult | null> {
  const key = loadApiKey();
  const model = String(body.model);
  const maxRetries = opts.maxRetries ?? 2;
  for (let i = 0; i <= maxRetries; i++) {
    opts.budget.take();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180_000);
    const at = new Date().toISOString();
    try {
      const res = await fetch(`${API_BASE}/interactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        const attempt: Attempt = { at, model, outcome: 'http_error', httpStatus: res.status, billable: res.status >= 500 || res.status === 429, message: text.slice(0, 400) };
        opts.attempts.push(attempt);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
          continue;
        }
        return null;
      }
      const json = JSON.parse(text) as Record<string, unknown>;
      const attempt: Attempt = { at, model, outcome: 'ok', httpStatus: res.status, billable: true, usage: json.usage, interactionId: String(json.id ?? '') };
      opts.attempts.push(attempt);
      return { json, attempt };
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as Error).name === 'AbortError';
      if (aborted) {
        // 送信後に応答が来ないまま打ち切った：生成・課金されたか不明なので自動再送しない
        opts.attempts.push({ at, model, outcome: 'timeout_unknown', billable: true, message: 'タイムアウト（結果不明のため再送しない）' });
        return null;
      }
      opts.attempts.push({ at, model, outcome: 'network_error', billable: true, message: String((e as Error).message).slice(0, 200) });
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  return null;
}

interface Block { type?: string; text?: string; data?: string; mime_type?: string }
interface Step { type?: string; content?: Block[] }

/** 応答から最後の画像ブロックを取り出す（思考中の途中画像ではなく最終出力） */
export function extractImage(json: Record<string, unknown>): { data: Buffer; mimeType: string } | null {
  const steps = (json.steps as Step[] | undefined) ?? [];
  let found: Block | null = null;
  for (const s of steps) {
    if (s.type !== 'model_output') continue;
    for (const b of s.content ?? []) if (b.type === 'image' && b.data) found = b;
  }
  if (!found) {
    const out = (json as { output_image?: Block }).output_image;
    if (out?.data) found = out;
  }
  if (!found?.data) return null;
  return { data: Buffer.from(found.data, 'base64'), mimeType: found.mime_type ?? 'image/png' };
}

export function extractText(json: Record<string, unknown>): string {
  const steps = (json.steps as Step[] | undefined) ?? [];
  const parts: string[] = [];
  for (const s of steps) {
    if (s.type !== 'model_output') continue;
    for (const b of s.content ?? []) if (b.type === 'text' && b.text) parts.push(b.text);
  }
  if (parts.length === 0 && typeof (json as { output_text?: string }).output_text === 'string') return (json as { output_text: string }).output_text;
  return parts.join('');
}

export function imagePart(buf: Buffer, mimeType = 'image/png'): Record<string, string> {
  return { type: 'image', mime_type: mimeType, data: buf.toString('base64') };
}
