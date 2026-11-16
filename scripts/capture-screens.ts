// 実ブラウザ（インストール済みの Microsoft Edge）でゲームを操作し、画面を撮影・状態を検証する。
// 事前に `npm run dev` で開発サーバーを起動しておく。
// 使い方: npm run capture:screens -- --char M05 --seed ui-1 --weeks 12 --width 390
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const BASE = arg('url', 'http://localhost:5173/');
const CHAR = arg('char', 'M05');
const SEED = arg('seed', 'ui-1');
const WEEKS = Number(arg('weeks', '10'));
const WIDTH = Number(arg('width', '390'));
const HEIGHT = Number(arg('height', '844'));
const OUT = path.resolve(import.meta.dirname, '..', 'production', 'screens', `${CHAR}-${WIDTH}`);
fs.mkdirSync(OUT, { recursive: true });

const log: string[] = [];
const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

interface SaveLite { likesLeft?: number; received?: { total: number; unseen: number }; day: number; life: number; status: string; pending: unknown[]; stats: Record<string, number>; ledger: { delta: number; note: string }[]; money: { yen: number }[]; contacts: Record<string, { stage: string; lineExchanged?: boolean; sentLikeDay?: number; flags?: Record<string, unknown> }>; search?: { results: string[]; exhaustedSeen: number } }
async function save(page: Page): Promise<SaveLite | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('machiapu-sim:save:v1');
    return raw ? JSON.parse(raw) : null;
  });
}

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

let eventShots = 0;
let paywallSeen = false;
async function resolveModals(page: Page, prefer: string[] = []): Promise<number> {
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const modal = page.locator('.modal');
    if (!(await modal.count())) break;
    if (eventShots < 6) await shot(page, `event-${String(++eventShots).padStart(2, '0')}`);
    const choices = modal.locator('button.choice');
    const labels = await choices.allInnerTexts();
    let idx = 0;
    for (const p of prefer) {
      const k = labels.findIndex((l) => l.includes(p));
      if (k >= 0) { idx = k; break; }
    }
    log.push(`場面: ${await modal.locator('h2').innerText()} → ${labels[idx]}`);
    await choices.nth(idx).click();
    n++;
    await page.waitForTimeout(80);
  }
  return n;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, locale: 'ja-JP' });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.char-card');
await shot(page, '01-select');
check('選択画面：10人のカード（男女5人ずつ）', (await page.locator('.char-card').count()) === 10);
check('ホームにクリア・失敗の条件が目立つ形で出る', (await page.locator('.win-lose .wl').count()) === 2);
check('横スクロールなし（選択画面）', (await overflowX(page)) <= 0, `overflow=${await overflowX(page)}`);

