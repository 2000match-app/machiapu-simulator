// プロフィールの基本情報（2026-11-23 指示：プロフィールの細分化）。実際のアプリ（Pairs など）にある項目に合わせる。
// 出身地・血液型・兄弟姉妹・同居人・ペット・結婚に対する意思・子どもが欲しいか・家事育児・初回デート費用・性格。
// あわせて、トークの話の材料（好きなお酒・よく見聞きするジャンル・運動・得意料理・部活・行ってみたい場所）も持つ。
// 生成はシードから決まる。古いセーブの相手（details がない）は、IDから同じ値を作り直す。
import { Rng } from './rng';
import type { Npc } from './types';

export interface NpcDetails {
  hometown: string;
  blood: 'A' | 'B' | 'O' | 'AB';
  /** 兄弟の説明（「姉が1人いる次女」など。「{sibling}です」で使う） */
  sibling: string;
  /** プロフィールの兄弟姉妹の欄（長男・次女・一人っ子・末っ子など） */
  siblingLabel: string;
  living: '一人暮らし' | '実家暮らし' | 'ルームシェア' | '子どもと同居';
  /** 好きな（飼っている）動物。petOwned でなければ「好きな動物」 */
  pet: string;
  petOwned: boolean;
  /** 好きなお酒（飲まない人は「お茶」などの飲み物） */
  drink: string;
  drinks: boolean;
  /** よく聴く音楽のジャンル・よく見る映画やドラマのジャンル */
  music: string;
  show: string;
  /** している運動（していなければ、見るのが好きなスポーツ） */
  sport: string;
  doesSport: boolean;
  dish: string;
  club: string;
  dateplace: string;
  marriage: string;
  kids: string;
  housework: string;
  firstDate: string;
  personality: string[];
  /** 未記入の項目（プロフィールが薄い人ほど多い） */
  blank: string[];
}

const KANTO = ['東京都', '神奈川県', '埼玉県', '千葉県'];
const OTHER = ['北海道', '宮城県', '福島県', '茨城県', '栃木県', '群馬県', '新潟県', '長野県', '静岡県', '愛知県', '岐阜県', '大阪府', '京都府', '兵庫県', '広島県', '岡山県', '福岡県', '熊本県', '鹿児島県', '沖縄県'];
const SIB_M: [string, string][] = [['一人っ子', '一人っ子'], ['姉が1人いる長男', '長男'], ['弟が1人いる長男', '長男'], ['妹が1人いる長男', '長男'], ['兄が1人いる次男', '次男'], ['三人兄弟の真ん中', '次男'], ['兄と姉がいる末っ子', '末っ子']];
const SIB_F: [string, string][] = [['一人っ子', '一人っ子'], ['兄が1人いる長女', '長女'], ['弟が1人いる長女', '長女'], ['妹が1人いる長女', '長女'], ['姉が1人いる次女', '次女'], ['三姉妹の真ん中', '次女'], ['兄と姉がいる末っ子', '末っ子']];
const PETS = ['犬', '猫', 'うさぎ', 'ハムスター', 'インコ'];
const DRINKS = ['ビール', 'ハイボール', 'ワイン', '日本酒', 'レモンサワー', 'カクテル'];
const SOFT = ['お茶', 'コーヒー', 'ジュース'];
const MUSIC = ['邦ロック', 'K-POP', 'J-POP', '洋楽', 'アイドル', 'ヒップホップ', 'ジャズ'];
const SHOWS = ['韓国ドラマ', '洋画', 'アニメ', '邦画', '海外ドラマ', 'お笑い', 'ドキュメンタリー'];
const SPORTS = ['ジム', 'ランニング', 'ヨガ', 'テニス', 'ゴルフ', 'ボルダリング', '水泳'];
const SPORTS_F = ['ピラティス', 'ヨガ', 'ジム', 'ランニング', 'テニス', 'ボルダリング'];
const WATCH = ['野球', 'サッカー', 'バスケ', 'ラグビー'];
const DISHES = ['カレー', 'パスタ', '肉じゃが', 'ハンバーグ', 'オムライス', '唐揚げ', '鍋', 'チャーハン'];
// 帰宅部は「部室で」「練習が」などの文と合わないので入れない（2026-11-23）
const CLUB_M = ['バスケ部', 'サッカー部', '野球部', 'テニス部', 'バレー部', '陸上部', '軽音部', '吹奏楽部', '卓球部'];
const CLUB_F = ['バスケ部', 'テニス部', 'バレー部', '吹奏楽部', '陸上部', '美術部', '軽音部', 'ダンス部', '茶道部'];
const PLACES = ['水族館', '美術館', '動物園', '温泉', '映画館', '遊園地', '花火大会', '鎌倉', '横浜', '箱根'];
const PERSONALITY = ['穏やか', '明るい', '聞き上手', 'マイペース', '真面目', '社交的', '人見知り', '几帳面', 'おおらか', 'インドア', 'アクティブ', '優しい', '面白い', '気配り上手'];

