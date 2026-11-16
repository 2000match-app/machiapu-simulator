// デート・重要イベントの場面。事前にすべての隠れた確率や正解は見せない。
import { playerFree, privateEventOn, weekendPlan, workFromHome } from '../engine/dates';
import { clockOf, timeLabel, visiblePending } from '../engine/clock';
import { monthBudget } from '../engine/life';
import { useEffect, useRef } from 'react';
import type { Action } from '../engine/actions';
import type { GameState } from '../engine/types';
import { NpcAvatar } from './Avatar';
import { calendarParts, dateLabel, educationOf, incomeOf, man, weekdayLabel } from './format';

/** 相手のスペックを見せる場面（デート中・デートの前後・交際中） */
const SPEC_KINDS = /^(date_|night_invite|meshi_request|rel_|e1[05]|married_reveal)/;
/** デート中の場面（相手の写真を大きく出す） */
const DATE_KINDS = /^(date_(talk|e0|e1|bar|role|pay|touch|bail)|e25|night_invite)/;

export function EventModal({ state, act }: { state: GameState; act: (a: Action) => void }) {
  // 届く時刻が来た出来事だけを見せる（2026-11-13）
  const ev = visiblePending(state)[0];
  const npc = ev.npcId ? state.npcs[ev.npcId] : undefined;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button.choice')?.focus();
  }, [ev.uid]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={`ev-${ev.uid}`}>
      <div className="modal" ref={ref}>
        <div className="ev-head">
          {npc && <NpcAvatar npc={npc} size="sm" />}
          <div>
            <div className="muted small">{dateLabel(state.day)}（{weekdayLabel(state.day)}）{timeLabel(clockOf(state))}{visiblePending(state).length > 1 ? `・ほかに${visiblePending(state).length - 1}件` : ''}</div>
            <h2 id={`ev-${ev.uid}`}>{ev.title}</h2>
            {/* デート中の選択では相手のスペックを見ながら選べる（2026-11-07 指示） */}
            {npc && SPEC_KINDS.test(ev.kind) && (
              <div className="ev-spec small">{npc.name}・{npc.age}歳・{npc.job.replace(/（.*）/, '')}・年収{incomeOf(npc)}・{npc.heightCm}cm・{educationOf(npc)}</div>
            )}
          </div>
        </div>
        {/* デート中は相手の写真を大きく出す（2026-11-12 指示）。実際の顔の比較がある場面はそちらを出す */}
        {npc && !ev.image && DATE_KINDS.test(ev.kind) && (
          <figure className="ev-date-photo">
            {npc.photo ? <img src={`${import.meta.env.BASE_URL}npc/${npc.photo}`} alt={`${npc.name}の写真`} /> : <NpcAvatar npc={npc} size="xl" />}
          </figure>
        )}
        {ev.image && (
          <figure className="ev-image">
            <div className="ev-image-pair">
              {npc?.photo && (
                <span><img src={`${import.meta.env.BASE_URL}npc/${npc.photo}`} alt="プロフィールの写真" /><small>プロフィールの写真</small></span>
              )}
              <span><img src={`${import.meta.env.BASE_URL}npc/${ev.image.file}`} alt={ev.image.caption} /><small>{ev.image.label ?? '実際'}</small></span>
            </div>
            <figcaption className="muted small">{ev.image.caption}</figcaption>
          </figure>
        )}
        <div className="ev-lines">
          {ev.lines.map((l, i) => (
            <p key={i} className={`line ${l.who}`}>
              {l.who === 'them' && npc && <span className="speaker">{npc.name}</span>}
              {l.text}
            </p>
          ))}
        </div>
        {ev.kind === 'date_nomatch' && (
          <NoMatchCalendar today={state.day} proposed={String(ev.data?.proposed ?? '').split(',').filter(Boolean).map(Number)} busy={(d) => busyLabel(state, d)} />
        )}
        {ev.kind === 'date_pick' || ev.kind === 'rel_pick' ? (
          <DatePicker today={state.day} days={ev.choices.map((c) => Number(c.id))} busy={(d) => privateEventOn(state, d)} note={(d) => (workFromHome(state, d) ? (state.gender === 'F' ? '在宅・化粧' : '在宅') : undefined)} onPick={(d) => act({ type: 'resolve', uid: ev.uid, choiceId: String(d) })} />
        ) : (
        <div className="ev-choices">
          {ev.choices.map((c) => (
            <button key={c.id} className="btn choice" onClick={() => act({ type: 'resolve', uid: ev.uid, choiceId: c.id })}>
              {c.label}
              {c.sub && <small>{c.sub}</small>}
            </button>
          ))}
        </div>
        )}
        <div className="ev-foot" aria-label={`ライフ ${state.life}/100`}>
          <span className="muted small">今月 {man(state.monthSpend)}／予算 {man(monthBudget(state))}</span>
          <span>ライフ</span>
          <span className={`mini-bar ${state.life > 60 ? 'ok' : state.life > 30 ? 'mid' : 'low'}`}><i style={{ width: `${state.life}%` }} /></span>
          <b>{state.life}<small>/100</small></b>
        </div>
      </div>
    </div>
  );
}

