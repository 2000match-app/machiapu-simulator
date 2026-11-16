// 相手NPCの生成に使う素材（名前・職業・趣味・自己紹介）。すべて架空。
import type { UniversityGroup } from '../types';

export const FEMALE_NAMES = [
  'ゆい', 'さき', 'まい', 'あやか', 'みく', 'なつみ', 'はるか', 'えり', 'ちか', 'まな',
  'りさ', 'かな', 'あかり', 'ゆか', 'しおり', 'みずき', 'なな', 'あい', 'めぐみ', 'ひなた',
  'ともみ', 'さやか', 'かほ', 'まりこ', 'ゆうこ', 'あすか', 'のぞみ', 'まゆこ', 'れい', 'えみ',
  'みほ', 'ちなつ', 'あやの', 'ゆきな', 'さとみ', 'かおり', 'みさと', 'ひとみ', 'りな', 'まどか',
  'ユミ', 'アヤ', 'ミナ', 'サラ', 'エマ', 'Haru', 'Yuki', 'Mio', 'Kana', 'Rin',
];

export const MALE_NAMES = [
  'たくや', 'しょうた', 'ゆうき', 'だいき', 'けんた', 'りょうた', 'こうへい', 'まさと', 'しゅん', 'ひろき',
  'なおき', 'ゆうすけ', 'たけし', 'かずき', 'そうた', 'はやと', 'まこと', 'じゅん', 'よしき', 'とおる',
  'こうじ', 'あつし', 'しんや', 'ともや', 'ゆうや', 'かいと', 'りく', 'たいが', 'しんご', 'まさき',
  'ケンジ', 'ヒロ', 'ユウ', 'ショウ', 'ダイ', 'Taku', 'Ryo', 'Kei', 'Sho', 'Jun',
];

export interface JobDef {
  name: string;
  income: [number, number]; // 万円
  weight: number;
  prestige: number; // 0..1（人気スコアへの寄与。男性NPCのみ）
}

export const MALE_JOBS: JobDef[] = [
  { name: '会社員（営業）', income: [350, 650], weight: 14, prestige: 0.4 },
  { name: '会社員（事務・企画）', income: [320, 550], weight: 12, prestige: 0.35 },
  { name: 'エンジニア', income: [420, 850], weight: 11, prestige: 0.5 },
  { name: '公務員', income: [400, 650], weight: 8, prestige: 0.5 },
  { name: 'メーカー勤務', income: [380, 700], weight: 9, prestige: 0.45 },
  { name: '医療職', income: [400, 650], weight: 4, prestige: 0.5 },
  { name: '教員', income: [400, 620], weight: 3, prestige: 0.45 },
  { name: '販売・サービス', income: [260, 400], weight: 7, prestige: 0.2 },
  { name: '飲食店勤務', income: [250, 380], weight: 4, prestige: 0.2 },
  { name: '製造・技術職', income: [300, 500], weight: 6, prestige: 0.3 },
  { name: '自営業', income: [300, 900], weight: 4, prestige: 0.4 },
  { name: 'フリーランス', income: [280, 800], weight: 3, prestige: 0.35 },
  { name: '外資系金融', income: [900, 1800], weight: 1.5, prestige: 0.9 },
  { name: 'コンサルタント', income: [700, 1400], weight: 2, prestige: 0.8 },
  { name: '経営者', income: [600, 2000], weight: 2, prestige: 0.8 },
  { name: '医師', income: [1000, 1900], weight: 1.2, prestige: 0.95 },
  { name: '弁護士', income: [800, 1500], weight: 0.6, prestige: 0.9 },
  { name: '大手商社', income: [800, 1500], weight: 1.2, prestige: 0.85 },
  { name: '非正規・アルバイト', income: [180, 300], weight: 5, prestige: 0.1 },
];

