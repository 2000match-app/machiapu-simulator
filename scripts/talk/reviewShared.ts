// トークパック第2版の点検（review-talk-v2.ts）と書き直し（fix-flagged-v2.ts）で共通に使うもの（2026-11-23）。
// 差し込みの例の値は、ゲームの実際の値（src/engine/profileDetails.ts など）に合わせる。
import { loadOpenAiKey } from '../gemini/client';

/** 差し込みに入れて見せる値（2通り。どちらでも自然かを見る） */
export const SAMPLE: Record<string, [string, string]> = {
  hobby: ['カフェ巡り', '筋トレ'], hobby2: ['映画', '料理'], food: ['焼肉', 'パスタ'], area: ['世田谷区', '川口市'], place: ['京都', '台湾'], job: ['看護師', 'エンジニア'], months: ['3', '6'],
  hometown: ['北海道', '埼玉県'], sibling: ['妹が1人いる長男', '姉が1人いる次女'], pet: ['猫', '犬'], drink: ['ハイボール', 'ワイン'], music: ['K-POP', '邦ロック'], show: ['韓国ドラマ', '洋画'], sport: ['ヨガ', 'ゴルフ'],
  dish: ['カレー', '肉じゃが'], club: ['吹奏楽部', 'サッカー部'], dateplace: ['水族館', '鎌倉'], name: ['ゆうき', 'さき'],
};
/** 飲まない人・運動しない人の答え（answer_alt・detail_alt）では、ゲームと同じく {drink} は飲み物、{sport} は見るスポーツ */
const ALT_SAMPLE: Record<string, [string, string]> = { drink: ['お茶', 'コーヒー'], sport: ['サッカー', '野球'] };

export function render(s: string, k: 0 | 1, at: string[] = []): string {
  const alt = at[0] === 'answer_alt' || at[0] === 'detail_alt';
  return s.replace(/\{(their_)?([a-z0-9]+)\}/g, (m, _t: string | undefined, key: string) => (alt ? ALT_SAMPLE[key]?.[k] : undefined) ?? SAMPLE[key]?.[k] ?? m);
}

export const KEY_MEANING = `パスの見方（話題 t、質問の番号 0・1）：
- ask.t.i.* … 相手に聞く質問 ／ answer.t.i.* … その質問に答える文 ／ detail.t.i.* … 深掘りの質問への答え ／ answer_alt・detail_alt … 一人っ子（family）・ペットを飼っていない・お酒を飲まない・運動していない人の答え（family の answer・detail は兄弟がいる人。answer_alt・detail_alt の {drink} はお酒以外のよく飲む飲み物、{sport} は見るのが好きなスポーツ、{pet} は好きな動物）
- media.0 は音楽の質問、media.1 は映画・ドラマの質問。{music} は音楽のジャンル、{show} は映画・ドラマのジャンル
- react.t.* … 相手の答えへの受け止め（中身に触れない）／ react_fact.t.* … 相手の答えの中身に触れる受け止め ／ curt_short … そっけない短い答え
- bridge … 話題を変える前置き（後ろに質問が続く）／ late_sorry … 返信が遅れたお詫び ／ invite_accept … 会う誘いへの承諾 ／ invite_busy … 予定が合わないお断り
- self_talk … つい長く語った答え ／ dodge … はぐらかす答え ／ dig … 深掘りの質問 ／ intro … 最初のメッセージの自己紹介 ／ ask_back … 聞き返し`;

export const OPENAI_MODEL = process.env.OPENAI_TALK_MODEL || process.env.OPENAI_SPEC_MODEL || 'gpt-6.1-sol';

/** ChatGPT（Responses API）に JSON で答えさせる。キーは表示・保存しない */
export async function openaiJson(input: string, name: string, schema: Record<string, unknown>): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 600_000);
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loadOpenAiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, input, text: { format: { type: 'json_schema', name, schema, strict: true } } }),
      signal: ctrl.signal,
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify((j as { error?: unknown }).error ?? j).slice(0, 300)}`);
    const out = (j.output as { type: string; content?: { type: string; text?: string }[] }[] | undefined) ?? [];
    return out.flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('\n');
  } finally {
    clearTimeout(timer);
  }
}
