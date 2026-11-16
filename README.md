# マチアプシミュレーター（初版・ローカル専用）

自分と異なる性別・条件でマッチングアプリを使った場合の、反応の差、断られる痛み、お金・時間・期待の消耗を体験する日本語のWebゲームです。
仕様の正本は `../シミュレーター仕様案_v0.3.md`（原本は変更していません）。

- 舞台は首都圏（東京都・埼玉県・千葉県）。男性10人・女性10人から1人を選び、探索 → マッチ → 会話 → 対面 → 交際 → 交際90日の維持 → クリア／失敗まで遊べます。
- **ゲームの起動とプレイにAPIキーは不要です。** Gemini のキーが必要なのは、画像生成とレビューの制作スクリプトだけです。
- ログイン・実際の課金・実在アプリとの接続・実際のLINE連携・公開デプロイはありません（男性の有料会員、LINE交換、外部サイトのポイント、ブロックはすべてゲーム内のお金と演出）。

## 起動

Node.js 20以上（確認環境は v24）。

```bash
npm install
```

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開きます。進行はブラウザの localStorage に自動保存されます。

```bash
npm run build
```

`dist/` に静的ファイルができます（`npm run preview` で確認）。

### 開発用ツール

- `http://localhost:5173/?dev=1` … 右下の「DEV」から、乱数シードと状態の確認、状態JSONの保存・読込、相手の内部状態の表示、**E01〜E24の再現ケース**の読み込みができます。通常プレイには表示されません。
- 選択画面の「シード」を同じにして同じ操作をすると、同じ展開になります。

## テストと検証

| コマンド | 内容 |
|---|---|
| `npm test` | ゲームロジックの自動テスト（人物データ、ルール、E01〜E24再現、較正、全20人の到達確認、再現性・保存） |
| `npm run typecheck` | 型チェック |
| `npm run sim:stats -- --out docs/検証結果_確率.md` | マッチ率・写真公開前後・対面後お断り率・目的の配合・受信いいねの集計 |
| `npm run sim:balance -- --runs 40 --out docs/検証結果_バランス.md` | 方針別・キャラ別のクリア率・日数・支出・失敗要因（自動プレイ） |
| `npm run sim:playlog -- M05:pl-1:wide` | 代表的なプレイログ（`production/playlogs/`） |
| `npm run capture:screens -- --char M05 --width 390` | 開発サーバー起動中に、Microsoft Edge（インストール済みのもの）で一連の操作・撮影・状態検証（`production/screens/`） |

確認結果は `docs/検証まとめ.md` にまとめています。

## データの編集箇所

| 内容 | ファイル |
|---|---|
| 人物20人（年齢・学歴・年収・容姿・写真・予算・生活条件・初期希望・マッチ率表・固有ルート） | `src/engine/data/characters.ts` |
| 仕様の数値（ライフ・消耗・回復・損失・配合）と仮置き値 | `src/engine/data/rules.ts`（`SPEC_`＝仕様、`TUNE_`＝仮置き） |
| E01〜E24の定義（発生条件・前兆・選択肢・結果・損失） | `src/engine/data/events.ts` |
| 会話・場面の文面 | `src/engine/data/dialogue.ts`、場面は `src/engine/dates.ts`・`relationship.ts` |
| 相手NPCの名前・職業・趣味・自己紹介 | `src/engine/data/npcPool.ts` |
| 男性NPCの写真素材と設定（写真は `public/npc/`） | `src/engine/data/npcPhotos.ts` |
| 失敗時のフィードバック | `src/engine/feedback.ts` |

仕様との対応は `docs/仕様対応表.md`、仕様にない値は `docs/仮置き値.md`、判断と提案は `docs/判断記録.md` にあります。

## 画像生成とレビュー（制作・検証用。キーが必要）

キーはソースやログに書かず、環境変数で渡します（`.env.example` 参照）。PowerShell の例：

```powershell
$env:GEMINI_API_KEY_FILE = "..\GeminiAPI.txt"
```

```bash
npm run gemini:models
```

設定中のモデル（`GEMINI_IMAGE_MODEL`＝既定 `gemini-3-pro-image`、`GEMINI_REVIEW_MODEL`＝既定 `gemini-3.8-flash`）が使えるかを確認します。

| コマンド | 内容 |
|---|---|
| `npm run gemini:generate -- --dry-run` | 対象・枚数・解像度・モデル・概算料金とプロンプトの表示（APIは呼ばない） |
| `npm run gemini:generate -- --ids M07,M05 --max-requests 4` | 生成。既に画像がある人物は重複生成しない。`--variant --note "修正点"` で派生版を別ファイルに追加（承認済みは上書きしない） |
| `npm run gemini:review-images -- --ids M07,M05,M01,F06,F03,F01` | 個別レビュー＋男女別の盲検比較（レベル・職業・収入・ファイル名を伏せ、順序を入れ替える） |
| `npx tsx scripts/gemini/review-sheet.ts` | 男女別の確認シート `production/review-sheet.html`（開発サーバー起動中は http://localhost:5173/production/review-sheet.html） |
| `npm run gemini:review-screens` | 撮影した画面のレビュー |
| `npm run gemini:review-playlog` | プレイログのレビュー |

- 人物ごとの顔立ち・髪型・服装・年齢・容姿レベルの設計（生成前の記録）：`scripts/gemini/portraitSpecs.ts`
- **アセット台帳**：`production/asset-ledger.json`（人物ID・プロンプト・モデル・設定・生成日時・試行（通信エラーの再送も課金され得る試行として記録）・ファイル・SHA-256・レビュー・承認状態）
- 生成画像：`production/portraits/ID/ID_vN.jpg`（原本）→ ゲーム表示用に `public/portraits/` へコピーし、`manifest.json` を更新
- レビュー結果：`production/reviews/*.json`

### 画像の現状

- 初回の比較用6枚（M07・M05・M01・F06・F03・F01）を生成・レビュー済み。**ユーザーの確認待ち**（台帳上は `awaiting_user_review`）。
- 残り14人は、6枚の描き分けの確認後に制作します。それまでキャラ選択では仮のシルエットを表示します。
- **相手NPCの画像は制作していません**（共通アイコンと「写真あり・外見3/5」などの文字表示）。

## ディレクトリ

```
src/engine/   ゲームエンジン（状態・乱数・マッチ・会話・デート・交際・精算・フィードバック・保存）とテスト
src/ui/       画面（選択・さがす（スワイプカード＋2列一覧）・いいね（もらった／送った）・トーク（アプリ／LINE・外部サイト）・デート（カレンダーと感触）・マイページ・場面・結果・お知らせ・開発用）
scripts/gemini/ 画像生成・レビュー（Interactions API）
scripts/sim/  統計・バランス・プレイログ
production/   アセット台帳・画像原本・レビュー・撮影画面（制作物）
docs/         対応表・仮置き値・判断記録・検証結果
```
