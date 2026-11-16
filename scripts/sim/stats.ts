// 確率の検証：比較条件を仕様の基準に揃え、複数シード・十分な試行数で集計する。
// 1) 基準マッチ率（未接触の相手50人に送ったときの相互マッチ）  2) 写真公開の前後差（6人）
// 3) 対面後のお断り率（通常NPCとの初回対面のみ）  4) 相手目的の配合  5) 受信いいね/30日
// 使い方: npm run sim:stats -- [--seeds 200] [--out docs/検証結果_確率.md]
import fs from 'node:fs';
import path from 'node:path';
import { newGame } from '../../src/engine/actions';
import { CHARACTERS, getCharacter } from '../../src/engine/data/characters';
import { SPEC_PURPOSE_MIX, PURPOSE_LABEL, isNormalPurpose } from '../../src/engine/data/rules';
import { decidePostFirstDate } from '../../src/engine/dates';
import { receiveLikesDaily, sendLike, sendProbability } from '../../src/engine/matching';
import { inBasePool } from '../../src/engine/npc';
import { createNpc, ensureContact, storeNpc } from '../../src/engine/state';
import type { GameState, Purpose } from '../../src/engine/types';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const SEEDS = Number(arg('seeds', '200'));
const OUT = arg('out', '');

function meanSd(xs: number[]): { mean: number; sd: number } {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean: m, sd: Math.sqrt(v) };
}
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

/** 基準候補群の未接触の相手に50件送ったときのマッチ人数（1シード分） */
function fiftySends(id: string, seed: string, photoPublic: boolean): { matches: number; expected: number } {
  const s = newGame(id, seed);
  if (photoPublic) s.player.photoVisible = true;
  let matches = 0;
  let expected = 0;
  let sent = 0;
  while (sent < 50) {
    const npc = createNpc(s, 'search');
    if (!inBasePool(npc, s.player.age, getCharacter(id).baseDistanceMin)) continue;
    storeNpc(s, npc);
    s.likesLeft = 99;
    expected += sendProbability(s, npc);
    sendLike(s, npc.id);
    if (s.contacts[npc.id]?.likeWillMatch) matches++;
    sent++;
  }
  return { matches, expected };
}

const lines: string[] = [];
const out = (l = '') => { lines.push(l); console.log(l); };

out('# 検証結果：確率の集計（シード複数・ゲーム内の設定値との比較）');
out();
out(`生成日時：${new Date().toISOString()}／シード数 ${SEEDS}。**すべてゲーム用の仮設定であり、現実の統計ではありません。**`);
out('比較条件：年齢±5歳・片道60分以内（秩父在住のM07は120分以内）・活動中の相手・初期写真・露出課金なし・未接触の相手へ50件送信（仕様§6）。各回で期待件数ぴったりになる作りにはしていません。');
out();
out('## 1. 基準マッチ率（50件送信→相互マッチ人数）');
out();
out('| 人物 | 設定：送信成立率 | 設定：期待マッチ人数 | 実測：平均人数 | 実測：シード間SD | 実測：成立率 | 母数（送信件数） |');
out('|---|---:|---:|---:|---:|---:|---:|');
for (const ch of CHARACTERS) {
  const ms: number[] = [];
  for (let i = 0; i < SEEDS; i++) ms.push(fiftySends(ch.id, `stat-${ch.id}-${i}`, false).matches);
  const { mean, sd } = meanSd(ms);
  out(`| ${ch.id} ${ch.name} | ${pct(ch.rates.sendSuccess)} | ${(ch.rates.sendSuccess * 50).toFixed(2)} | ${mean.toFixed(2)} | ${sd.toFixed(2)} | ${pct(mean / 50, 2)} | ${SEEDS * 50} |`);
}

