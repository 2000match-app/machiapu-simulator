// アセット台帳から、ゲーム表示用の public/portraits/manifest.json を作る。
// ゲーム本体はこのマニフェストと完成済み画像だけで動き、APIは呼ばない。
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_PORTRAITS, loadLedger } from './ledger';

export function syncManifest(): Record<string, { file: string; version: number; approval: string }> {
  const ledger = loadLedger();
  const out: Record<string, { file: string; version: number; approval: string }> = {};
  for (const [id, e] of Object.entries(ledger.portraits)) {
    const v = e.versions.find((x) => x.version === e.adoptedVersion);
    if (!v) continue;
    const ext = v.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const file = `${id}.${ext}`;
    if (!fs.existsSync(path.join(PUBLIC_PORTRAITS, file))) continue;
    out[id] = { file, version: v.version, approval: v.approval };
  }
  fs.mkdirSync(PUBLIC_PORTRAITS, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_PORTRAITS, 'manifest.json'), JSON.stringify(out, null, 2), 'utf8');
  return out;
}

if (process.argv[1] && import.meta.filename && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const m = syncManifest();
  console.log(`manifest: ${Object.keys(m).length}件`, m);
}
