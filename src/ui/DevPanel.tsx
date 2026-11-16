// 開発用（URLに ?dev=1）：シード指定、状態確認、イベント分岐の再現。通常プレイには表示しない。
import { useState } from 'react';
import type { Action } from '../engine/actions';
import { DEV_SCENARIOS } from '../engine/devScenarios';
import { PURPOSE_LABEL } from '../engine/data/rules';
import { deserialize, serialize } from '../engine/save';
import type { GameState } from '../engine/types';

export function DevPanel({ state, load, act }: { state: GameState | null; load: (s: GameState) => void; act: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  if (!open) return <button className="dev-toggle" onClick={() => setOpen(true)}>DEV</button>;
  return (
    <div className="dev-panel">
      <div className="row between"><b>開発用パネル</b><button className="link" onClick={() => setOpen(false)}>閉じる</button></div>
      {state && (
        <>
          <p className="small">seed={state.seed} day={state.day} life={state.life} rng=[{state.rng.join(',')}] npcs={Object.keys(state.npcs).length} pending={state.pending.length}</p>
          <div className="row">
            <button className="btn small" onClick={() => act({ type: 'advance' })}>週を進める</button>
            <button className="btn small" onClick={() => {
              const blob = new Blob([serialize(state)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `machiapu-${state.characterId}-${state.seed}-d${state.day}.json`;
              a.click();
            }}>状態をJSONで保存</button>
            <label className="btn small">JSONを読込
              <input type="file" accept="application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(deserialize(await f.text()));
              }} />
            </label>
          </div>
          <label className="check small"><input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />相手の内部状態を表示（開発用）</label>
          {showInternal && (
            <ul className="dev-list">
              {Object.values(state.contacts).filter((c) => c.stage !== 'like_failed').map((c) => {
                const n = state.npcs[c.npcId];
                return <li key={c.npcId}>{n.id} {n.name} [{c.stage}] {PURPOSE_LABEL[n.purpose]} 興味{c.interest} 顔{c.faceKnown ? `既知(${c.faceKnownVia})` : '未知'} {c.postDateDecision ?? ''} {c.flags.sendP !== undefined ? `p=${c.flags.sendP}` : ''} {c.flags.persona ? `${c.flags.persona} 格差${c.flags.tier} 温度L${c.flags.level}（基準L${c.flags.baseLevel}）到達${c.flags.reach ?? '-'}` : ''}</li>;
              })}
            </ul>
          )}
        </>
      )}
      <details>
        <summary>E01〜E24 再現ケース</summary>
        <ul className="dev-list">
          {DEV_SCENARIOS.map((sc) => (
            <li key={sc.id}><button className="link" onClick={() => load(sc.run())}>{sc.label}</button></li>
          ))}
        </ul>
      </details>
    </div>
  );
}
