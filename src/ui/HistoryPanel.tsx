// 支出の履歴（マイページ）。ライフの増減の履歴は 2026-11-26 の指示でマイページから外した。
import type { GameState } from '../engine/types';
import { man, yen } from './format';

const MONEY_LABEL: Record<string, string> = {
  fee: '利用料', date: 'デート', transport: '交通費', prep: '身支度', boost: '任意の課金', gift: '贈り物', special: '被害・特殊損失',
};

export function HistoryPanel({ state }: { state: GameState }) {
  const money = [...state.money].reverse().slice(0, 80);
  const total = state.money.reduce((a, m) => a + m.yen, 0);
  const special = state.money.filter((m) => m.special).reduce((a, m) => a + m.yen, 0);
  return (
    <div className="history">
      <h2>支出</h2>
      <p className="small">累計 <b>{man(total)}</b>{special > 0 ? `（うち被害・特殊損失 ${man(special)}）` : ''}</p>
      <ul className="ledger">
        {money.length === 0 && <li className="muted small">まだ記録はありません。</li>}
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
    </div>
  );
}