out();
out('## 2. 顔写真なし→公開の前後差（同じ人物・同じ条件）');
out();
out('| 人物 | 設定：成立率 なし→公開 | 実測：なし | 実測：公開 | 設定：対面後お断り なし→公開 | 実測：顔を知らずに会った | 実測：写真で顔を知って会った | 公開時に既存の相手が離れた割合（設定から導出→実測） |');
out('|---|---|---:|---:|---|---:|---:|---|');
for (const ch of CHARACTERS.filter((c) => !c.photoInitiallyVisible)) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < SEEDS; i++) {
    a.push(fiftySends(ch.id, `photo-${ch.id}-${i}`, false).matches);
    b.push(fiftySends(ch.id, `photo-${ch.id}-${i}`, true).matches);
  }
  // 対面後お断り（通常NPCのみ）
  const s = newGame(ch.id, `rej-${ch.id}`);
  let hidden = 0, hiddenN = 0, known = 0, knownN = 0;
  for (let i = 0; i < 4000; i++) {
    const npc = createNpc(s, 'search');
    if (!isNormalPurpose(npc.purpose)) continue;
    storeNpc(s, npc);
    const c = ensureContact(s, npc.id, false);
    c.flags.rejMult = 1;
    const faceKnown = i % 2 === 0;
    c.flags.faceWasKnownBeforeDate = faceKnown;
    decidePostFirstDate(s, c, npc);
    if (faceKnown) { knownN++; if (c.postDateDecision === 'reject') known++; } else { hiddenN++; if (c.postDateDecision === 'reject') hidden++; }
  }
  // 公開時の離脱
  const t = newGame(ch.id, `leave-${ch.id}`);
  t.day = 14;
  let left = 0, total = 0;
  for (let i = 0; i < 3000; i++) {
    const npc = createNpc(t, 'search');
    if (!isNormalPurpose(npc.purpose)) continue;
    storeNpc(t, npc);
    const c = ensureContact(t, npc.id, false);
    c.stage = 'talking';
    c.twoWay = true;
    c.faceKnown = false;
    total++;
  }
  const { publishPhoto } = await import('../../src/engine/chat');
  publishPhoto(t);
  for (const c of Object.values(t.contacts)) if (c.photoJudgement === 'left') left++;
  const pub = ch.ratesPhotoPublic!;
  const d = 1 - (1 - ch.rates.postDateRejection) / (1 - pub.postDateRejection);
  out(`| ${ch.id} ${ch.name} | ${pct(ch.rates.sendSuccess)}→${pct(pub.sendSuccess)} | ${pct(meanSd(a).mean / 50, 2)} | ${pct(meanSd(b).mean / 50, 2)} | ${pct(ch.rates.postDateRejection, 0)}→${pct(pub.postDateRejection, 0)} | ${pct(hidden / hiddenN)}（n=${hiddenN}） | ${pct(known / knownN)}（n=${knownN}） | ${pct(d)}→${pct(left / total)}（n=${total}） |`);
}

out();
out('## 3. 対面後のお断り率（写真公開済みの人物、通常NPCとの初回対面のみ。会話・会計の選択による補正なし）');
out();
out('| 人物 | 設定 | 実測 | 母数 | 判定から除外したNPC（目的偽装） |');
out('|---|---:|---:|---:|---:|');
for (const ch of CHARACTERS.filter((c) => c.photoInitiallyVisible)) {
  const s = newGame(ch.id, `rej2-${ch.id}`);
  let n = 0, r = 0, excluded = 0;
  for (let i = 0; i < 3000; i++) {
    const npc = createNpc(s, 'search');
    storeNpc(s, npc);
    const c = ensureContact(s, npc.id, false);
    c.flags.rejMult = 1;
    c.flags.faceWasKnownBeforeDate = true;
    decidePostFirstDate(s, c, npc);
    if (!isNormalPurpose(npc.purpose)) { excluded++; if (c.postDateDecision) throw new Error('目的偽装NPCに判定がついた'); continue; }
    n++;
    if (c.postDateDecision === 'reject') r++;
  }
  out(`| ${ch.id} ${ch.name} | ${pct(ch.rates.postDateRejection, 0)} | ${pct(r / n)} | ${n} | ${excluded} |`);
}

out();
out('## 4. 相手の主目的の配合（候補NPC数が分母）');
out();
for (const [label, id] of [['男性プレイの相手候補', 'M05'], ['女性プレイの相手候補', 'F03']] as const) {
  const s: GameState = newGame(id, `mix-${id}`);
  const counts: Record<string, number> = {};
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const npc = createNpc(s, 'search');
    counts[npc.purpose] = (counts[npc.purpose] ?? 0) + 1;
  }
  const mix = id === 'M05' ? SPEC_PURPOSE_MIX.forMalePlayer : SPEC_PURPOSE_MIX.forFemalePlayer;
  out(`### ${label}（N=${N.toLocaleString()}）`);
  out();
  out('| 主目的 | 設定 | 実測 |');
  out('|---|---:|---:|');
  for (const [p, w] of mix) out(`| ${PURPOSE_LABEL[p as Purpose]} | ${w}% | ${pct((counts[p] ?? 0) / N, 2)} |`);
  out();
}

out('## 5. 受信いいね／30日（30日ごとに幅の中から期待件数を決め、日ごとにポアソンで到着）');
out();
out('| 人物 | 設定の幅 | 実測：平均 | 実測：最小〜最大 | シード数 |');
out('|---|---|---:|---|---:|');
for (const ch of CHARACTERS) {
  const xs: number[] = [];
  for (let i = 0; i < Math.min(SEEDS, 200); i++) {
    const s = newGame(ch.id, `recv-${ch.id}-${i}`);
    for (let d = 0; d < 30; d++) { s.day++; receiveLikesDaily(s); }
    xs.push(s.received.total);
  }
  out(`| ${ch.id} ${ch.name} | ${ch.rates.receivedPer30[0]}〜${ch.rates.receivedPer30[1]} | ${meanSd(xs).mean.toFixed(1)} | ${Math.min(...xs)}〜${Math.max(...xs)} | ${xs.length} |`);
}

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), lines.join('\n') + '\n', 'utf8');
  console.log(`\n保存: ${OUT}`);
}
