// オフライン版（dist/index.html を file:// で開く）が動くかの確認。ネットワークはすべて遮断する。2026-11-13
// 使い方：npx tsx scripts/check-offline.ts [スクリーンショットの保存先]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const out = process.argv[2];
const url = pathToFileURL(path.resolve('dist/index.html')).href;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ offline: true, viewport: { width: 420, height: 860 } });
const page = await ctx.newPage();
const errors: string[] = [];
const failed: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => failed.push(r.url()));
await page.goto(url);
await page.waitForTimeout(1500);
const title = await page.title();
const chars = await page.locator('text=男性で遊ぶ').count();
const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.src.split('/').slice(-2).join('/'), ok: i.complete && i.naturalWidth > 0 })));
// キャラを選んで始められるか
await page.getByRole('button', { name: /健人.*詳細/ }).click();
await page.getByRole('button', { name: '健人ではじめる' }).click();
await page.waitForTimeout(800);
const started = await page.locator('text=プロローグ').count();
if (out) await page.screenshot({ path: out });
console.log(JSON.stringify({ title, chars, images: imgs.length, brokenImages: imgs.filter((i) => !i.ok).map((i) => i.src).slice(0, 5), started, errors: errors.slice(0, 5), failed: failed.slice(0, 5) }, null, 1));
await browser.close();
