// デート：カレンダーで予定を確認し、これまでのデートの感触（その日に見えたこと）を振り返る。
// 感触はプレイヤーが受け取った印象で、相手の本心（再会したいか）とは一致しないことがある。
import { useState } from 'react';
import { playerFree, privateEventOn, workFromHome } from '../engine/dates';
import { TUNE_VENUES } from '../engine/data/rules';
import type { Contact, DateRecord, GameState, Impression } from '../engine/types';
import type { TabProps } from './GameShell';
import { NpcAvatar } from './Avatar';
import { dateLabel, inDays, weekdayLabel, yen } from './format';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export const IMPRESSION_LABEL: Record<Impression, { mark: string; text: string; tone: string }> = {
  good: { mark: '◎', text: '手応えあり', tone: 'good' },
  okay: { mark: '○', text: 'まずまず', tone: 'okay' },
  awkward: { mark: '△', text: '微妙', tone: 'awkward' },
  bad: { mark: '✕', text: 'よくなかった', tone: 'bad' },
};

function cellDate(d: number): string {
  const day = (d % 30) + 1;
  return day === 1 ? `${Math.floor(d / 30) + 1}か月目 1` : String(day);
}

/** デートのあと、画面上で分かったこと（相手の内部事情は出さない） */
function afterLabel(state: GameState, c: Contact, rec: DateRecord): string {
  if (rec.outcome === 'noshow') return '相手は来なかった（連絡なし）';
  if (rec.outcome === 'canceled') return '当日にキャンセルされた';
  if (c.dates.some((d) => d.day > rec.day)) return '次のデートにつながった';
  if (c.stage === 'relationship') return '交際が始まった';
  if (c.stage === 'ended') return [...c.messages].reverse().find((m) => m.from === 'system')?.text ?? 'やり取りは終わった';
  if (c.nextDate) return `次の予定：${inDays(c.nextDate.day - state.day)}`;
  const reply = [...c.messages].reverse().find((m) => m.from === 'them' && m.day >= rec.day);
  if (reply) return `相手から：「${reply.text}」`;
  return '相手の返事を待っている';
}

/** カレンダーのマスに収まる短い呼び名 */
const PRIVATE_SHORT: Record<string, string> = {
  会社の飲み会: '飲み会', 友人と外出: '友人', 実家に帰る: '帰省', 友人の誕生日会: '誕生会', 大学の友人とランチ: 'ランチ',
  取引先と会食: '会食', 家の用事: '用事', 同期と飲み: '飲み', シフト勤務: '仕事', 子どもの習い事: '習い事', 保育園の行事: '行事',
};
function shortPrivate(label: string): string {
  return PRIVATE_SHORT[label] ?? label;
}

