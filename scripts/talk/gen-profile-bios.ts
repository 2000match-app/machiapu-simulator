// プロフィールの自己紹介文の生成（2026-11-23 指示：プロフィールの細分化）。
// 性別 × 充実度（rich＝5行以上・normal＝1〜2文）× 雰囲気（serious＝真剣・light＝気軽・common＝ふつう）ごとに、何十通りも作る。
// 使い方：GEMINI_API_KEY_FILE=..\GeminiAPI.txt npx tsx scripts/talk/gen-profile-bios.ts [--force]
// 出力：../トークパック/v2/profile/bios.json（build-talk-data.ts が src/engine/data/profileBios.ts に書き出す）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callInteractions, extractText, RequestBudget, type Attempt } from '../gemini/client';
import { checkBio } from './validate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'トークパック', 'v2', 'profile', 'bios.json');
const MODEL = process.env.GEMINI_TALK_MODEL || 'gemini-4-argon';
const force = process.argv.includes('--force');

type Tone = 'serious' | 'light' | 'common';
const TONES: Record<Tone, string> = {
  serious: '真剣に恋人・結婚相手を探している人（落ち着いた丁寧な文）',
  light: '気軽に出会いを楽しみたい人（明るく軽め。チャラすぎない）',
  common: 'ふつうの人（友人に勧められて始めた・まずはメッセージから、など）',
};

function prompt(gender: 'F' | 'M', depth: 'rich' | 'normal', tone: Tone, n: number): string {
  const who = gender === 'F' ? '女性' : '男性';
  const shape = depth === 'rich'
    ? `- 1つの自己紹介は6〜8行（行は改行 \\n で区切る）。必ず「仕事」「休日の過ごし方（趣味）」「好きなタイプ」に触れ、ほかに「食べ物やお酒」「性格」「どんな関係を探しているか」などから2つ以上。
- 1行目はあいさつ（「はじめまして！」「プロフィールを見ていただきありがとうございます」など、毎回言い回しを変える）。`
    : '- 1つの自己紹介は1〜2文（改行なし）。あいさつ＋趣味、または趣味＋ひとこと程度の短いもの。';
  return `あなたはマッチングアプリ（Pairs・タップル・with）のプロフィールに詳しいライターです。首都圏のマッチングアプリの${who}のプロフィールの自己紹介文を、${n}通り作ってJSON（bios の配列）で出力してください。

# この自己紹介の人
- ${TONES[tone]}
- 年齢・職業・趣味は人によって違うので、差し込みで書く：{job}（職業名。例：会社員・看護師・エンジニア・美容師）{hobby}（趣味1。例：カフェ巡り・筋トレ・映画・サウナ・料理）{hobby2}（趣味2。例：読書・温泉・ドライブ）{food}（好きな食べ物。例：焼肉・ラーメン・パスタ）
- 差し込みは名詞なので「が・の・は・も・とか・や」で受ける。「{hobby}に行く」「{hobby}をする」のように動詞を直接付けない（どの値が入っても自然な文にする）。

# 形
${shape}
- 実際のアプリにありそうな、自然な書き言葉。${n}通りの書き出し・構成・語尾・絵文字の量をはっきり変える（同じテンプレートの使い回しにしない）。
- 休みの曜日（土日・平日）・年齢・年収・具体的な地名や店名・人名は書かない。下ネタ・連絡先・ほかのSNSへの誘導は書かない。かぎかっこ「」は使わない。
${depth === 'rich' ? '- 1行は60字くらいまで。' : ''}
JSONだけを出力してください。`;
}

async function main(): Promise<void> {
  if (fs.existsSync(OUT) && !force) { console.log('生成済み（作り直すなら --force）'); return; }
  const budget = new RequestBudget(60);
  const out: Record<string, Record<string, Record<string, string[]>>> = {};
  const jobs: [('F' | 'M'), ('rich' | 'normal'), Tone][] = [];
  for (const g of ['F', 'M'] as const) for (const d of ['rich', 'normal'] as const) for (const t of Object.keys(TONES) as Tone[]) jobs.push([g, d, t]);
  await Promise.all(jobs.map(async ([g, d, t]) => {
    const n = d === 'rich' ? 15 : 25;
    for (let round = 1; round <= 3; round++) {
      const attempts: Attempt[] = [];
      const schema = { type: 'object', properties: { bios: { type: 'array', items: { type: 'string' }, minItems: n, maxItems: n } }, required: ['bios'] };
      const res = await callInteractions({ model: MODEL, input: [{ type: 'text', text: prompt(g, d, t, n) }], response_format: { type: 'text', mime_type: 'application/json', schema } }, { budget, attempts, timeoutMs: 600_000 });
      if (!res) { console.log(`NG ${g}/${d}/${t}: 通信失敗`); continue; }
      let bios: string[];
      try { bios = (JSON.parse(extractText(res.json)) as { bios: string[] }).bios; } catch { console.log(`NG ${g}/${d}/${t}: JSONでない`); continue; }
      const good = bios.filter((b) => checkBio(b, d).length === 0);
      const bad = bios.length - good.length;
      if (good.length < n * 0.6 && round < 3) { console.log(`直す ${g}/${d}/${t}: ${bad}件が決まりに反した（例：${checkBio(bios.find((b) => checkBio(b, d).length) ?? '', d).join('・')}）`); continue; }
      ((out[g] ??= {})[d] ??= {})[t] = good;
      console.log(`OK ${g}/${d}/${t}: ${good.length}通り${bad ? `（${bad}件は落とした）` : ''}`);
      return;
    }
  }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, createdAt: new Date().toISOString(), bios: out }, null, 1), 'utf8');
  console.log(`リクエスト ${budget.used} 回`);
}

void main();
