// 趣旨説明とキャラ選択。男性5人と女性5人を別々の場所に並べ、カードを選ぶと詳細が開く。
// 人物の違い（容姿・大学群と具体校・居住地・生活条件・顔写真なしの初期状態）を比較できる。
import { useState } from 'react';
import { Hensachi } from './preview';
import { CHARACTERS, SELECTABLE_IDS, educationShort, HOLIDAY_LABEL, MARITAL_LABEL, educationLabel } from '../engine/data/characters';
import type { Gender, PlayableCharacter } from '../engine/types';
import { Portrait, Scenery } from './Avatar';
import { PLAYER_SCENERY } from '../engine/data/npcPhotos';
import { Sheet } from './common';
import { SPEC_CLEAR_DAYS, TUNE_RECEIVED_SCALE } from '../engine/data/rules';
import { looksStars, man } from './format';

const LOOKS_TEXT: Record<number, string> = {
  1: '見た目の第一印象ではかなり不利',
  2: '見た目の第一印象ではやや不利',
  3: '平均的な見た目',
  4: '明確に魅力的',
  5: '非常に魅力的',
};

function inboundLabel(c: PlayableCharacter): string {
  const hi = c.rates.receivedPer30[1] * TUNE_RECEIVED_SCALE[c.gender]; // 実際に届く件数（倍率をかけた後）
  if (hi >= 400) return '受信いいねは非常に多い';
  if (hi >= 100) return '受信いいねは多い';
  if (hi >= 30) return '受信いいねはそれなりにある';
  if (hi >= 10) return '受信いいねは少ない';
  return '受信いいねはほとんど来ない';
}

function CharCard({ c, onPick }: { c: PlayableCharacter; onPick: () => void }) {
  return (
    <button className="char-card" onClick={onPick} aria-label={`${c.name}（${c.age}歳・${c.job}）の詳細を見る`}>
      <Portrait id={c.id} gender={c.gender} className="thumb" />
      <span className="cc-name">{c.name}・{c.age}歳</span>
      <span className="cc-job">{c.job}</span>
      <span className="cc-job">{educationShort(c.education)}</span>
      <span className="cc-job cc-income">年収 {c.incomeLabel ?? man(c.incomeYen)}</span>
      <span className="cc-badges">
        <span className="stars" aria-label={`容姿${c.looks}/5`} title="容姿（ゲーム上の設定値）"><span className="stars-lbl">容姿</span>{looksStars(c.looks)}</span>
        <Hensachi of={c} />
        {!c.photoInitiallyVisible && <span className="badge warn">顔写真なし</span>}
      </span>
    </button>
  );
}

function GenderSection({ gender, onPick }: { gender: Gender; onPick: (id: string) => void }) {
  const list = CHARACTERS.filter((c) => c.gender === gender && SELECTABLE_IDS.includes(c.id));
  return (
    <section className={`gender-section ${gender === 'M' ? 'male' : 'female'}`} aria-label={gender === 'M' ? '男性で遊ぶ' : '女性で遊ぶ'}>
      <header className="gs-head">
        <h2>{gender === 'M' ? '男性で遊ぶ' : '女性で遊ぶ'}</h2>
        <span>{list.length}人</span>
      </header>
      <div className="char-grid">
        {list.map((c) => <CharCard key={c.id} c={c} onPick={() => onPick(c.id)} />)}
      </div>
    </section>
  );
}

