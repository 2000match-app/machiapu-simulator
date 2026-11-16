// 画像の確認用シート（男女別に横並び＋Geminiレビュー）を production/review-sheet.html に書き出す。
// 開発サーバー起動中は http://localhost:5173/production/review-sheet.html で開ける。
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCTION, loadLedger } from './ledger';
import { PORTRAIT_SPECS } from './portraitSpecs';

const ledger = loadLedger();
const last = [...ledger.reviews].reverse().find((r) => r.kind === 'portrait');
if (!last) throw new Error('レビューがありません');
const review = JSON.parse(fs.readFileSync(path.join(PRODUCTION, last.file), 'utf8'));
const notesPath = path.join(PRODUCTION, 'review-notes.json');
const notes: Record<string, string> = fs.existsSync(notesPath) ? JSON.parse(fs.readFileSync(notesPath, 'utf8')) : {};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function blindFor(id: string): { label: string; rank: number; imp: number; features: string; expression: string } | null {
  for (const g of ['M', 'F']) {
    const b = review.blind?.[g];
    if (!b) continue;
    const label = Object.entries(b.labelMap as Record<string, { id: string }>).find(([, v]) => v.id === id)?.[0];
    if (!label) continue;
    const img = (b.response?.images ?? []).find((x: { label: string }) => x.label === label);
    if (img) return { label, rank: img.rank, imp: img.impression_1to5, features: img.observed_features, expression: img.expression };
  }
  return null;
}

function card(id: string): string {
  const spec = PORTRAIT_SPECS.find((s) => s.id === id)!;
  const e = ledger.portraits[id];
  const v = e?.versions.find((x) => x.version === e.adoptedVersion);
  if (!v) return `<div class="card"><div class="ph">未生成</div><h3>${id} ${spec.name}</h3></div>`;
  const ind = review.individual?.[id]?.response;
  const b = blindFor(id);
  const issues = (ind?.checks ?? []).filter((c: { severity: string }) => c.severity !== 'none');
  const ob = (ind?.checks ?? []).find((c: { item: string }) => c.item === 'over_beautification');
  return `<div class="card">
    <img src="${esc(v.file)}" alt="${id}">
    <h3>${id} ${esc(spec.name)}・${spec.age}歳 <span class="lv">設定：容姿${spec.looks}</span></h3>
    <p class="meta">v${v.version}／${esc(v.model)}／${esc(v.settings.imageSize)} ${esc(v.settings.aspectRatio)}／試行${v.attempts.length}回／${esc(v.approval)}</p>
    <dl>
      <dt>盲検比較（ラベル${esc(b?.label)}）</dt><dd>印象 <b>${esc(b?.imp)}</b>/5・順位 ${esc(b?.rank)}　表情：${esc(b?.expression)}</dd>
      <dt>観察された特徴</dt><dd>${esc(b?.features)}</dd>
      <dt>個別レビュー</dt><dd>人数 ${esc(ind?.person_count)}／見た目年齢 ${esc(ind?.apparent_age_min)}〜${esc(ind?.apparent_age_max)}歳／美化：${esc(ob?.severity)}（${esc(ob?.observation)}）</dd>
      ${issues.length ? `<dt>指摘</dt><dd>${issues.map((c: { item: string; observation: string; fix: string }) => `${esc(c.item)}：${esc(c.observation)}（修正案：${esc(c.fix)}）`).join('<br>')}</dd>` : ''}
      ${notes[id] ? `<dt>制作側の所見</dt><dd>${esc(notes[id])}</dd>` : ''}
    </dl>
  </div>`;
}

function row(gender: 'M' | 'F'): string {
  const ids = review.targets.filter((id: string) => PORTRAIT_SPECS.find((s) => s.id === id)?.gender === gender)
    .sort((a: string, b: string) => PORTRAIT_SPECS.find((s) => s.id === a)!.looks - PORTRAIT_SPECS.find((s) => s.id === b)!.looks);
  const b = review.blind?.[gender]?.response;
  return `<section><h2>${gender === 'M' ? '男性' : '女性'}（設定の容姿 低→高）</h2><div class="grid">${ids.map(card).join('')}</div>
    <div class="blind"><b>盲検比較で挙がった交絡要因：</b>${(b?.confounds ?? []).map(esc).join('／') || 'なし'}<br>
    <b>比較が難しい点：</b>${(b?.hard_to_compare ?? []).map(esc).join('／') || 'なし'}<br>
    <b>ほぼ同じと判断された組：</b>${(b?.near_equal ?? []).map(esc).join('／') || 'なし'}（不確かさ：${esc(b?.uncertainty)}）</div></section>`;
}

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ポートレート確認シート</title>
<style>
:root{--bg:#f4f2f0;--fg:#2a2522;--muted:#7a716b;--line:#e2dcd6;--accent:#e8607a}
body{margin:0;background:var(--bg);color:var(--fg);font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic UI',Meiryo,sans-serif;line-height:1.55}
main{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:1.3rem;margin:.2em 0}h2{font-size:1.05rem;margin:1.2em 0 .5em}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px}
.card img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:10px;display:block}
.card h3{font-size:.95rem;margin:.5em 0 .1em}.lv{color:var(--accent);font-size:.8rem;margin-left:4px}
.meta{color:var(--muted);font-size:.72rem;margin:0}
dl{font-size:.8rem;margin:.4em 0 0}dt{color:var(--muted);margin-top:.3em}dd{margin:0}
.blind{background:#fff;border:1px dashed var(--line);border-radius:10px;padding:8px 12px;font-size:.8rem;margin-top:10px}
.note{font-size:.82rem;color:var(--muted)}
</style></head><body><main>
<h1>ポートレート確認シート（初回6枚）</h1>
<p class="note">レビュー：${esc(review.model)}（${esc(review.createdAt)}）。容姿の5段階には主観があり、AIの比較は補助です。盲検比較ではレベル・職業・収入・ファイル名を伏せ、順序を入れ替えた画像だけを送っています。</p>
${row('M')}${row('F')}
</main></body></html>`;
fs.writeFileSync(path.join(PRODUCTION, 'review-sheet.html'), html, 'utf8');
console.log('保存: production/review-sheet.html');
