// さがす（基本の画面）：実際のアプリと同じ項目で絞り込み、条件に合う相手がスクロールで次々に出てくる。
import { shownHobbies } from '../engine/profileDepth';
import { detailRows } from '../engine/profileDetails';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Hensachi } from './preview';
import { scrollToTop } from './scroll';
import { candidateEstimate, relaxDeltas } from '../engine/matching';
import { estimateCandidates } from '../engine/npc';
import { areaLabel, PREFECTURES } from '../engine/data/areas';
import { DRINKING_LABEL, HOLIDAY_LABEL, MARITAL_LABEL, SMOKING_LABEL } from '../engine/data/characters';
import { character, isInRelationship } from '../engine/state';
import { TUNE_BOOST } from '../engine/data/rules';
import type { GameState, Npc, Preference, Prefecture } from '../engine/types';
import type { TabProps } from './GameShell';
import { NpcAvatar, npcRevealTags } from './Avatar';
import { Sentinel, Sheet } from './common';
import { SwipeDeck } from './SwipeDeck';
import { freePhotoCount } from '../engine/photos';
import { educationOf, incomeOf, man, prefsSummary } from './format';

export function npcWishes(npc: Npc): string {
  const p = npc.prefs;
  const parts = [`${p.ageMin}〜${p.ageMax}歳`];
  if (p.minIncomeYen > 0) parts.push(`年収${man(p.minIncomeYen)}以上`);
  if (p.minHeight > 0) parts.push(`身長${p.minHeight}cm以上`);
  if (p.nonSmokerOnly) parts.push('タバコを吸わない人');
  if (!p.acceptsDivorced) parts.push('未婚の人');
  if (!p.acceptsPartnerChildren) parts.push('子どもがいない人');
  if (p.universityOnly) parts.push('大卒');
  return parts.join('・');
}

/** large：写真を大きく出す（受け取ったいいね・プロフィールを見て質問する。2026-11-14 指示） */
export function NpcProfile({ npc, compact, reveal, large }: { npc: Npc; compact?: boolean; reveal?: string[]; large?: boolean }) {
  return (
    <div className="npc-profile">
      <div className={`np-head${large ? ' hero' : ''}`}>
        <NpcAvatar npc={npc} size={large ? 'hero' : compact ? 'md' : 'big'} />
        <div>
          <b className="np-name">{npc.name}（{npc.age}）</b><Hensachi of={npc} />
          <div className="small">{areaLabel(npc.areaId)}</div>
          {reveal && reveal.length > 0 && <div className="reveal-line">{reveal.join('・')}</div>}
        </div>
      </div>
      {!compact && (
        <>
          <dl className="np-spec">
            <dt>職業</dt><dd>{npc.job}</dd>
            <dt>学歴</dt><dd>{educationOf(npc)}</dd>
            <dt>年収</dt><dd>{incomeOf(npc)}</dd>
            <dt>身長</dt><dd>{npc.heightCm}cm</dd>
            <dt>結婚歴</dt><dd>{MARITAL_LABEL[npc.marital]}</dd>
            <dt>子ども</dt><dd>{npc.hasChildren ? 'あり' : 'なし'}</dd>
            <dt>タバコ</dt><dd>{SMOKING_LABEL[npc.smoking]}</dd>
            <dt>お酒</dt><dd>{DRINKING_LABEL[npc.drinking]}</dd>
            <dt>休日</dt><dd>{HOLIDAY_LABEL[npc.holiday]}</dd>
            <dt>趣味</dt><dd>{shownHobbies(npc)}</dd>
            {/* 基本情報（2026-11-23 プロフィールの細分化） */}
            {detailRows(npc).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className={v === '未記入' ? 'muted' : undefined}>{v}</dd></Fragment>)}
            {/* 女性NPCの「相手への希望」は出さない（2026-11-08 指示） */}
            {npc.gender === 'M' && <><dt>相手への希望</dt><dd>{npcWishes(npc)}</dd></>}
          </dl>
          <p className="np-text">{npc.profileText}</p>
        </>
      )}
    </div>
  );
}