function Detail({ ch, onStart, onClose }: { ch: PlayableCharacter; onStart: (seed: string) => void; onClose: () => void }) {
  const [seed, setSeed] = useState(() => `run-${Math.floor(Math.random() * 1e6)}`);
  return (
    <Sheet
      title={`${ch.name}（${ch.gender === 'M' ? '男性' : '女性'}・${ch.age}歳）`}
      onClose={onClose}
      footer={(
        <div className="start-row">
          <label className="seed">
            シード
            <input value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="乱数シード" />
          </label>
          <button className="btn primary big" onClick={() => onStart(seed.trim() || 'run')}>{ch.name}ではじめる</button>
        </div>
      )}
    >
      <div className="detail-top">
        <Portrait id={ch.id} gender={ch.gender} className="large" />
        <div>
          <p className="tagline">{ch.tagline}</p>
          <dl className="spec">
            <dt>職業</dt><dd>{ch.job}</dd>
            <dt>学歴</dt><dd>{educationLabel(ch.education)}</dd>
            <dt>年収</dt><dd>{ch.incomeLabel ?? man(ch.incomeYen)}</dd>
            <dt>身長</dt><dd>{ch.heightCm}cm</dd>
            <dt>容姿</dt><dd>{ch.looks}/5（{LOOKS_TEXT[ch.looks]}） <Hensachi of={ch} /></dd>
          </dl>
        </div>
      </div>
      <dl className="spec">
        <dt>結婚歴・子ども</dt><dd>{MARITAL_LABEL[ch.marital]}・子ども{ch.children > 0 ? `${ch.children}人（同居）` : 'なし'}</dd>
        <dt>休日</dt><dd>{HOLIDAY_LABEL[ch.holiday]}</dd>
        <dt>生活</dt><dd>{ch.lifeNote}</dd>
        <dt>交際経験</dt><dd>{ch.datingExperience}（相手には見えない情報）</dd>
        <dt>月の活動予算</dt><dd>{man(ch.monthlyBudgetYen)}{ch.gender === 'M' ? '（利用料 4,000円/30日を含めて使う）' : '（基本利用料0円）'}</dd>
        <dt>入口の反応</dt><dd>{inboundLabel(ch)}</dd>
      </dl>
      {!ch.photoInitiallyVisible && (
        <div className="nophoto-note">
          <Scenery seed={ch.id} compact photo={PLAYER_SCENERY[ch.id]} />
          <p>相手が見るプロフィール画像はこのような風景写真です。顔は対面で初めて分かります。会うまでは相手の反応が良くても、会った後に断られやすくなります。</p>
        </div>
      )}
      <div className="route">
        <h3>この人物で起こりやすいこと</h3>
        <p>{ch.route.hardship}</p>
        <h3>自分の判断が効くところ</h3>
        <p>{ch.route.choices}</p>
        <h3>クリアにつながる道</h3>
        <p>{ch.route.clearPath}</p>
      </div>
      <p className="fineprint">同じシードと同じ操作なら、同じ展開になります。</p>
    </Sheet>
  );
}

export function SelectScreen({ onStart, onContinue, hasSave }: { onStart: (id: string, seed: string) => void; onContinue: () => void; hasSave: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const ch = picked ? CHARACTERS.find((c) => c.id === picked) : undefined;
  return (
    <div className="select-screen">
      <header className="intro">
        <h1>マチアプシミュレーター</h1>
        <p className="lead">
          自分とは違う性別や条件でマッチングアプリを使ったら、反応はどう変わるのか。
          断られる痛みと、お金・時間・期待がすり減っていく感覚を体験するゲームです。舞台は首都圏。
        </p>
        <div className="win-lose">
          <div className="wl clear">
            <span className="wl-tag">クリア</span>
            <p>同じ相手と交際を始め、<b>交際{SPEC_CLEAR_DAYS}日</b>をライフが残ったまま迎える</p>
          </div>
          <div className="wl fail">
            <span className="wl-tag">失敗</span>
            <p><b>ライフ100が0</b>になると「マチアプ疲れ」で終了。ライフは回復しません</p>
          </div>
        </div>
        <p className="muted small">現実の性別を入力する必要はありません。男女どちらの役も選べます。数値はすべてゲーム用の架空の設定です。</p>
        {hasSave && <button className="btn secondary" onClick={onContinue}>前回の続きから</button>}
      </header>
      <div className="gender-columns">
        <GenderSection gender="M" onPick={setPicked} />
        <GenderSection gender="F" onPick={setPicked} />
      </div>
      {ch && <Detail ch={ch} onClose={() => setPicked(null)} onStart={(seed) => onStart(ch.id, seed)} />}
    </div>
  );
}
