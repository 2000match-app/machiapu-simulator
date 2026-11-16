import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollToTop } from './ui/scroll';
import { dispatch, newGame, type Action } from './engine/actions';
import { isAdvancing, isResting } from './engine/advance';
import { clockOf, lockMode, nextStop } from './engine/clock';
import { clearStorage, loadFromStorage, saveToStorage } from './engine/save';
import type { GameState } from './engine/types';
import { SelectScreen } from './ui/SelectScreen';
import { GameShell, type Tab } from './ui/GameShell';
import { LockScreen } from './ui/LockScreen';
import { DevPanel } from './ui/DevPanel';

const DEV = new URLSearchParams(window.location.search).has('dev');

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [hasSave, setHasSave] = useState(() => loadFromStorage() !== null);
  const [nav, setNav] = useState<{ tab: Tab; npcId?: string; key: number } | undefined>();
  const ref = useRef<GameState | null>(null);
  const lastSave = useRef(0);

  /** save=false：ロック画面で時刻だけが進んだとき（保存は2秒に1回まで） */
  const commit = useCallback((next: GameState | null, save = true) => {
    ref.current = next;
    setGame(next);
    if (next && (save || Date.now() - lastSave.current > 2000)) {
      saveToStorage(next);
      lastSave.current = Date.now();
      setHasSave(true);
    }
  }, []);

  const act = useCallback((a: Action) => {
    const cur = ref.current;
    if (!cur) return;
    // ロック画面の自由時間：予定・出来事・日付変更の手前なら時刻だけを進める（毎回の全体コピーを避ける。2026-11-13）
    if (a.type === 'advanceFree' && lockMode(cur) === 'free' && clockOf(cur) + a.minutes < nextStop(cur)) {
      commit({ ...cur, clock: clockOf(cur) + a.minutes }, false);
      return;
    }
    let next = dispatch(cur, a);
    // 開発用の「週を進める」などで場面に止まった場合、選択が終わったら残りの日数を続けて進める
    if (a.type === 'resolve' && next.pending.length === 0 && next.status === 'playing') {
      if (isAdvancing(next)) next = dispatch(next, { type: 'continue' });
      else if (isResting(next)) next = dispatch(next, { type: 'advance' });
    }
    commit(next);
  }, [commit]);

  useEffect(() => {
    document.title = game ? `マチアプシミュレーター｜${game.characterId}` : 'マチアプシミュレーター';
  }, [game?.characterId, game]);

  const start = (id: string, seed: string) => {
    commit(newGame(id, seed));
    scrollToTop();
  };

  const unlock = (to?: { tab: Tab; npcId?: string }) => {
    setNav(to ? { ...to, key: Date.now() } : undefined);
    act({ type: 'openApp' });
    scrollToTop();
  };

  return (
    <>
      {game ? (
        game.screen === 'lock' && (game.status === 'playing' || !game.result) ? (
          <LockScreen state={game} act={act} onUnlock={unlock} />
        ) : (
          <GameShell
            key={nav?.key ?? 0}
            state={game}
            act={act}
            nav={nav}
            onQuit={() => commit(null)}
            onRestart={() => {
              clearStorage();
              setHasSave(false);
              commit(null);
            }}
          />
        )
      ) : (
        <SelectScreen
          onStart={start}
          hasSave={hasSave}
          onContinue={() => {
            const s = loadFromStorage();
            if (s) commit(s);
          }}
        />
      )}
      {DEV && <DevPanel state={game} load={(s) => commit(s)} act={act} />}
    </>
  );
}