function NpcCard({ npc, onOpen, onLike, likeDisabled, reveal }: { npc: Npc; onOpen: () => void; onLike: () => void; likeDisabled: boolean; reveal: string[] }) {
  return (
    <li className="grid-card">
      <button className="gc-open" onClick={onOpen} aria-label={`${npc.name}のプロフィールを見る`}>
        <NpcAvatar npc={npc} size="xl" />
        <span className="gc-name">{npc.name}・{npc.age}歳<Hensachi of={npc} /></span>
        <span className="gc-sub">{areaLabel(npc.areaId)}</span>
        <span className="gc-sub">{npc.heightCm}cm・{npc.job.replace(/（.*）/, '')}</span>
        <span className="gc-sub gc-income">年収{incomeOf(npc)}</span>
        {reveal.length > 0 && <span className="gc-sub reveal-line">{reveal.join('・')}</span>}
      </button>
      <button className="btn like small" disabled={likeDisabled} onClick={onLike}>♡ いいね</button>
    </li>
  );
}

const AGES = Array.from({ length: 43 }, (_, i) => 18 + i);
const HEIGHTS = [0, 145, 150, 155, 160, 165, 170, 175, 180, 185];
const INCOMES = [0, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500];

export function FilterSheet({ state, onClose, onApply, title = '絞り込み', applyLabel = 'この条件で探す', lead }: { state: GameState; onClose: () => void; onApply: (p: Preference) => void; title?: string; applyLabel?: string; lead?: string }) {
  const [p, setP] = useState<Preference>(state.player.prefs);
  const ch = character(state);
  const est = estimateCandidates(ch, state.player.age, p);
  const relax = relaxDeltas(state, p);
  const togglePref = (pref: Prefecture) => setP({ ...p, prefectures: p.prefectures.includes(pref) ? p.prefectures.filter((x) => x !== pref) : [...p.prefectures, pref] });
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={(
        <div className="filter-foot">
          <span>この条件で <b>約{est.toLocaleString()}人</b></span>
          <button className="btn primary" onClick={() => onApply(p)}>{applyLabel}</button>
        </div>
      )}
    >
      <div className="filters-form">
        {lead && <p className="small muted">{lead}</p>}
        <fieldset>
          <legend>年齢</legend>
          <div className="pair">
            <select value={p.ageMin} onChange={(e) => setP({ ...p, ageMin: Number(e.target.value) })} aria-label="年齢の下限">{AGES.map((a) => <option key={a} value={a}>{a}歳</option>)}</select>
            〜
            <select value={p.ageMax} onChange={(e) => setP({ ...p, ageMax: Number(e.target.value) })} aria-label="年齢の上限">{AGES.map((a) => <option key={a} value={a}>{a}歳</option>)}</select>
          </div>
        </fieldset>
        <fieldset>
          <legend>居住地</legend>
          <div className="checks">
            {PREFECTURES.map((pref) => (
              <label key={pref} className="check"><input type="checkbox" checked={p.prefectures.includes(pref)} onChange={() => togglePref(pref)} />{pref}</label>
            ))}
          </div>
          <p className="muted small">あなたは{areaLabel(ch.areaId)}在住です。</p>
        </fieldset>
        <fieldset>
          <legend>身長</legend>
          <div className="pair">
            <select value={p.heightMin} onChange={(e) => setP({ ...p, heightMin: Number(e.target.value) })} aria-label="身長の下限">{HEIGHTS.map((h) => <option key={h} value={h}>{h === 0 ? '下限なし' : `${h}cm`}</option>)}</select>
            〜
            <select value={p.heightMax} onChange={(e) => setP({ ...p, heightMax: Number(e.target.value) })} aria-label="身長の上限">{HEIGHTS.map((h) => <option key={h} value={h}>{h === 0 ? '上限なし' : `${h}cm`}</option>)}</select>
          </div>
        </fieldset>
        <fieldset>
          <legend>年収</legend>
          <select value={p.minIncomeYen} onChange={(e) => setP({ ...p, minIncomeYen: Number(e.target.value) })}>
            {INCOMES.map((i) => <option key={i} value={i * 10000}>{i === 0 ? 'こだわらない' : `${i}万円以上`}</option>)}
          </select>
        </fieldset>
        <fieldset>
          <legend>学歴・結婚歴・子ども</legend>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={p.universityOnly} onChange={(e) => setP({ ...p, universityOnly: e.target.checked })} />大卒以上</label>
            <label className="check"><input type="checkbox" checked={p.neverMarriedOnly} onChange={(e) => setP({ ...p, neverMarriedOnly: e.target.checked })} />未婚の人</label>
            <label className="check"><input type="checkbox" checked={p.noChildrenOnly} onChange={(e) => setP({ ...p, noChildrenOnly: e.target.checked })} />子どもがいない人</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>タバコ・お酒</legend>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={p.nonSmokerOnly} onChange={(e) => setP({ ...p, nonSmokerOnly: e.target.checked })} />吸わない人</label>
          </div>
          <select value={p.drinking} onChange={(e) => setP({ ...p, drinking: e.target.value as Preference['drinking'] })} aria-label="お酒">
            <option value="any">お酒：こだわらない</option>
            <option value="noneOrSometimes">お酒：ときどきまで</option>
            <option value="none">お酒：飲まない人</option>
          </select>
        </fieldset>
        <fieldset>
          <legend>休日・写真</legend>
          <select value={p.holiday} onChange={(e) => setP({ ...p, holiday: e.target.value as Preference['holiday'] })} aria-label="休日">
            <option value="any">休日：こだわらない</option>
            <option value="weekend">休日：土日</option>
            <option value="weekday">休日：平日</option>
          </select>
          <div className="checks">
          </div>
        </fieldset>
        {relax.length > 0 && (
          <div className="relax-box">
            <p className="small"><b>条件を1つ緩めると</b></p>
            <ul className="relax">{relax.map((r) => <li key={r.key}>{r.label}と <b>+{r.delta.toLocaleString()}人</b></li>)}</ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const MODE_KEY = 'machiapu-sim:searchMode';

export function SearchTab({ state, act }: TabProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // 表示の切り替え（2026-11-07 指示）：フリック（1人ずつスワイプ）／一覧（2列で選ぶ）。選んだ方をこの端末に覚えておく
  const [mode, setModeState] = useState<'swipe' | 'list'>(() => {
    try { return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'swipe'; } catch { return 'swipe'; }
  });
  const setMode = (m: 'swipe' | 'list') => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* 保存できなくても表示は切り替わる */ }
  };
  const est = candidateEstimate(state);
  // いいね済み（接触済み）の相手は出さない。いいね欄の「送ったいいね」で見られる
  // 表示順は、タブを開くたびにランダム（2026-11-09 指示）。開いた時点の候補を並べ替え、その後に読み込んだ候補は後ろに足す
  const order = useRef<Map<string, number> | null>(null);
  if (order.current === null) {
    const ids = [...state.search.results];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    order.current = new Map(ids.map((id, i) => [id, i]));
  }
  for (const id of state.search.results) if (!order.current.has(id)) order.current.set(id, order.current.size);
  const rank = order.current;
  const results = state.search.results.filter((id) => !state.contacts[id])
    .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    .map((id) => state.npcs[id]).filter(Boolean);
  const pending = Object.values(state.contacts).filter((c) => c.stage === 'like_sent').length;
  const inRel = isInRelationship(state);
  // 写真素材を使い切ったら、それ以上の相手は出てこない（写真のない相手は出さない）
  const exhausted = est === 0 || (results.length > 0 && results.length >= est) || freePhotoCount(state) === 0;
  const openNpc = openId ? state.npcs[openId] : null;
  const [top, next] = results;
  // いいねの回数制限はなし（2026-11-13）。体調不良の日などはアプリを開けないので、ここでは止めない
  const canLike = true;
  const me = character(state);

  // 一覧が少なくなったら続きを読み込む（スワイプで減っていくため）
  useEffect(() => {
    if (results.length < 6 && !exhausted) act({ type: 'searchMore', count: 12 });
  }, [results.length, exhausted, act]);

  return (
    <div className="search">
      {inRel && <p className="warn-line">交際中にアプリで探していることが相手に伝わると、関係に影響することがあります。</p>}
      <div className="me-card" aria-label="あなたの設定">
        <span className="me-lbl">あなた</span>
        <span><b>{state.player.age}</b>歳</span>
        <span>年収<b>{me.incomeLabel ?? man(me.incomeYen)}</b></span>
        <span>容姿<b>{me.looks}</b>/5</span>
        <Hensachi of={{ ...me, age: state.player.age }} faceHidden={!state.player.photoVisible} />
        <span className="me-photo">{state.player.photoVisible ? '顔写真あり' : '顔写真なし'}</span>
      </div>
      {state.life < 50 && (
        <div className="widen-warn">
          <b>ライフが50を切りました。</b>今の絞り込みは格上狙いになっていませんか？条件を広げてみよう。
          <button className="btn small" onClick={() => setFilterOpen(true)}>絞り込みを見直す</button>
        </div>
      )}
      <div className="search-bar">
        <button className="filter-chip" onClick={() => setFilterOpen(true)} aria-label="絞り込みを開く">
          <span className="ico" aria-hidden="true">⚙</span>
          <span className="sum">{prefsSummary(state.player.prefs).join('／')}</span>
          <b>約{est.toLocaleString()}人</b>
        </button>
        <div className="search-meta">
          <span className="muted">反応待ち {pending}件</span>
        </div>
      </div>

      {results.length === 0 && exhausted && (
        <p className="card muted">{est === 0 ? '条件に合う相手が見つかりません。絞り込みを緩めてください。' : '条件に合う相手はここまでです。絞り込みを緩めると、ほかの人も出てきます。'}</p>
      )}
      <div className="seg view-toggle" role="tablist" aria-label="表示の切り替え">
        <button role="tab" aria-selected={mode === 'swipe'} className={mode === 'swipe' ? 'on' : ''} onClick={() => setMode('swipe')}>フリック</button>
        <button role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>一覧</button>
      </div>
      {mode === 'swipe' && top && (
        <SwipeDeck
          top={top}
          next={next}
          canLike={canLike}
          onLike={(id) => act({ type: 'like', npcId: id })}
          onSkip={(id) => act({ type: 'skipSearch', npcId: id })}
          onOpen={setOpenId}
          reveal={(n) => npcRevealTags(state, n)}
        />
      )}

      {mode === 'list' && results.length > 0 && (
        <section className="more-cands">
          <ul className="grid">
            {results.map((npc) => (
              <NpcCard
                key={npc.id}
                npc={npc}
                likeDisabled={!canLike}
                reveal={npcRevealTags(state, npc)}
                onOpen={() => { setOpenId(npc.id); act({ type: 'viewProfile', npcId: npc.id }); }}
                onLike={() => act({ type: 'like', npcId: npc.id })}
              />
            ))}
          </ul>
        </section>
      )}
      {/* 一覧の時だけ、末尾までスクロールしたら続きを読み込む（フリックは残りが少なくなったら読み込む） */}
      <Sentinel enabled={mode === 'list' && !exhausted} deps={results.length} onVisible={() => act({ type: 'searchMore', count: 12 })} />
      {exhausted && results.length > 0 && <p className="muted small center">条件に合う相手はここまでです。</p>}

      <div className="paid">
        <button className="btn ghost small" disabled={state.boostUntil !== undefined && state.day <= state.boostUntil} onClick={() => act({ type: 'boost' })}>
          露出アップ{TUNE_BOOST.days}日間（{TUNE_BOOST.yen.toLocaleString()}円・任意）
        </button>
      </div>

      {filterOpen && (
        <FilterSheet
          state={state}
          onClose={() => setFilterOpen(false)}
          onApply={(p) => {
            act({ type: 'setPrefs', prefs: p });
            setFilterOpen(false);
            scrollToTop();
          }}
        />
      )}
      {openNpc && (
        <Sheet
          title={`${openNpc.name}さんのプロフィール`}
          onClose={() => setOpenId(null)}
          footer={state.contacts[openNpc.id] ? <p className="muted small">いいね済み（いいね欄の「送ったいいね」で確認できます）</p> : (
            <div className="row cand-actions">
              <button className="btn ghost" onClick={() => { act({ type: 'skipSearch', npcId: openNpc.id }); setOpenId(null); }}>スキップ</button>
              <button className="btn like" disabled={!canLike} onClick={() => { act({ type: 'like', npcId: openNpc.id }); setOpenId(null); }}>♡ いいね</button>
            </div>
          )}
        >
          <NpcProfile npc={openNpc} reveal={npcRevealTags(state, openNpc)} />
        </Sheet>
      )}
    </div>
  );
}
