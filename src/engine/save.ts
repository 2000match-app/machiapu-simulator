// 保存と再開。日付・ライフ・金額・候補と相手の内部状態・顔の既知状態・予定・交際相手と開始日・
// 回復回数・イベント台帳・乱数の状態・データ版をすべて含めるため、再読込で結果が再抽選されない。
import { DATA_VERSION } from './data/rules';
import { SCHEMA_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_KEY = 'machiapu-sim:save:v1';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (s.schema !== SCHEMA_VERSION) throw new Error(`セーブデータの形式が違います（${s.schema}）`);
  if (s.dataVersion !== DATA_VERSION) {
    // データ版が違う場合も読み込むが、画面で警告する
    s.flags = { ...s.flags, dataVersionMismatch: `${s.dataVersion} → ${DATA_VERSION}` };
  }
  return s;
}

export function saveToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 保存できない環境では何もしない */
  }
}