/** デートの日付を選ぶカレンダー（月曜始まり）。選べるのはお互いに空いている日だけ */
function DatePicker({ today, days, busy, note, onPick }: { today: number; days: number[]; busy: (day: number) => string | undefined; note?: (day: number) => string | undefined; onPick: (day: number) => void }) {
  const ok = new Set(days);
  const first = today - (today % 7); // 今週の月曜
  const last = Math.max(...days);
  const cells: number[] = [];
  for (let d = first; d <= last + (6 - (last % 7)); d++) cells.push(d);
  return (
    <div className="date-picker">
      <p className="dp-legend"><span className="lg ok">◎ 会える日</span><span className="lg off">予定あり・相手が無理な日</span></p>
      <MonthLabel cells={cells} />
      <div className="dp-grid" role="grid" aria-label="デートの日付">
        {['月', '火', '水', '木', '金', '土', '日'].map((w, i) => <span key={w} className={`dp-head${i >= 5 ? ' we' : ''}`}>{w}</span>)}
        {cells.map((d) => ok.has(d) ? (
          <button key={d} className="dp-day choice" onClick={() => onPick(d)} aria-label={`${dateLabel(d)}（${weekdayLabel(d)}）・${d - today}日後`}>
            <i className="dp-mark" aria-hidden="true">◎</i>
            <b>{calendarParts(d).d}</b><small>{d - today}日後</small>{note?.(d) && <small className="dp-busy">{note(d)}</small>}
          </button>
        ) : (
          <span key={d} className={`dp-day off${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}>{calendarParts(d).d}{d === today ? <small>今日</small> : d > today && busy(d) ? <small className="dp-busy">{busy(d)}</small> : null}</span>
        ))}
      </div>
      <p className="muted small">◎の日が、お互いに空いている日です。タップして決めます。</p>
    </div>
  );
}

/** 表示している範囲の月（「11月」「11月〜12月」） */
function MonthLabel({ cells }: { cells: number[] }) {
  const a = calendarParts(cells[0]).m;
  const b = calendarParts(cells[cells.length - 1]).m;
  return <p className="dp-month">{a === b ? `${a}月` : `${a}月〜${b}月`}</p>;
}

/** その日の自分の予定（候補日のカレンダー用）：私用・休日の予定・ほかの人とのデート・それ以外の用事 */
function busyLabel(state: GameState, d: number): string | undefined {
  const other = Object.values(state.contacts).find((c) => c.nextDate?.day === d);
  return privateEventOn(state, d) ?? weekendPlan(state, d) ?? (other ? `${state.npcs[other.npcId]?.name ?? '別の人'}とデート` : undefined) ?? (playerFree(state, d) ? undefined : '予定あり');
}

/** 予定が合わない時のカレンダー（2026-11-09 指示）：相手の候補日に自分の予定が入っているのを見せる */
function NoMatchCalendar({ today, proposed, busy }: { today: number; proposed: number[]; busy: (day: number) => string | undefined }) {
  if (proposed.length === 0) return null;
  const ng = new Set(proposed);
  const first = today - (today % 7);
  const last = Math.max(...proposed);
  const cells: number[] = [];
  for (let d = first; d <= last + (6 - (last % 7)); d++) cells.push(d);
  return (
    <div className="date-picker">
      <p className="dp-legend"><span className="lg ng">✕ 相手の候補日（自分は予定あり）</span></p>
      <MonthLabel cells={cells} />
      <div className="dp-grid" role="grid" aria-label="相手の候補日と自分の予定">
        {['月', '火', '水', '木', '金', '土', '日'].map((w, i) => <span key={w} className={`dp-head${i >= 5 ? ' we' : ''}`}>{w}</span>)}
        {cells.map((d) => (
          <span key={d} className={`dp-day ${ng.has(d) ? 'ng' : 'off'}${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}>
            {ng.has(d) && <i className="dp-mark" aria-hidden="true">✕</i>}
            {calendarParts(d).d}
            {d === today ? <small>今日</small> : ng.has(d) ? <small className="dp-busy">{busy(d) ?? '予定あり'}</small> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
