// プロフィール見直し：条件の確認、14日経過後の写真公開、期限の見直し、履歴。ライフは回復しない（休息はなし）。
import { useState } from 'react';
import { focusUnlocked } from '../engine/clock';
import type { GameState } from '../engine/types';
import { lifestyleOf } from '../engine/data/lifestyles';
import { timeLabel } from '../engine/clock';
import { canPublishPhoto } from '../engine/chat';
import { isMember, memberFee } from '../engine/life';
import { DRINKING_LABEL, HOLIDAY_LABEL, MARITAL_LABEL, SMOKING_LABEL, educationInGame } from '../engine/data/characters';
import { areaLabel } from '../engine/data/areas';
import { DAYS_PER_MONTH, SPEC_PHOTO_PUBLISH_MIN_DAY } from '../engine/data/rules';
import { character, currentRates } from '../engine/state';
import type { TabProps } from './GameShell';
import { Portrait, Scenery, npcPhotoUrl } from './Avatar';
import { PLAYER_SCENERY } from '../engine/data/npcPhotos';
import { PLAYER_FACE } from '../engine/data/faceReveal';
import { HistoryPanel } from './HistoryPanel';
import { man, prefsSummary } from './format';

export function MyPageTab({ state, act, onQuit, onRestart }: TabProps & { onQuit: () => void; onRestart: () => void }) {
  const ch = character(state);
  const face = PLAYER_FACE[ch.id];
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const remainingDeadline = state.player.deadlineMonths - state.day / DAYS_PER_MONTH;
  const p = state.player.prefs;
  const appYears = Math.floor(state.player.appHistoryDays / DAYS_PER_MONTH / 12);
  const appMonths = Math.floor(state.player.appHistoryDays / DAYS_PER_MONTH) % 12;
  void currentRates;

  return (
    <div className="mypage">
      <section className="card profile">
        <h2>プロフィール</h2>
        <div className="prof-row">
          <div>
            {/* 顔写真なしで始めた人物は、本当の顔（顔かくしの素材）を出す（2026-11-10） */}
            {face ? (
              <div className="portrait medium"><img className="face" src={npcPhotoUrl(face)} alt={`${ch.name}の顔写真`} draggable={false} /></div>
            ) : (
              <Portrait id={ch.id} gender={ch.gender} className="medium" />
            )}
            <p className="muted small center">{state.player.photoVisible ? '相手にも見えている写真' : face ? 'あなたの顔（相手には見えていません）' : 'あなたの基準写真（相手には見えていません）'}</p>
          </div>
          {!state.player.photoVisible && (
            <div>
              <Scenery seed={ch.id} photo={PLAYER_SCENERY[ch.id]} />
              <p className="muted small center">相手が見ているプロフィール画像</p>
            </div>
          )}
        </div>
        <dl className="spec">
          <dt>年齢</dt><dd>{state.player.age}歳</dd>
          <dt>居住地</dt><dd>{areaLabel(ch.areaId)}</dd>
          <dt>職業</dt><dd>{ch.job}</dd>
          <dt>学歴</dt><dd>{educationInGame(ch.education)}</dd>
          <dt>年収</dt><dd>{ch.incomeLabel ?? man(ch.incomeYen)}</dd>
          <dt>身長</dt><dd>{ch.heightCm}cm</dd>
          <dt>結婚歴</dt><dd>{MARITAL_LABEL[ch.marital]}</dd>
          <dt>子ども</dt><dd>{ch.children > 0 ? `${ch.children}人（同居）` : 'なし'}</dd>
          <dt>タバコ・お酒</dt><dd>{SMOKING_LABEL[ch.smoking]}・{DRINKING_LABEL[ch.drinking]}</dd>
          <dt>休日</dt><dd>{HOLIDAY_LABEL[ch.holiday]}</dd>
          <dt>アプリ歴</dt><dd>{appYears > 0 ? `${appYears}年` : ''}{appMonths}か月</dd>
          <dt>希望の期限</dt><dd>{remainingDeadline >= 0 ? `あと約${Math.ceil(remainingDeadline)}か月` : `期限を${Math.ceil(-remainingDeadline)}か月超過`}</dd>
          <dt>検索条件</dt><dd>{prefsSummary(p).join('・')}（「さがす」の絞り込みで変更）</dd>
        </dl>
        {!ch.photoInitiallyVisible && !state.player.photoVisible && (
          <div className="publish">
            <h3>顔写真をプロフィールに載せる</h3>
            <p className="small">
              開始から{SPEC_PHOTO_PUBLISH_MIN_DAY}日経過すると選べます（現在{state.day}日経過）。一度載せると元に戻せません。
              公開しても容姿は変わりません。外見による判断が会う前に移るため、新しいマッチは減ることがありますが、会ってから断られる可能性は下がります。
              今やり取りしている相手も、写真を見た時点で続けるかを決めます。
            </p>
            {!confirmPublish ? (
              <button className="btn" disabled={!canPublishPhoto(state)} onClick={() => setConfirmPublish(true)}>顔写真を載せる</button>
            ) : (
              <div className="row">
                <button className="btn primary" onClick={() => { act({ type: 'publishPhoto' }); setConfirmPublish(false); }}>公開する</button>
                <button className="btn ghost" onClick={() => setConfirmPublish(false)}>やめる</button>
              </div>
            )}
          </div>
        )}
        {!ch.photoInitiallyVisible && state.player.photoVisible && <p className="small">{state.player.photoPublishedDay}日目に顔写真を公開しました。</p>}
      </section>

      {state.gender === 'M' && (
        <section className="card">
          <h2>有料会員</h2>
          {isMember(state) ? (
            <p className="small">加入中：あと{(state.player.memberUntil ?? state.day) - state.day}日（{state.player.memberUntil}日目まで）。自動では更新されません。</p>
          ) : (
            <>
              <p className="small">未加入。いいねは無料ですが、アプリ内でメッセージを送るには30日{memberFee(state).toLocaleString()}円の有料会員が必要です。返事が来なくても返金はありません。</p>
              <button className="btn" onClick={() => act({ type: 'subscribe' })}>{memberFee(state).toLocaleString()}円で30日間加入する</button>
            </>
          )}
          <p className="muted small">これまでに払った利用料：{man(state.money.filter((m) => m.category === 'fee').reduce((a, m) => a + m.yen, 0))}</p>
        </section>
      )}

      <section className="card">
        <h2>期限の見直し</h2>
        <p className="small">ライフは回復しません。休んでも時間は進み、消耗だけが残ります。</p>
        {!state.player.deadlineExtended && (
          <div className="deadline">
            <p className="small">交際開始の希望期限は、1周に1度だけ最大6か月見直せます。過去のアプリ歴は戻りません。</p>
            <div className="row">
              <button className="btn ghost small" onClick={() => act({ type: 'extendDeadline', months: 3 })}>3か月延ばす</button>
              <button className="btn ghost small" onClick={() => act({ type: 'extendDeadline', months: 6 })}>6か月延ばす</button>
            </div>
          </div>
        )}
      </section>

      <section className="card history-mobile">
        <HistoryPanel state={state} />
      </section>

      <section className="card">
        <h2>生活リズム</h2>
        <LifestyleInfo state={state} />
        <p className="small muted">アプリを閉じるとロック画面になり、時間が進みます（自由時間は約13秒で1日）。睡眠・仕事・予定の間はアプリを開けません。</p>
      </section>

      <section className="card">
        <h2>通知</h2>
        <p className="small muted">オフにした通知はロック画面に出ません（届いたいいね・メッセージはアプリで見られます）。</p>
        <label className="toggle-row">
          <input type="checkbox" checked={state.notify?.likes !== false} onChange={(e) => act({ type: 'setNotify', key: 'likes', on: e.target.checked })} />
          <span>いいね・マッチの通知</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={state.notify?.talk !== false} onChange={(e) => act({ type: 'setNotify', key: 'talk', on: e.target.checked })} />
          <span>トーク（メッセージ）の通知</span>
        </label>
        {focusUnlocked(state) && <label className="toggle-row">
          <input type="checkbox" checked={!!state.focusMode} onChange={(e) => act({ type: 'setFocus', on: e.target.checked })} />
          <span>トークに集中するモード（いいねの通知を出さず、アプリを閉じたらメッセージが届くまで早送り。いいねはたまっていく）</span>
        </label>}
        {state.partnerId && <p className="small muted">交際中は、いいねの通知を出さず、恋人からの連絡まで早送りします。</p>}
      </section>

      <section className="card">
        <h2>セーブ</h2>
        <p className="small muted">操作のたびに自動保存しています（このブラウザ内）。シード：{state.seed}</p>
        <div className="row">
          <button className="btn ghost" onClick={onQuit}>タイトルへ戻る</button>
          {!confirmRestart ? (
            <button className="btn ghost danger" onClick={() => setConfirmRestart(true)}>セーブを消して最初から</button>
          ) : (
            <button className="btn danger" onClick={onRestart}>本当に消す</button>
          )}
        </div>
      </section>

      <section className="card thanks" aria-label="Special thanks">
        <h2>Special thanks</h2>
        <ul className="thanks-list">
          <li>陰キャ文学 <span className="muted">@cheeeee9</span></li>
        </ul>
      </section>
    </div>
  );
}

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];

