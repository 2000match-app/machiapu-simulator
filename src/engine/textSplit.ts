// 1通1文に分ける（2026-11-11 ユーザー指示：メッセージは1送信1文、1回の返信は3文まで）。
// どこからでも使えるよう、ほかのモジュールに依存しない。

/** 1通1文に分ける（「。」「！」「？」「…」「笑」と、その後の絵文字・記号までで1文）。最大 max 通 */
export function splitSentences(text: string, max = 3): string[] {
  // 生成した文は空白で文をつないでいるので、まず空白で区切り、その中を文末の記号で区切る
  const parts: string[] = [];
  for (const chunk of text.trim().split(/[\s　]+/)) {
    // 顔文字の中の空白（「( ⁎ᵕᴗᵕ⁎ )」など）で分かれた記号だけのかけらは、前の文に付ける
    if (parts.length > 0 && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9０-９]/u.test(chunk)) {
      parts[parts.length - 1] += chunk;
      continue;
    }
    const found = chunk.match(/.*?(?:[。！？!?…]+|笑(?:[。！？!?]+|(?=$)))[笑〜ー…\p{Extended_Pictographic}️‍」）)]*|.+$/gu) ?? [chunk];
    for (const s of found) if (s.trim()) parts.push(s.trim());
  }
  if (parts.length <= max) return parts;
  // 多すぎるときは、最初の文と最後の文（質問であることが多い）を残し、間を落とす
  return [...parts.slice(0, max - 1), parts[parts.length - 1]];
}

export function isQuestion(s: string): boolean {
  return /[？?][\p{Extended_Pictographic}️‍笑〜ー]*$/u.test(s.trim());
}