export const FEMALE_JOBS: JobDef[] = [
  { name: '会社員（事務）', income: [270, 420], weight: 16, prestige: 0 },
  { name: '会社員（営業）', income: [320, 520], weight: 7, prestige: 0 },
  { name: '看護師', income: [400, 560], weight: 7, prestige: 0 },
  { name: '保育士', income: [270, 380], weight: 5, prestige: 0 },
  { name: '販売職', income: [240, 340], weight: 8, prestige: 0 },
  { name: '公務員', income: [350, 560], weight: 6, prestige: 0 },
  { name: '教員', income: [380, 560], weight: 3, prestige: 0 },
  { name: '医療事務', income: [240, 320], weight: 4, prestige: 0 },
  { name: '美容関係', income: [240, 380], weight: 5, prestige: 0 },
  { name: 'IT・Web', income: [380, 650], weight: 5, prestige: 0 },
  { name: '薬剤師', income: [450, 620], weight: 2, prestige: 0 },
  { name: '受付・秘書', income: [280, 450], weight: 3, prestige: 0 },
  { name: '大手企業勤務', income: [450, 800], weight: 4, prestige: 0 },
  { name: 'フリーランス', income: [240, 550], weight: 2, prestige: 0 },
  { name: 'パート・アルバイト', income: [120, 220], weight: 5, prestige: 0 },
  { name: '経営者', income: [500, 1200], weight: 0.7, prestige: 0 },
];

export const UNIVERSITIES: Record<UniversityGroup, string[]> = {
  旧帝大: ['東京大学', '京都大学', '大阪大学', '東北大学', '名古屋大学', '九州大学', '北海道大学'],
  早慶: ['早稲田大学', '慶應義塾大学'],
  MARCH: ['明治大学', '青山学院大学', '立教大学', '中央大学', '法政大学'],
  日東駒専: ['日本大学', '東洋大学', '駒澤大学', '専修大学'],
  大東亜帝国: ['大東文化大学', '東海大学', '亜細亜大学', '帝京大学', '国士舘大学'],
  産近甲龍: ['京都産業大学', '近畿大学', '甲南大学', '龍谷大学'],
};

export const UNIVERSITY_GROUP_WEIGHTS: [UniversityGroup, number][] = [
  ['旧帝大', 7], ['早慶', 9], ['MARCH', 22], ['日東駒専', 28], ['大東亜帝国', 20], ['産近甲龍', 14],
];

export const HOBBIES = [
  'カフェ巡り', '映画', '料理', '旅行', '筋トレ', 'ランニング', '読書', '音楽フェス', 'キャンプ', 'サウナ',
  'ゲーム', 'アニメ', '写真', '美術館', '温泉', 'お酒', 'ドライブ', '釣り', 'ヨガ', '漫画',
  '野球観戦', 'サッカー観戦', '登山', '散歩', 'ボードゲーム', '韓国ドラマ', 'パン屋巡り', 'ライブ', '水族館', '料理教室',
];

/** 自己紹介文。目的ごとに偏りはあるが、文面だけで正体が分からないよう共通文も混ぜる */
export const PROFILE_TEXTS = {
  common: [
    'はじめまして。休日は{h1}や{h2}をして過ごしています。まずはメッセージで仲良くなれたら嬉しいです。',
    '友人に勧められて始めました。{h1}が好きです。気軽にいいねください。',
    '仕事は{job}をしています。落ち着いて話せる方と出会えたらと思っています。',
    'のんびりした性格です。{h1}の話ができる人だと嬉しいです！',
    'プロフィールを見てくださりありがとうございます。{h1}と{h2}が好きです。',
  ],
  serious: [
    '真剣にお付き合いできる方を探しています。休みの日は{h1}をしています。',
    '将来のことも考えられる方と、ゆっくり関係を作っていきたいです。',
  ],
  light: [
    'ノリが合う人と楽しく飲みに行きたいです😊 {h1}好き！',
    'フィーリング重視です。会ってみないと分からないタイプです笑',
  ],
  networking: [
    'いろいろな価値観の人と話すのが好きです。前向きな方と繋がりたいです。',
    '自分を高めることが好きで、{h1}や勉強会によく行きます。',
  ],
  shy: [
    '最近始めたばかりで慣れていません。優しい人がタイプです。',
  ],
};
