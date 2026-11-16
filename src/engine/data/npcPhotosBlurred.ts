// 顔をぼかした写真・アニメ風イラスト（2026-11-12 ユーザーが public に追加した44枚）。顔写真なしの相手として使う。
// 性別と種類は目視、年齢と設定（職業・年収・学歴・趣味）は Gemini（gemini-3.8-flash）の仮決め（scripts/photos/classify-blurred.ts）。
// 容姿は顔写真なしの素材と同じく3。元の画像（../顔ぼかし_元画像）は 2026-11-15 に指示で削除した。
import type { PhotoTemplate } from './npcPhotos';

/** 男性NPC（20枚） */
export const BLURRED_MALE_PHOTOS: PhotoTemplate[] = [
  { id: 'z001', file: 'z001.jpg', age: 31, looks: 3, faceVisible: false, job: 'Webデザイナー', income: [450, 550], education: 'vocational', hobbies: ['カフェ巡り','古着屋巡り','写真撮影'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z002', file: 'z002.jpg', age: 29, looks: 3, faceVisible: false, job: '金融機関総合職', income: [550, 650], education: 'univ', hobbies: ['ゴルフ','美術館巡り','ドライブ'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z003', file: 'z003.jpg', age: 26, looks: 3, faceVisible: false, job: '出版社編集アシスタント', income: [380, 450], education: 'univ', hobbies: ['読書','喫茶店開拓','映画鑑賞'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z004', file: 'z004.jpg', age: 33, looks: 3, faceVisible: false, job: '食品メーカー営業', income: [580, 680], education: 'univ', hobbies: ['ランニング','スポーツ観戦','バーベキュー'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z005', file: 'z005.jpg', age: 27, looks: 3, faceVisible: false, job: 'システムエンジニア', income: [480, 580], education: 'univ', hobbies: ['ゲーム','自炊','スノーボード'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z006', file: 'z006.jpg', age: 35, looks: 3, faceVisible: false, job: '住宅メーカー設計職', income: [600, 750], education: 'univ', hobbies: ['DIY','キャンプ','温泉巡り'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z007', file: 'z007.jpg', age: 25, looks: 3, faceVisible: false, job: '人材系企業営業', income: [400, 480], education: 'univ', hobbies: ['サウナ','街歩き','居酒屋開拓'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z008', file: 'z008.jpg', age: 29, looks: 3, faceVisible: false, job: '広告代理店プランナー', income: [520, 650], education: 'top', hobbies: ['国内旅行','ドライブ','サーフィン'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z009', file: 'z009.jpg', age: 28, looks: 3, faceVisible: false, job: 'ITコンサルタント', income: [600, 720], education: 'top', hobbies: ['筋トレ','グルメ巡り','インテリア収集'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z010', file: 'z010.jpg', age: 30, looks: 3, faceVisible: false, job: '地方公務員（市役所）', income: [450, 520], education: 'univ', hobbies: ['サイクリング','釣り','音楽鑑賞'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z011', file: 'z011.jpg', age: 26, looks: 3, faceVisible: false, job: 'アパレルECサイト運営', income: [420, 500], education: 'univ', hobbies: ['ブックカフェ巡り','スニーカー集め','映画鑑賞'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z012', file: 'z012.jpg', age: 25, looks: 3, faceVisible: false, job: '広告代理店営業', income: [400, 460], education: 'univ', hobbies: ['古着屋巡り','サウナ','スニーカー収集'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z013', file: 'z013.jpg', age: 27, looks: 3, faceVisible: false, job: 'Webディレクター', income: [480, 550], education: 'univ', hobbies: ['カフェ巡り','カメラ','ドライブ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z014', file: 'z014.jpg', age: 29, looks: 3, faceVisible: false, job: '飲料メーカー企画', income: [550, 620], education: 'top', hobbies: ['クラフトビール','料理','映画鑑賞'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z015', file: 'z015.jpg', age: 33, looks: 3, faceVisible: false, job: 'システムエンジニア', income: [620, 700], education: 'univ', hobbies: ['観葉植物','キャンプ','筋トレ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z016', file: 'z016.jpg', age: 31, looks: 3, faceVisible: false, job: '地方公務員', income: [500, 560], education: 'univ', hobbies: ['温泉旅行','御朱印集め','散歩'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z017', file: 'z017.jpg', age: 28, looks: 3, faceVisible: false, job: '人材系キャリアアドバイザー', income: [450, 520], education: 'univ', hobbies: ['音楽フェス','ホテルラウンジ巡り','フットサル'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z018', file: 'z018.jpg', age: 26, looks: 3, faceVisible: false, job: '化学メーカー研究開発', income: [440, 500], education: 'grad', hobbies: ['河川敷ランニング','ロードバイク','読書'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z020', file: 'z020.jpg', age: 26, looks: 3, faceVisible: false, job: 'インテリアコーディネーター', income: [380, 430], education: 'vocational', hobbies: ['家具屋巡り','ハンドドリップコーヒー','ラジオ鑑賞'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z022', file: 'z022.jpg', age: 24, looks: 3, faceVisible: false, job: '保育士', income: [320, 370], education: 'vocational', hobbies: ['イラスト制作','アコースティックギター','パン屋巡り'], illustration: true, note: '顔ぼかし素材・イラスト' },
];

/** 女性NPC（24枚） */
export const BLURRED_FEMALE_PHOTOS: PhotoTemplate[] = [
  { id: 'z019', file: 'z019.jpg', age: 27, looks: 3, faceVisible: false, job: '出版社の編集アシスタント', income: [340, 400], education: 'univ', hobbies: ['純喫茶巡り','ベーグル作り','古本収集'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z021', file: 'z021.jpg', age: 30, looks: 3, faceVisible: false, job: '校正・校閲スタッフ', income: [360, 420], education: 'univ', hobbies: ['海外文学の読書','紅茶専門店巡り','美術館鑑賞'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z023', file: 'z023.jpg', age: 27, looks: 3, faceVisible: false, job: 'メーカー事務', income: [350, 420], education: 'univ', hobbies: ['散歩','パン屋巡り','ヨガ'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z024', file: 'z024.jpg', age: 26, looks: 3, faceVisible: false, job: '保育士', income: [320, 380], education: 'vocational', hobbies: ['カフェ巡り','お菓子作り','観葉植物の手入れ'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z025', file: 'z025.jpg', age: 31, looks: 3, faceVisible: false, job: 'Webデザイナー', income: [420, 500], education: 'univ', hobbies: ['美術館巡り','写真撮影','映画鑑賞'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z026', file: 'z026.jpg', age: 29, looks: 3, faceVisible: false, job: '図書館司書', income: [300, 360], education: 'univ', hobbies: ['古本屋巡り','寺社仏閣巡り','陶芸'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z027', file: 'z027.jpg', age: 33, looks: 3, faceVisible: false, job: '広報・PR担当', income: [480, 560], education: 'univ', hobbies: ['ワイン','舞台鑑賞','ピラティス'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z028', file: 'z028.jpg', age: 28, looks: 3, faceVisible: false, job: '社内SE（ヘルプデスク）', income: [380, 450], education: 'vocational', hobbies: ['ゲーム','アニメ鑑賞','動画編集'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z029', file: 'z029.jpg', age: 29, looks: 3, faceVisible: false, job: '旅行代理店スタッフ', income: [360, 430], education: 'univ', hobbies: ['国内旅行','食べ歩き','語学学習'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z030', file: 'z030.jpg', age: 25, looks: 3, faceVisible: false, job: '出版社校正スタッフ', income: [320, 380], education: 'univ', hobbies: ['読書','紅茶集め','文房具収集'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z031', file: 'z031.jpg', age: 26, looks: 3, faceVisible: false, job: 'アパレル販売員', income: [280, 340], education: 'vocational', hobbies: ['ショッピング','古着屋巡り','音楽フェス'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z032', file: 'z032.jpg', age: 24, looks: 3, faceVisible: false, job: 'ECサイト運営スタッフ', income: [300, 350], education: 'univ', hobbies: ['サイクリング','キャンプ','キャンプ飯作り'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z033', file: 'z033.jpg', age: 27, looks: 3, faceVisible: false, job: '医療事務', income: [310, 370], education: 'vocational', hobbies: ['料理','日帰り温泉','植物園散策'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z034', file: 'z034.jpg', age: 28, looks: 3, faceVisible: false, job: 'WEB広告代理店運用担当', income: [400, 480], education: 'univ', hobbies: ['ドライブ','海沿いカフェ巡り','ピラティス'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z035', file: 'z035.jpg', age: 29, looks: 3, faceVisible: false, job: 'ゲーム会社デザイナー', income: [380, 450], education: 'vocational', hobbies: ['喫茶店巡り','イラスト制作','脱出ゲーム'], illustration: true, note: '顔ぼかし素材・イラスト' },
  { id: 'z036', file: 'z036.jpg', age: 26, looks: 3, faceVisible: false, job: 'IT企業一般事務', income: [320, 380], education: 'univ', hobbies: ['韓国ドラマ鑑賞','パン屋巡り','スキンケア集め'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z037', file: 'z037.jpg', age: 31, looks: 3, faceVisible: false, job: '医療事務', income: [300, 360], education: 'vocational', hobbies: ['寺社巡り','御朱印集め','和菓子食べ歩き'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z038', file: 'z038.jpg', age: 27, looks: 3, faceVisible: false, job: 'アパレル販売員', income: [280, 340], education: 'vocational', hobbies: ['古着屋巡り','音楽フェス','フィルムカメラ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z039', file: 'z039.jpg', age: 33, looks: 3, faceVisible: false, job: '不動産会社経理', income: [420, 500], education: 'univ', hobbies: ['お菓子作り','宅飲み','観葉植物の手入れ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z040', file: 'z040.jpg', age: 30, looks: 3, faceVisible: false, job: '書店員・文具担当', income: [280, 350], education: 'univ', hobbies: ['読書','ブックカフェ巡り','美術館巡り'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z041', file: 'z041.jpg', age: 25, looks: 3, faceVisible: false, job: '旅行代理店カウンター営業', income: [330, 400], education: 'univ', hobbies: ['一人旅','散歩','スパイスカレー巡り'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z042', file: 'z042.jpg', age: 34, looks: 3, faceVisible: false, job: 'メーカー人事採用担当', income: [450, 530], education: 'univ', hobbies: ['ヨガ','ワインバル開拓','テラスランチ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z043', file: 'z043.jpg', age: 24, looks: 3, faceVisible: false, job: '保育士', income: [270, 330], education: 'vocational', hobbies: ['河川敷の散歩','水族館巡り','カラオケ'], note: '顔ぼかし素材・顔をぼかした写真' },
  { id: 'z044', file: 'z044.jpg', age: 28, looks: 3, faceVisible: false, job: '美容系ライター・広報', income: [350, 430], education: 'univ', hobbies: ['コスメ収集','アフタヌーンティー','サウナ'], note: '顔ぼかし素材・顔をぼかした写真' },
];