function Calendar({ state, onPick }: { state: GameState; onPick: (npcId: string) => void }) {
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const start = Math.max(0, (Math.floor(state.day / 7) - 1 + offsetWeeks) * 7);
  const days = Array.from({ length: 42 }, (_, i) => start + i);
  const planned = new Map<number, { c: Contact; tier: keyof typeof TUNE_VENUES }[]>();
  const past = new Map<number, { c: Contact; rec: DateRecord }[]>();
  for (const c of Object.values(state.contacts)) {
    if (c.nextDate) {
      const arr = planned.get(c.nextDate.day) ?? [];
      arr.push({ c, tier: c.nextDate.tier });
      planned.set(c.nextDate.day, arr);
    }
    // 交際中のデート（カレンダーで選んだ日）
    const relDay = Number(c.flags.relDateDay ?? -1);
    if (c.stage === 'relationship' && relDay >= state.day) {
      const arr = planned.get(relDay) ?? [];
      arr.push({ c, tier: (c.flags.relDateTier as keyof typeof TUNE_VENUES | undefined) ?? 'cafe' });
      planned.set(relDay, arr);
    }
    for (const rec of c.dates) {
      const arr = past.get(rec.day) ?? [];
      arr.push({ c, rec });
      past.set(rec.day, arr);
    }
  }
  return (
    <section className="card calendar">
      <div className="cal-head">
        <button className="btn ghost small" onClick={() => setOffsetWeeks(offsetWeeks - 4)} disabled={start === 0} aria-label="前の4週">‹</button>
        <b>{Math.floor(start / 30) + 1}か月目〜</b>
        <button className="btn ghost small" onClick={() => setOffsetWeeks(0)}>今日</button>
        <button className="btn ghost small" onClick={() => setOffsetWeeks(offsetWeeks + 4)} aria-label="次の4週">›</button>
      </div>
      <div className="cal-grid" role="grid" aria-label="デートのカレンダー">
        {WEEKDAYS.map((w, i) => <div key={w} className={`cal-wd ${i >= 5 ? 'we' : ''}`} role="columnheader">{w}</div>)}
        {days.map((d) => {
          const isToday = d === state.day;
          const future = d > state.day;
          const free = future && playerFree(state, d);
          const plans = planned.get(d) ?? [];
          const done = past.get(d) ?? [];
          return (
            <div key={d} role="gridcell" className={`cal-cell ${d % 7 >= 5 ? 'we' : ''} ${isToday ? 'today' : ''} ${d < state.day ? 'past' : ''}`} aria-label={`${d + 1}日目${plans.length ? `、予定${plans.length}件` : ''}`}>
              <span className="cal-num">{cellDate(d)}{free && <i className="free-dot" title="あなたが会える日" />}</span>
              {plans.map(({ c, tier }) => (
                <button key={c.npcId} className="cal-pill plan" onClick={() => onPick(c.npcId)}>{state.npcs[c.npcId].name}・{TUNE_VENUES[tier].label.slice(0, 4)}</button>
              ))}
              {d >= state.day && plans.length === 0 && privateEventOn(state, d) && (
                <span className="cal-pill private" title={privateEventOn(state, d)}>{shortPrivate(privateEventOn(state, d)!)}</span>
              )}
              {d >= state.day && workFromHome(state, d) && (
                <span className="cal-pill private" title={state.gender === 'F' ? '在宅ワークの日（デートをすると化粧が必要・ライフ −1）' : '在宅ワークの日'}>在宅</span>
              )}
              {done.map(({ c, rec }) => (
                <span key={c.npcId} className={`cal-pill done ${rec.impression ?? ''}`}>{rec.impression ? IMPRESSION_LABEL[rec.impression].mark : ''}{state.npcs[c.npcId].name}</span>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted small"><i className="free-dot" /> はあなたが会える日（仕事・育児・シフトの都合）。灰色はマチアプと関係ない予定。予定は相手との日程調整で決まります。</p>
    </section>
  );
}

export function DateTab({ state, go }: TabProps) {
  const upcoming = Object.values(state.contacts).filter((c) => c.nextDate).sort((a, b) => a.nextDate!.day - b.nextDate!.day);
  const history = Object.values(state.contacts)
    .flatMap((c) => c.dates.map((rec) => ({ c, rec })))
    .sort((a, b) => b.rec.day - a.rec.day);
  return (
    <div className="date-tab">
      <Calendar state={state} onPick={(id) => go('talk', id)} />

      <section className="card">
        <h2>これからの予定</h2>
        {upcoming.length === 0 ? <p className="muted small">予定はありません。トークでデートに誘うか、相手からの誘いを待ちましょう。</p> : (
          <ul className="plan-list">
            {upcoming.map((c) => {
              const npc = state.npcs[c.npcId];
              const d = c.nextDate!;
              return (
                <li key={c.npcId}>
                  <button className="plan" onClick={() => go('talk', c.npcId)}>
                    <NpcAvatar npc={npc} size="sm" />
                    <span><b>{inDays(d.day - state.day)}（{weekdayLabel(d.day)}）</b>　{npc.name}と{TUNE_VENUES[d.tier].label}<small className="muted">（{d.proposedBy === 'me' ? '自分から誘った' : '相手から誘われた'}・{c.meetings === 0 ? '初めて会う' : `${c.meetings + 1}回目`}）</small></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>これまでのデートと感触</h2>
        <p className="muted small">感触はその日に受け取った印象です。相手の本心とは限りません。</p>
        {history.length === 0 && <p className="muted small">まだデートはしていません。</p>}
        <ul className="date-history">
          {history.map(({ c, rec }) => {
            const npc = state.npcs[c.npcId];
            const imp = rec.impression ? IMPRESSION_LABEL[rec.impression] : undefined;
            return (
              <li key={`${c.npcId}-${rec.day}`} className="dh-item">
                <div className="dh-head">
                  <NpcAvatar npc={npc} size="sm" />
                  <div className="dh-info">
                    <b>{npc.name}（{npc.age}）</b>
                    <div className="muted small">{dateLabel(rec.day)}（{weekdayLabel(rec.day)}）・{TUNE_VENUES[rec.tier].label}・使ったお金 {yen(rec.costYen)}</div>
                  </div>
                  {imp && <span className={`imp ${imp.tone}`}>{imp.mark} {imp.text}</span>}
                </div>
                {rec.notes && rec.notes.length > 0 && (
                  <ul className="dh-notes">{rec.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                )}
                <p className="dh-after small"><span className="muted">その後：</span>{afterLabel(state, c, rec)}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
