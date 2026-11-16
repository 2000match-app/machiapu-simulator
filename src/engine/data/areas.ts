// 舞台は首都圏（東京都・埼玉県・千葉県）に限定する（2026-10-22 ユーザー指示。仕様v0.3の「地方在住」からの変更）。
// 位置は東京駅からのおおよその距離（km、東が+x・北が+y）。移動時間は直線距離からの目安（仮置き）。
export type Prefecture = '東京都' | '埼玉県' | '千葉県';

export interface Area {
  id: string;
  pref: Prefecture;
  name: string;
  x: number;
  y: number;
  /** NPCの居住地の重み（人口の目安） */
  weight: number;
  /** 鉄道の本数が少なく、乗り換えに時間がかかる地域 */
  remote?: boolean;
}

export const AREAS: Area[] = [
  // 東京23区
  { id: 'chiyoda', pref: '東京都', name: '千代田区', x: 0, y: 1, weight: 1 },
  { id: 'chuo', pref: '東京都', name: '中央区', x: 1, y: -1, weight: 2 },
  { id: 'minato', pref: '東京都', name: '港区', x: -2.5, y: -3, weight: 3 },
  { id: 'shinjuku', pref: '東京都', name: '新宿区', x: -6.5, y: 1.5, weight: 4 },
  { id: 'shibuya', pref: '東京都', name: '渋谷区', x: -6, y: -2.5, weight: 3 },
  { id: 'meguro', pref: '東京都', name: '目黒区', x: -7, y: -5, weight: 3 },
  { id: 'shinagawa', pref: '東京都', name: '品川区', x: -3, y: -6, weight: 4 },
  { id: 'ota', pref: '東京都', name: '大田区', x: -4, y: -11, weight: 5 },
  { id: 'setagaya', pref: '東京都', name: '世田谷区', x: -11, y: -4, weight: 7 },
  { id: 'nakano', pref: '東京都', name: '中野区', x: -9, y: 2.5, weight: 3 },
  { id: 'suginami', pref: '東京都', name: '杉並区', x: -12, y: 1.5, weight: 5 },
  { id: 'nerima', pref: '東京都', name: '練馬区', x: -12, y: 6, weight: 5 },
  { id: 'toshima', pref: '東京都', name: '豊島区', x: -5, y: 5, weight: 3 },
  { id: 'itabashi', pref: '東京都', name: '板橋区', x: -7, y: 9, weight: 4 },
  { id: 'kita', pref: '東京都', name: '北区', x: -3, y: 9, weight: 3 },
  { id: 'taito', pref: '東京都', name: '台東区', x: 1, y: 3.5, weight: 2 },
  { id: 'sumida', pref: '東京都', name: '墨田区', x: 4, y: 2.5, weight: 2 },
  { id: 'koto', pref: '東京都', name: '江東区', x: 5, y: -2, weight: 4 },
  { id: 'adachi', pref: '東京都', name: '足立区', x: 2, y: 10, weight: 4 },
  { id: 'katsushika', pref: '東京都', name: '葛飾区', x: 7, y: 7, weight: 3 },
  { id: 'edogawa', pref: '東京都', name: '江戸川区', x: 10, y: 0, weight: 4 },
  // 東京都下
  { id: 'musashino', pref: '東京都', name: '武蔵野市', x: -17, y: 2, weight: 2 },
  { id: 'chofu', pref: '東京都', name: '調布市', x: -18, y: -3, weight: 2 },
  { id: 'fuchu', pref: '東京都', name: '府中市', x: -23, y: -2, weight: 2 },
  { id: 'tachikawa', pref: '東京都', name: '立川市', x: -32, y: 3, weight: 2 },
  { id: 'hachioji', pref: '東京都', name: '八王子市', x: -41, y: -2, weight: 4 },
  { id: 'machida', pref: '東京都', name: '町田市', x: -28, y: -18, weight: 3 },
  // 埼玉県
  { id: 'saitama-omiya', pref: '埼玉県', name: 'さいたま市大宮区', x: -6, y: 25, weight: 3 },
  { id: 'saitama-urawa', pref: '埼玉県', name: 'さいたま市浦和区', x: -6, y: 20, weight: 3 },
  { id: 'kawaguchi', pref: '埼玉県', name: '川口市', x: -2, y: 14, weight: 4 },
  { id: 'toda', pref: '埼玉県', name: '戸田市', x: -7, y: 14, weight: 1 },
  { id: 'tokorozawa', pref: '埼玉県', name: '所沢市', x: -25, y: 15, weight: 2 },
  { id: 'kawagoe', pref: '埼玉県', name: '川越市', x: -27, y: 27, weight: 2 },
  { id: 'koshigaya', pref: '埼玉県', name: '越谷市', x: 8, y: 21, weight: 2 },
  { id: 'kasukabe', pref: '埼玉県', name: '春日部市', x: 5, y: 30, weight: 1.5 },
  { id: 'soka', pref: '埼玉県', name: '草加市', x: 5, y: 16, weight: 1.5 },
  { id: 'kumagaya', pref: '埼玉県', name: '熊谷市', x: -30, y: 55, weight: 1.2, remote: true },
  { id: 'chichibu', pref: '埼玉県', name: '秩父市', x: -62, y: 40, weight: 0.4, remote: true },
  // 千葉県
  { id: 'chiba', pref: '千葉県', name: '千葉市', x: 31, y: -13, weight: 4 },
  { id: 'funabashi', pref: '千葉県', name: '船橋市', x: 19, y: -3, weight: 3 },
  { id: 'ichikawa', pref: '千葉県', name: '市川市', x: 13, y: 0, weight: 2.5 },
  { id: 'matsudo', pref: '千葉県', name: '松戸市', x: 12, y: 9, weight: 2.5 },
  { id: 'kashiwa', pref: '千葉県', name: '柏市', x: 20, y: 19, weight: 2.5 },
  { id: 'urayasu', pref: '千葉県', name: '浦安市', x: 11, y: -5, weight: 1.2 },
  { id: 'narashino', pref: '千葉県', name: '習志野市', x: 24, y: -6, weight: 1.2 },
  { id: 'narita', pref: '千葉県', name: '成田市', x: 50, y: 12, weight: 1, remote: true },
  { id: 'kisarazu', pref: '千葉県', name: '木更津市', x: 25, y: -40, weight: 1, remote: true },
  { id: 'mobara', pref: '千葉県', name: '茂原市', x: 52, y: -30, weight: 0.6, remote: true },
];

export const PREFECTURES: Prefecture[] = ['東京都', '埼玉県', '千葉県'];

export function getArea(id: string): Area {
  const a = AREAS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown area ${id}`);
  return a;
}

export function areaLabel(id: string): string {
  const a = getArea(id);
  return `${a.pref}${a.name}`;
}

/** 片道の移動時間の目安（分）。同じ区市内は15分 */
export function travelMinutes(fromId: string, toId: string): number {
  if (fromId === toId) return 15;
  const a = getArea(fromId);
  const b = getArea(toId);
  const km = Math.hypot(a.x - b.x, a.y - b.y);
  const penalty = (a.remote ? 20 : 0) + (b.remote ? 20 : 0);
  return Math.round(12 + km * 1.35 + penalty);
}
