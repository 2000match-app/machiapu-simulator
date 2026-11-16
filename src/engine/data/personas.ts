// 自動生成：../../../../人格テンプレ/P-*.json から build_game_data.mjs で作る。手で直さない（テンプレを直して作り直す）。
// トークの温度（魅力度の格差と対応タイプ）に使う部分だけ。セリフはまだ使っていない（段階3でトークパックにする）。
import type { Gender, Purpose } from '../types';

export type ResponseType = 'sync' | 'passive' | 'polite' | 'salty' | 'moody';
export interface Persona {
  id: string; label: string; gender: Gender; ageBand: [number, number]; type: ResponseType;
  /** 相手が重視すること（0〜1.5）：見た目・年収・年齢・趣味の一致 */
  weights: { looks: number; income: number; age: number; interest_match: number };
  /** 載せてよい目的（恋愛目的と、設定仕様案 §4 の目的偽装） */
  purposes: Purpose[];
  needsChildren?: boolean; needsDivorced?: boolean;
  question: 'low' | 'mid' | 'high'; politeness: 'keigo' | 'mixed' | 'casual'; emoji: 'none' | 'low' | 'mid' | 'high';
}

export const PERSONAS: Persona[] = [
  {id:"P-F01",label:"パン屋・カフェ巡り",gender:"F",ageBand:[24,45],type:"sync",weights:{looks:0.4,income:0.3,age:0.8,interest_match:1.3},purposes:["sincere","ambiguous","scam"],question:"mid",politeness:"keigo",emoji:"low"},
  {id:"P-F02",label:"週末アウトドア派",gender:"F",ageBand:[25,50],type:"sync",weights:{looks:0.6,income:0.4,age:0.7,interest_match:1.3},purposes:["sincere","ambiguous","business"],question:"high",politeness:"mixed",emoji:"mid"},
  {id:"P-F03",label:"将来を見据えた現実派",gender:"F",ageBand:[28,48],type:"sync",weights:{looks:0.6,income:1.3,age:1.2,interest_match:0.7},purposes:["sincere","ambiguous","married"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-F04",label:"推し活・ライブ好き",gender:"F",ageBand:[20,35],type:"sync",weights:{looks:1.3,income:0.4,age:0.8,interest_match:1.3},purposes:["sincere","ambiguous","sakura","profit"],question:"mid",politeness:"mixed",emoji:"high"},
  {id:"P-F05",label:"飲み好きで社交的",gender:"F",ageBand:[24,48],type:"sync",weights:{looks:0.8,income:0.6,age:0.7,interest_match:1.3},purposes:["sincere","ambiguous","profit","business","bijin","married"],question:"high",politeness:"mixed",emoji:"mid"},
  {id:"P-F06",label:"華やか志向",gender:"F",ageBand:[22,36],type:"sync",weights:{looks:1.3,income:1.4,age:0.7,interest_match:0.6},purposes:["sincere","ambiguous","profit","bijin","business"],question:"mid",politeness:"mixed",emoji:"mid"},
  {id:"P-F07",label:"別れたばかり",gender:"F",ageBand:[22,40],type:"moody",weights:{looks:0.6,income:0.5,age:0.7,interest_match:1.2},purposes:["sincere","ambiguous"],question:"mid",politeness:"mixed",emoji:"mid"},
  {id:"P-F08",label:"アプリ疲れ",gender:"F",ageBand:[30,55],type:"salty",weights:{looks:0.4,income:0.6,age:0.8,interest_match:0.9},purposes:["sincere","ambiguous","married"],question:"low",politeness:"keigo",emoji:"none"},
  {id:"P-F09",label:"句読点きっちりのインドア派",gender:"F",ageBand:[23,45],type:"passive",weights:{looks:0.4,income:0.6,age:0.8,interest_match:1.2},purposes:["sincere","ambiguous","scam"],question:"low",politeness:"keigo",emoji:"none"},
  {id:"P-F10",label:"おっとり動物好き",gender:"F",ageBand:[20,35],type:"passive",weights:{looks:0.4,income:0.3,age:0.6,interest_match:1.2},purposes:["sincere","ambiguous","sakura"],question:"low",politeness:"keigo",emoji:"high"},
  {id:"P-F11",label:"アプリ初心者",gender:"F",ageBand:[22,50],type:"passive",weights:{looks:0.4,income:0.4,age:0.8,interest_match:1.1},purposes:["sincere","ambiguous","sakura","scam"],question:"low",politeness:"keigo",emoji:"low"},
  {id:"P-F12",label:"シングルマザー",gender:"F",ageBand:[30,52],type:"passive",weights:{looks:0.4,income:0.9,age:0.7,interest_match:1.2},purposes:["sincere","ambiguous"],needsChildren:true,needsDivorced:true,question:"low",politeness:"keigo",emoji:"low"},
  {id:"P-F13",label:"きちんとした敬語の人",gender:"F",ageBand:[26,50],type:"polite",weights:{looks:0.6,income:1.3,age:0.9,interest_match:0.8},purposes:["sincere","ambiguous","scam"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-F14",label:"大人の落ち着き",gender:"F",ageBand:[33,55],type:"polite",weights:{looks:0.4,income:0.5,age:0.6,interest_match:1.3},purposes:["sincere","ambiguous","married"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-F15",label:"最低限しか返さない多忙な人",gender:"F",ageBand:[25,50],type:"salty",weights:{looks:1.3,income:0.4,age:0.6,interest_match:0.5},purposes:["sincere","ambiguous","married","profit"],question:"low",politeness:"keigo",emoji:"none"},
  {id:"P-M01",label:"体育会系のアクティブ派",gender:"M",ageBand:[20,45],type:"sync",weights:{looks:1.3,income:0.2,age:1.2,interest_match:0.7},purposes:["sincere","ambiguous","body","business"],question:"mid",politeness:"mixed",emoji:"mid"},
  {id:"P-M02",label:"凝り性なインドア派",gender:"M",ageBand:[20,48],type:"sync",weights:{looks:0.6,income:0.2,age:0.5,interest_match:1.4},purposes:["sincere","ambiguous"],question:"mid",politeness:"mixed",emoji:"low"},
  {id:"P-M03",label:"キャンプとドライブ",gender:"M",ageBand:[26,58],type:"sync",weights:{looks:0.7,income:0.2,age:0.6,interest_match:1.4},purposes:["sincere","ambiguous","married"],question:"mid",politeness:"mixed",emoji:"low"},
  {id:"P-M04",label:"グルメで店に詳しい",gender:"M",ageBand:[28,55],type:"sync",weights:{looks:1.4,income:0.2,age:0.8,interest_match:0.9},purposes:["sincere","ambiguous","body","married"],question:"mid",politeness:"keigo",emoji:"low"},
  {id:"P-M05",label:"将来を見据えた現実派",gender:"M",ageBand:[30,55],type:"sync",weights:{looks:0.6,income:0.4,age:1.3,interest_match:0.9},purposes:["sincere","ambiguous"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-M06",label:"キャリア志向",gender:"M",ageBand:[23,45],type:"sync",weights:{looks:1.3,income:0.4,age:0.7,interest_match:0.8},purposes:["sincere","ambiguous","business","body"],question:"mid",politeness:"mixed",emoji:"low"},
  {id:"P-M07",label:"余裕のある年上",gender:"M",ageBand:[40,60],type:"sync",weights:{looks:1.4,income:0.1,age:1.4,interest_match:0.5},purposes:["sincere","ambiguous","body","married"],question:"mid",politeness:"mixed",emoji:"low"},
  {id:"P-M08",label:"趣味に生きるバツイチ",gender:"M",ageBand:[35,60],type:"sync",weights:{looks:0.6,income:0.1,age:0.4,interest_match:1.3},purposes:["sincere","ambiguous","married"],needsDivorced:true,question:"low",politeness:"mixed",emoji:"low"},
  {id:"P-M09",label:"真面目でまっすぐ",gender:"M",ageBand:[20,45],type:"sync",weights:{looks:0.6,income:0.4,age:0.6,interest_match:1.4},purposes:["sincere","ambiguous","scam"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-M10",label:"奥手",gender:"M",ageBand:[22,45],type:"passive",weights:{looks:0.4,income:0.2,age:0.6,interest_match:1.4},purposes:["sincere","ambiguous"],question:"low",politeness:"keigo",emoji:"low"},
  {id:"P-M11",label:"礼儀正しい",gender:"M",ageBand:[27,50],type:"polite",weights:{looks:0.6,income:0.4,age:0.8,interest_match:1.1},purposes:["sincere","ambiguous","scam"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-M12",label:"紳士的な年上",gender:"M",ageBand:[38,60],type:"polite",weights:{looks:0.6,income:0.2,age:0.5,interest_match:1.3},purposes:["sincere","ambiguous","scam","married"],question:"high",politeness:"keigo",emoji:"low"},
  {id:"P-M13",label:"仕事人間で短文",gender:"M",ageBand:[28,58],type:"salty",weights:{looks:1.3,income:0.2,age:0.7,interest_match:0.4},purposes:["sincere","ambiguous","married"],question:"low",politeness:"mixed",emoji:"none"},
  {id:"P-M14",label:"シングルファーザー",gender:"M",ageBand:[30,55],type:"salty",weights:{looks:0.4,income:0.3,age:0.6,interest_match:1.2},purposes:["sincere","ambiguous"],needsChildren:true,needsDivorced:true,question:"low",politeness:"mixed",emoji:"none"},
  {id:"P-M15",label:"遊び慣れて距離が近い",gender:"M",ageBand:[20,38],type:"moody",weights:{looks:1.4,income:0.1,age:0.6,interest_match:0.9},purposes:["sincere","ambiguous","body"],question:"mid",politeness:"mixed",emoji:"mid"},
];
