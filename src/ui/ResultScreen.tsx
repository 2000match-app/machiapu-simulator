// 結果：クリアまたは失敗、経過、支出、損失内訳、実際の選択に基づく提案。
// 相手の内部事情（目的）は、ここで初めて解説する。
import { EVENTS, eventName } from '../engine/data/events';
import { PURPOSE_LABEL } from '../engine/data/rules';
import { character } from '../engine/state';
import type { GameState } from '../engine/types';
import { countMetPeople } from '../engine/feedback';
import { Portrait } from './Avatar';
import { elapsedLabel, man } from './format';

const CAT: Record<string, string> = {
  weekly: '週の成果不足（無反応）', monthly: '月末の消耗', budget: '予算超過', event: 'できごと', depth: '関係の深さによる加算', fatigue: '比較疲れ',
};

export function ResultScreen({ state, onQuit, onRestart }: { state: GameState; onQuit: () => void; onRestart: () => void }) {
  const r = state.result!;
  const ch = character(state);
  const s = state.stats;
  const cats = Object.entries(r.lossByCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(([, v]) => v));
  const events = Object.entries(r.lossByEvent).filter(([k]) => /^E\d\d$/.test(k)).sort((a, b) => b[1] - a[1]);
  const met = Object.values(state.contacts).filter((c) => c.meetings > 0 || c.relationship || (c.stage === 'ended' && c.twoWay));
  const recovered = state.ledger.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0);
  const partner = r.partnerId ? state.npcs[r.partnerId] : undefined;

  return (
    <div className="result">
      <header className={`result-head ${r.outcome}`}>
        <Portrait id={ch.id} gender={ch.gender} className="thumb" />
        <div>
          <p className="muted">{ch.name}（{ch.gender === 'M' ? '男性' : '女性'}・{ch.job}）</p>
          <h1>{r.outcome === 'cleared' ? 'CLEAR' : 'GAME OVER'}</h1>
          <p className="headline">{r.headline}</p>
        </div>
      </header>

      <section className="card">
        <h2>経過</h2>
        <dl className="spec">
          <dt>期間</dt><dd>{elapsedLabel(state.day)}（{state.player.age}歳）</dd>
          <dt>累計支出</dt><dd>{man(r.totalSpend)}{r.specialLoss > 0 ? `（うち被害・特殊損失 ${man(r.specialLoss)}）` : ''}</dd>
          <dt>いいね</dt><dd>送信{s.likesSent}件→成立{s.likesSentMatched}件／受信{s.receivedTotal.toLocaleString()}件（確認{s.receivedReviewed.toLocaleString()}・返した{s.receivedAccepted}）</dd>
          <dt>段階</dt><dd>マッチ{s.matches}人 → 会話{s.conversations}人 → 会った相手{countMetPeople(state)}人（のべ{s.dates}回） → 交際{s.relationships}回</dd>
          <dt>ライフ</dt><dd>残り{state.life}（失った合計 {Object.values(r.lossByCategory).reduce((a, b) => a + b, 0)}、回復 {recovered}）</dd>
          {partner && <><dt>交際相手</dt><dd>{partner.name}（{partner.age}）</dd></>}
        </dl>
      </section>

      {r.outcome === 'gameover' && r.primary && (
        <section className="card feedback">
          <h2>失敗タイプ：{r.primary.title}</h2>
          <h3>事実として起きたこと</h3>
          <ul>{r.primary.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
          {r.secondary.length > 0 && (
            <>
              <h3>ほかに重なった要因</h3>
              <ul>{r.secondary.map((x) => <li key={x.type}><b>{x.title}</b>：{x.facts.join('／')}</li>)}</ul>
            </>
          )}
          {r.playerChoices.length > 0 && (<><h3>自分で変更できた選択</h3><ul>{r.playerChoices.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
          {r.externalFactors.length > 0 && (<><h3>相手や運による要因</h3><ul>{r.externalFactors.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}
          {r.suggestions.length > 0 && (<><h3>次の周回で試せる一手</h3><ol>{r.suggestions.map((t, i) => <li key={i}>{t}</li>)}</ol>
            <p className="muted small">変えれば必ず成功したとは限りません。ログに対応する候補です。</p></>)}
        </section>
      )}

      <section className="card">
        <h2>ライフ損失の内訳</h2>
        <ul className="bars">
          {cats.map(([k, v]) => (
            <li key={k}><span className="bl">{CAT[k] ?? k}</span><span className="bb"><i style={{ width: `${(v / maxCat) * 100}%` }} /></span><b>−{v}</b></li>
          ))}
        </ul>
        {events.length > 0 && (
          <>
            <h3>できごと別</h3>
            <ul className="evlist">{events.map(([k, v]) => <li key={k} title={k}>{eventName(k)}：−{v}</li>)}</ul>
          </>
        )}
      </section>

      {met.length > 0 && (
        <section className="card">
          <h2>相手側の事情（結果解説）</h2>
          <p className="muted small">プレイ中には分からなかった、この周回での相手の内部事情です。現実の相手の意図を断定するものではありません。</p>
          <ul className="reveal">
            {met.slice(0, 20).map((c) => {
              const npc = state.npcs[c.npcId];
              return (
                <li key={c.npcId}>
                  <b>{npc.name}（{npc.age}）</b>：{PURPOSE_LABEL[npc.purpose]}。
                  {c.endCause ? `結末：${c.endCause}。` : c.stage === 'relationship' ? '交際が続いた。' : ''}
                  {c.rejectReason === 'appearance' ? '（対面で初めて顔を見て、外見の相性から再会を望まなかった）' : c.rejectReason === 'future' ? '（将来性に不安を感じて再会を望まなかった）' : ''}
                  {c.photoJudgement === 'left' ? '（公開された写真を見て離れた）' : ''}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>この周回で起きたイベント</h2>
        <p className="small">{EVENTS.filter((e) => state.eventLog.some((l) => l.eventId === e.id)).map((e) => e.name).join('、') || 'なし'}</p>
        <p className="muted small">数値と確率はすべてゲーム用の仮設定で、現実の男女・職業ごとの成功率を表すものではありません。</p>
      </section>

      <div className="row center">
        <button className="btn primary big" onClick={onRestart}>別の人物で遊ぶ</button>
        <button className="btn ghost" onClick={onQuit}>タイトルへ</button>
      </div>
    </div>
  );
}