const { getCharacter } = await import('../src/engine/data/characters');
const chDef = getCharacter(CHAR);
await page.locator('.char-card', { hasText: `${chDef.name}・${chDef.age}歳` }).first().click();
await page.waitForSelector('.sheet');
await shot(page, '01b-detail');
await page.locator('.sheet .seed input').fill(SEED);
await page.locator('.sheet .start-row button.primary').click();
await page.waitForSelector('.status-bar');
// 開始時のプロローグ（2026-11-07）
await page.waitForSelector('.prologue');
await shot(page, '01c-prologue');
check('開始時にプロローグが出る', (await page.locator('.prologue .pro-text p').count()) > 0);
await page.locator('.prologue button', { hasText: 'はじめる' }).click();
// さがす：最初はフリック表示。一覧に切り替えられる
await page.waitForSelector('.sw-card');
await shot(page, '02-search-swipe');
check('さがす：最初はフリック表示（一覧は出ない）', (await page.locator('.grid-card').count()) === 0);
const swipeIncome = (await page.locator('.sw-card:not(.back) .sw-info').innerText()).includes('年収');
await page.locator('.view-toggle button', { hasText: '一覧' }).click();
await page.waitForSelector('.grid-card');
check('さがす：一覧に切り替えるとフリックのカードが消える', (await page.locator('.sw-card').count()) === 0);
await shot(page, '02-search');
{
  // ゲーム中は容姿の評価値を出さない（選択画面だけ）。さがすのカードには年収を出す
  // 自分の設定（さがす上部の「あなた」）は容姿を出す。相手の情報にだけ容姿が出ないことを見る
  const text = await page.evaluate(() => { const el = document.querySelector('.app-col')!.cloneNode(true) as HTMLElement; el.querySelector('.me-card')?.remove(); return el.innerText || el.textContent || ''; });
  check('ゲーム中に相手の容姿の評価が出ない（自分の欄は除く）', !/(外見|容姿)\s*[0-9０-９]/.test(text));
  check('さがすのカード（スワイプ・2列一覧）に年収', swipeIncome && (await page.locator('.grid-card .gc-income').count()) > 0);
}
check('最初の画面は「さがす」', (await page.locator('.tabbar button.on').innerText()).includes('さがす'));
check('上部に「1日すすめる」「1週間すすめる」', (await page.locator('.advance-row button').count()) === 2);
let s = await save(page);
check('開始時ライフ100', s?.life === 100, `life=${s?.life}`);
await page.locator('.advance-row button', { hasText: '1日すすめる' }).click();
await resolveModals(page, []);
s = await save(page);
check('「1日すすめる」で1日進む', s?.day === 1, `day=${s?.day}`);
await page.waitForSelector('.toast');
await shot(page, '02b-after-1day');

const prefer = ['相手の話を聞いて', '別の価格帯', '今日は帰る', '送金せず', 'はっきり断って', 'その場で断る', '助けを求める', 'お互いの希望', '負担と頻度', '将来の考え', '予算内', 'また会いたい', '付き合ってほしい', 'よろしくお願いします', 'はっきり関係を確認', '何も言わずに', '相談する', '話し合う', '再確認', '調整', 'ほかの相手とのやり取りを終える', '自分のペース', '期限を6か月'];

