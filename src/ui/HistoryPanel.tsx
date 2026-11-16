// ライフ減少の理由と費用を履歴から確かめる。
import { useState } from 'react';
import { eventName, eventVisibleName } from '../engine/data/events';
import type { GameState } from '../engine/types';
import { man, yen } from './format';

const CATEGORY_LABEL: Record<string, string> = {
  weekly: '週の成果不足', monthly: '月末の消耗', budget: '予算超過', event: 'できごと', depth: '関係の深さ', fatigue: '比較疲れ', talk: 'トーク', recovery: '回復',
};
const MONEY_LABEL: Record<string, string> = {
  fee: '利用料', date: 'デート', transport: '交通費', prep: '身支度', boost: '任意の課金', gift: '贈り物', special: '被害・特殊損失',
};

export function HistoryPanel({ state }: { state: GameState }) {
  const [tab, setTab] = useState<'life' | 'money'>('life');
  const life = [...state.ledger].reverse().slice(0, 80);
  const money = [...state.money].reverse().slice(0, 80);
  const total = state.money.reduce((a, m) => a + m.yen, 0);
  const special = state.money.filter((m) => m.special).reduce((a, m) => a + m.yen, 0);
  return (
    <div className="history">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'life'} className={tab === 'life' ? 'on' : ''} onClick={() => setTab('life')}>ライフの増減</button>
        <button role="tab" aria-selected={tab === 'money'} className={tab === 'money' ? 'on' : ''} onClick={() => setTab('money')}>支出</button>
      </div>
      {tab === 'life' ? (
        <ul className="ledger">
          {life.length === 0 && <li className="muted small">まだ記録はありません。</li>}
          {life.map((e, i) => (
            <li key={i} className={e.delta < 0 ? 'neg' : e.delta > 0 ? 'pos' : 'zero'}>
              <span className="d">{e.day}日目</span>
              <span className="v">{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
              <span className="n">
                <span className="cat" title={e.eventId}>{e.eventId ? (state.status === 'playing' ? eventVisibleName(e.eventId) : eventName(e.eventId)) : CATEGORY_LABEL[e.category]}</span>
                {e.note}
                {e.detail && <small>{e.detail}</small>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="small">累計 <b>{man(total)}</b>{special > 0 ? `（うち被害・特殊損失 ${man(special)}）` : ''}</p>
          <ul className="ledger">
            {money.map((m, i) => (
              <li key={i} className={m.special ? 'neg' : ''}>
                <span className="d">{m.day}日目</span>
                <span className="v">{yen(m.yen)}</span>
                <span className="n"><span className="cat">{MONEY_LABEL[m.category]}</span>{m.note}</span>
              </li>
            ))}
          </ul>
          {state.stats.monthlySpend.length > 0 && (
            <table className="months">
              <thead><tr><th>期間</th><th>支出</th><th>予算</th></tr></thead>
              <tbody>
                {state.stats.monthlySpend.map((m) => (
                  <tr key={m.month} className={m.spend > m.budget ? 'over' : ''}>
                    <td>{m.month}か月目</td><td>{man(m.spend)}</td><td>{man(m.budget)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