export function generateDetails(rng: Rng, n: Npc, livesWithParents = false): NpcDetails {
  const f = n.gender === 'F';
  const [sibling, siblingLabel] = rng.pick(f ? SIB_F : SIB_M);
  const petOwned = rng.chance(0.3);
  const drinks = n.drinking !== 'none';
  const doesSport = rng.chance(0.6);
  const future = n.traits.future;
  const marriage = future === 'soon' ? rng.pick(['すぐにでもしたい', '2〜3年のうちに']) : future === 'someday' ? '良い人がいればしたい' : rng.pick(['今のところ考えていない', 'わからない']);
  const kids = n.hasChildren ? 'わからない' : future === 'undecided' ? rng.pick(['わからない', 'ほしくない']) : rng.weighted([['ほしい', 6], ['わからない', 3], ['ほしくない', 1]] as const);
  const pay = n.traits.payExpectation;
  const firstDate = pay === 'treat' ? '男性が全て払う' : pay === 'more' ? '男性が多めに払う' : rng.pick(['割り勘', '持っている方が払う', '相手と相談して決める']);
  const d: NpcDetails = {
    hometown: rng.chance(0.55) ? rng.pick(KANTO) : rng.pick(OTHER),
    blood: rng.weighted([['A', 40], ['O', 30], ['B', 20], ['AB', 10]] as const),
    sibling, siblingLabel,
    living: n.hasChildren ? '子どもと同居' : livesWithParents ? '実家暮らし' : rng.weighted([['一人暮らし', 66], ['実家暮らし', 28], ['ルームシェア', 6]] as const),
    pet: rng.pick(PETS.slice(0, petOwned ? 5 : 2)),
    petOwned,
    drink: drinks ? rng.pick(DRINKS) : rng.pick(SOFT),
    drinks,
    music: rng.pick(MUSIC),
    show: rng.pick(SHOWS),
    sport: doesSport ? rng.pick(f ? SPORTS_F : SPORTS) : rng.pick(WATCH),
    doesSport,
    dish: rng.pick(DISHES),
    club: rng.pick(f ? CLUB_F : CLUB_M),
    dateplace: rng.pick(PLACES),
    marriage,
    kids,
    housework: rng.weighted([['積極的に参加したい', 3], ['できれば参加したい', 4], ['相手と相談して決めたい', 4], ['相手に任せたい', 1]] as const),
    firstDate,
    personality: rng.shuffle([...PERSONALITY]).slice(0, rng.int(2, 3)),
    blank: [],
  };
  // プロフィールが薄い人は、基本情報も未記入が多い
  const blankP = n.profileDepth === 'bare' ? 0.5 : n.profileDepth === 'sparse' ? 0.3 : n.profileDepth === 'rich' ? 0 : 0.1;
  for (const k of ['hometown', 'blood', 'sibling', 'living', 'pet', 'marriage', 'kids', 'housework', 'firstDate', 'personality']) if (rng.chance(blankP)) d.blank.push(k);
  return d;
}

/** 相手の基本情報（古いセーブの相手は、IDから作り直す） */
export function detailsOf(n: Npc): NpcDetails {
  if (n.details) return n.details;
  return generateDetails(Rng.fromSeed('details', n.id), n);
}

/** プロフィールに出す基本情報の行（未記入は「未記入」） */
export function detailRows(n: Npc): [string, string][] {
  const d = detailsOf(n);
  const v = (k: string, s: string) => (d.blank.includes(k) ? '未記入' : s);
  return [
    ['出身地', v('hometown', d.hometown)],
    ['血液型', v('blood', `${d.blood}型`)],
    ['兄弟姉妹', v('sibling', d.siblingLabel)],
    ['同居人', v('living', d.living)],
    ['ペット', v('pet', d.petOwned ? d.pet : 'なし')],
    ['結婚に対する意思', v('marriage', d.marriage)],
    ['子どもが欲しいか', v('kids', d.kids)],
    ['家事・育児', v('housework', d.housework)],
    ['初回デート費用', v('firstDate', d.firstDate)],
    ['性格', v('personality', d.personality.join('・'))],
  ];
}