for (let w = 0; w < WEEKS; w++) {
  s = await save(page);
  if (!s || s.status !== 'playing') break;
  // 受信いいね
  await page.locator('.tabbar button', { hasText: 'いいね' }).click();
  if (w === 0) await shot(page, '03-likes');
  if (w === 2) {
    const n0 = await page.locator('.likes .cand').count();
    const unseen = (await save(page))?.received;
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 5000); await page.waitForTimeout(250); }
    const n1 = await page.locator('.likes .cand').count();
    log.push(`いいね一覧：${n0}→${n1}件（未確認 ${JSON.stringify(unseen)}）`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  {
    const accept = page.locator('button', { hasText: 'いいね返し' });
    const n = Math.min(2, await accept.count());
    for (let i = 0; i < n; i++) await accept.first().click();
    if (w === 0 && n > 0) await shot(page, '03b-likes-after');
  }
  // さがす
  await page.locator('.tabbar button', { hasText: 'さがす' }).click();
  await page.waitForSelector('.grid-card');
  if (w === 0) {
    // 無限スクロール：末尾まで動かすと候補が増える
    const n0 = await page.locator('.grid-card').count();
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(250); }
    const n1 = await page.locator('.grid-card').count();
    check('さがす：スクロールで候補が増える', n1 > n0, `${n0}→${n1}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.filter-chip').click();
    await page.waitForSelector('.filters-form');
    await shot(page, '04b-filter');
    await page.locator('.sheet-head .link').click();
  }
  if (w === 0) {
    // スワイプ：右でいいね（さがすから消え、送ったいいねに入る）、左でスキップ
    const swipe = async (dx: number) => {
      const box = await page.locator('.sw-card:not(.back)').boundingBox();
      if (!box) return;
      const x0 = box.x + box.width / 2;
      const y0 = box.y + box.height / 2;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (dx * i) / 8, y0 + 4);
      await page.mouse.up();
      await page.waitForTimeout(450);
    };
    const nameOf = () => page.locator('.sw-card:not(.back) .sw-name b').innerText();
    await page.locator('.view-toggle button', { hasText: 'フリック' }).click();
    await page.waitForSelector('.sw-card');
    const b0 = await save(page);
    const first = await nameOf();
    await swipe(160);
    const b1 = await save(page);
    const liked = Object.keys(b1?.contacts ?? {}).length - Object.keys(b0?.contacts ?? {}).length;
    await swipe(-160);
    const b2 = await save(page);
    const skipped = (b2?.search?.exhaustedSeen ?? 0) - (b1?.search?.exhaustedSeen ?? 0);
    check('さがす：右スワイプでいいね・左スワイプでスキップ', liked === 1 && skipped === 1 && (await nameOf()) !== first, `いいね+${liked} スキップ+${skipped}`);
    const searchIds = b2?.search?.results ?? [];
    check('いいね済みの相手は「さがす」に出ない', searchIds.every((id) => !b2?.contacts[id]), `一覧${searchIds.length}件`);
    check('横スクロールなし（スワイプ後）', (await overflowX(page)) <= 0, `overflow=${await overflowX(page)}`);
    await page.screenshot({ path: path.join(OUT, '04c-swipe.png') });
    await page.locator('.view-toggle button', { hasText: '一覧' }).click();
    await page.waitForSelector('.grid-card');
  }
  {
    // いいねは1日5回。使い切ると自動で次の日へ進む（その日の出来事が出たら選んでから続ける）
    const likeBtns = page.locator('.grid-card button.like:not([disabled])');
    const left = (await save(page))?.likesLeft ?? 0;
    const day0 = (await save(page))?.day ?? 0;
    const n = Math.min(left, await likeBtns.count());
    for (let i = 0; i < n; i++) await likeBtns.first().click();
    if (w === 0) await shot(page, '04-search');
    if (w === 0 && n === left && left > 0) check('いいねを使い切ると次の日へ進む', ((await save(page))?.day ?? 0) === day0 + 1, `${day0}→${(await save(page))?.day}`);
    await resolveModals(page, prefer);
  }
  if (w === 0) {
    await page.locator('.tabbar button', { hasText: 'いいね' }).click();
    await page.locator('.talk-switch button', { hasText: '送ったいいね' }).click();
    const sent = await page.locator('.likes .grid-card').count();
    const sv = await save(page);
    const sentSave = Object.values(sv?.contacts ?? {}).filter((c) => c.sentLikeDay !== undefined).length;
    check('いいね欄の「送ったいいね」にいいねした相手が出る', sent > 0 && sent === Math.min(20, sentSave), `画面${sent}件／保存${sentSave}件`);
    await shot(page, '03c-sent-likes');
    await page.locator('.talk-switch button', { hasText: 'もらったいいね' }).click();
  }
  // トーク：最初のメッセージと返事
  await page.locator('.tabbar button', { hasText: 'トーク' }).click();
  if (w === 2) await shot(page, '05-talk-list');
  for (let k = 0; k < 8; k++) {
    const row = page.locator('.talk-row', { has: page.locator('.st-me, .st-new') }).first();
    if (!(await row.count())) break;
    await row.click();
    try {
      await page.waitForSelector('.chat', { timeout: 5000 });
    } catch {
      await shot(page, `debug-talk-w${w}-k${k}`);
      fs.writeFileSync(path.join(OUT, `debug-talk-w${w}.html`), await page.content(), 'utf8');
      throw new Error(`トークを開けませんでした: ${errors.join(' | ').slice(0, 1500)}`);
    }
    if (k === 0 && w >= 1) await shot(page, `06-chat-w${w}`);
    const choices = page.locator('.composer button.choice');
    const invite = page.locator('.invite-row button').first();
    if ((await invite.count()) && Math.random() < 0.7) await invite.click();
    else if (await choices.count()) {
      const labels = await choices.allInnerTexts();
      const good = ['付き合ってほしい', '相手のプロフィールに触れて', 'LINE交換を提案', '話題を広げて', '共感して', '正直に', '先に伝える', '行きましょう', '自分のペースで', '予算感', 'このアプリで話したい', '二人で会うのでなければ', '会ってから判断', '理由を聞く', 'もう少しアプリで'];
      let idx = 0;
      for (const g of good) { const j = labels.findIndex((l) => l.includes(g)); if (j >= 0) { idx = j; break; } }
      await choices.nth(idx).click();
    }
    // 男性：有料会員でなければ課金の画面が出る
    const pay = page.locator('.sheet button', { hasText: /円を払って/ });
    if (await pay.count()) {
      if (!paywallSeen) {
        await shot(page, '05b-paywall');
        paywallSeen = true;
        const before = (await save(page))?.money.length ?? 0;
        await pay.click();
        const after = (await save(page))?.money.length ?? 0;
        check('男性：メッセージ送信前に有料会員（4,000円）の画面が出て、払うと支出に記録される', after > before, `${before}→${after}`);
      } else {
        await pay.click();
      }
    }
    await page.locator('.chat-head .link').click();
  }
  // 画面上部の「1週間すすめる」
  const before = await save(page);
  await page.locator('.advance-row button.primary').click();
  await page.waitForTimeout(100);
  await resolveModals(page, prefer);
  const after = await save(page);
  if (w === 0) check('週を進めると日数が進む', (after?.day ?? 0) > (before?.day ?? 0), `${before?.day}→${after?.day}`);
  log.push(`週${w + 1}: day ${before?.day}→${after?.day} life ${before?.life}→${after?.life} matches=${after?.stats.matches} dates=${after?.stats.dates}`);
  if (w === 1) await shot(page, '07-after-week2');
  if (after?.status !== 'playing') break;
}

s = await save(page);
check('ライフの増減が履歴に記録されている', (s?.ledger.length ?? 0) > 0, `ledger=${s?.ledger.length}`);
check('支出の記録（男性の利用料・デート代など）', (s?.money.length ?? 0) > 0 || (CHAR.startsWith('F') && (s?.stats.dates ?? 0) === 0), `money=${s?.money.length} dates=${s?.stats.dates}`);
const lifeSum = 100 + (s?.ledger ?? []).reduce((a, e) => a + e.delta, 0);
check('ライフ＝100＋台帳の合計', Math.max(0, lifeSum) === s?.life || (s?.life === 0 && lifeSum <= 0), `life=${s?.life} sum=${lifeSum}`);

if (s?.status === 'playing') {
  await page.locator('.tabbar button', { hasText: 'デート' }).click();
  await page.waitForSelector('.calendar');
  await shot(page, '07b-date-tab');
  await page.screenshot({ path: path.join(OUT, '07b-date-tab-full.png'), fullPage: true });
  check('デートタブにカレンダーが出る', (await page.locator('.cal-cell').count()) === 42);
  await page.locator('.tabbar button', { hasText: 'トーク' }).click();
  await shot(page, '05c-talk-list');
  // トークは1つの一覧。LINE・外部サイトは行の背景色で区別し、最新のやり取り順に並ぶ
  const lineRows = await page.locator('.talk-list:not(.dim) .talk-row.ch-line, .talk-list:not(.dim) .talk-row.ch-external').count();
  const cs = Object.values(s.contacts);
  const outside = cs.filter((c) => c.stage !== 'ended' && (c.lineExchanged || typeof c.flags?.sakuraStart === 'number')).length;
  const declined = cs.filter((c) => c.flags?.lineDeclined).length;
  check('LINE・外部サイトの行（背景色）が保存データの件数と一致', lineRows === outside, `画面${lineRows}件／交換済み${outside}件（断られた${declined}件）`);
  const bgs = await page.locator('.talk-list:not(.dim) .talk-row').evaluateAll((els) => els.map((e) => `${e.className.includes('ch-line') ? 'line' : e.className.includes('ch-external') ? 'ext' : 'app'}:${getComputedStyle(e).backgroundColor}`));
  const appBg = new Set(bgs.filter((b) => b.startsWith('app')).map((b) => b.split(':')[1]));
  const lineBg = new Set(bgs.filter((b) => b.startsWith('line')).map((b) => b.split(':')[1]));
  check('LINEの行はアプリの行と背景色が違う', lineRows === 0 || [...lineBg].every((b) => !appBg.has(b)), [...lineBg, ...appBg].join(' / '));
  // 並び順：最後のやり取りが新しい順（未読・返信待ちを先にしない）
  const lastDays = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('machiapu-sim:save:v1') ?? '{}');
    const out: Record<string, number> = {};
    for (const c of Object.values(st.contacts ?? {}) as { npcId: string; messages: { day: number }[]; matchedDay?: number; createdDay: number }[]) {
      out[c.npcId] = c.messages.at(-1)?.day ?? c.matchedDay ?? c.createdDay;
    }
    return out;
  });
  const rowIds = await page.locator('.talk-list:not(.dim) .talk-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-npc') ?? ''));
  const seq = rowIds.map((id) => lastDays[id] ?? -1);
  check('トークは最新のやり取り順', seq.every((d, i) => i === 0 || d <= seq[i - 1]), seq.join(','));
  check('トークにタブの切り替えがない', (await page.locator('.talk .talk-switch').count()) === 0);
  const curt = cs.reduce((a, c) => a + Number(c.flags?.curtReplies ?? 0), 0);
  check('話を広げない返事（「はい」「そうなんですね」など）が混ざる', curt > 0, `${curt}回`);
  if (lineRows > 0) {
    await page.locator('.talk-list:not(.dim) .talk-row.ch-line, .talk-list:not(.dim) .talk-row.ch-external').first().click();
    await page.waitForSelector('.chat');
    await shot(page, '05d-line-chat');
    await page.locator('.chat-head .link').click();
  }
  // ライフの説明：ライフをタップすると減ること・回復することが出る（数字は出さない）
  await page.locator('.status-bar .life').click();
  await page.waitForSelector('.life-list');
  const lifeText = await page.locator('.sheet').innerText();
  check('ライフをタップすると減る要因が出る（数字なし）', lifeText.includes('減りやすいこと') && !/[0-9０-９]+(点|ポイント)|−\s*[0-9]/.test(lifeText), lifeText.slice(0, 40).replace(/\n/g, ' '));
  await shot(page, '02c-life-sheet');
  await page.locator('.sheet-head .link').click();
}
await page.locator('.tabbar button', { hasText: 'マイページ' }).click().catch(() => undefined);
await shot(page, '08-mypage');
check('横スクロールなし（プレイ画面）', (await overflowX(page)) <= 0, `overflow=${await overflowX(page)}`);
if (s?.status !== 'playing') await shot(page, '09-result');

// 結果画面：エンジンで最後まで自動プレイした保存データを読み込んで表示する（失敗とクリアを1つずつ）
const { playBot } = await import('../src/engine/bot');
const { serialize } = await import('../src/engine/save');
for (const [label, id, seed, strategy] of [['gameover', 'M08', 'res-1', 'wide'], ['cleared', 'F03', 'res-2', 'focus']] as const) {
  let fin = playBot(id, seed, { strategy });
  for (let k = 2; fin.status !== label && k < 40; k++) fin = playBot(id, `res-${k}`, { strategy });
  await page.evaluate((json) => localStorage.setItem('machiapu-sim:save:v1', json), serialize(fin));
  await page.goto(BASE);
  await page.locator('button', { hasText: '前回の続きから' }).click();
  await page.waitForSelector('.result');
  await shot(page, `10-result-${label}`);
  await page.screenshot({ path: path.join(OUT, `10-result-${label}-full.png`), fullPage: true });
  check(`結果画面（${label}）を表示`, (await page.locator('.result h1').innerText()).length > 0, `${id} day=${fin.day}`);
  check(`横スクロールなし（結果画面 ${label}）`, (await overflowX(page)) <= 0);
}

fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ char: CHAR, seed: SEED, width: WIDTH, checks, log, errors, final: s && { day: s.day, life: s.life, status: s.status, stats: s.stats } }, null, 2), 'utf8');
check('コンソールエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`保存先: ${OUT}`);