/** 人物の生活リズム（2026-11-13）：アプリを開けない時間帯の目安 */
function LifestyleInfo({ state }: { state: GameState }) {
  const ls = lifestyleOf(state.characterId);
  const w = ls.work;
  const days = w.days.length === 7 ? '毎日（シフトで休みあり）' : w.days.map((d) => WEEK[d]).join('・') + (w.rotatingOff ? `（週${w.rotatingOff}日はシフトで休み）` : '');
  const rows: [string, string][] = [
    ['仕事', `${ls.occupation}`],
    ['勤務', w.kind === 'part' ? 'パート・アルバイト（決まった勤務の時間帯はなし）' : w.kind === 'none' ? 'なし' : `${days} ${timeLabel(w.start)}〜${timeLabel(w.end)}${w.kind === 'remote' ? '（在宅）' : ''}`],
    ['睡眠', `${timeLabel(ls.sleep)}〜${timeLabel(ls.wake)}`],
  ];
  if (ls.overtime) rows.push(['残業', `会えない平日の夜は${timeLabel(ls.overtime.until)}ごろまで`]);
  const wfh = character(state).homeWorkPerWeek;
  if (wfh) rows.push(['在宅勤務', `週${wfh}日（その日は勤務中もアプリを開ける）`]);
  return (
    <dl className="spec small">
      {rows.map(([k, v]) => (<div key={k} className="row"><dt>{k}</dt><dd>{v}</dd></div>))}
    </dl>
  );
}
