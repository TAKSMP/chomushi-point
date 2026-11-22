import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BackButton, Loading, PillButton, Screen, TitleBoard, TopBar, fit } from '../components/ui';
import { axisMax, buildDailySeries, dayLabel, formatPoints, type Day } from '../lib/scoring';
import { navigate } from '../router';
import { useApp } from '../store';

const COL = 44;      // px per day
const ROW_H = 76;    // px per player row (keep in sync with --row-h in CSS)
const PAD_X = 22;
const TOP = 16;      // room for value labels
const BOTTOM = ROW_H - 10;
const yOf = (v: number, max: number) => BOTTOM - (v / max) * (BOTTOM - TOP);

function shortNum(n: number) {
  if (n >= 100000000) return `${Math.round(n / 100000000)}おく`;
  if (n >= 10000) return `${Math.round(n / 1000) / 10}まん`;
  return String(n);
}

/** Fixed (non-scrolling) vertical axis shared by every row. */
function YAxis({ max }: { max: number }) {
  return (
    <div className="y-axis" aria-hidden="true">
      {[max, max / 2, 0].map((v) => (
        <span key={v} style={{ top: yOf(v, max) }}>{shortNum(v)}</span>
      ))}
    </div>
  );
}

function Spark({ values, max }: { values: number[]; max: number }) {
  const w = PAD_X * 2 + COL * (values.length - 1);
  const x = (i: number) => PAD_X + i * COL;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yOf(v, max)}`).join(' ');
  return (
    <svg className="spark" width={w} height={ROW_H} viewBox={`0 0 ${w} ${ROW_H}`} aria-hidden="true">
      {[max, max / 2].map((v) => <line key={v} x1={0} x2={w} y1={yOf(v, max)} y2={yOf(v, max)} className="grid-h" />)}
      {values.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={TOP - 4} y2={BOTTOM} className="grid-v" />)}
      <line x1={0} x2={w} y1={BOTTOM} y2={BOTTOM} className="grid-base" />
      {values.length > 1 && <path d={d} className="line" />}
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={yOf(v, max)} r={v > 0 ? 3.2 : 2} className={v > 0 ? 'dot' : 'dot zero'} />
          {v > 0 && <text x={x(i)} y={yOf(v, max) - 6} className="val">{shortNum(v)}</text>}
        </g>
      ))}
    </svg>
  );
}

function DayHeader({ days }: { days: Day[] }) {
  const w = PAD_X * 2 + COL * (days.length - 1);
  return (
    <div className="period-head" style={{ width: w }}>
      {days.map((d, i) => (
        <span key={d.key} className="period" style={{ left: PAD_X + i * COL }}>
          {(i === 0 || d.year !== days[i - 1].year) && <em>{d.year}</em>}
          {dayLabel(d)}
        </span>
      ))}
    </div>
  );
}

export function Points() {
  const { players, stats, loaded, refresh, syncError } = useApp();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void refresh(); }, [refresh]);

  const { days, series } = useMemo(
    () => buildDailySeries(stats.results, players.map((p) => p.id)),
    [stats.results, players],
  );
  // one shared scale for everyone: 0–50, then 0–100, 0–150, …
  const max = useMemo(() => axisMax(Math.max(0, ...Object.values(series).flat())), [series]);

  // open on the latest half-month
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length, players.length]);

  return (
    <Screen className="points">
      <TopBar left={<BackButton />} />
      <TitleBoard>みんなのポイント</TitleBoard>
      {syncError && <p className="sync-banner" role="alert">⚠ {syncError}</p>}
      <section className="panel">
        <div className="panel-paper">
          {!loaded ? <Loading /> : players.length === 0 ? (
            <div className="empty">
              <p>まだ なまえが ありません。<br />むしさがしを はじめるか、せっていで なまえを とうろくしてね。</p>
              <PillButton color="yellow" onClick={() => navigate({ name: 'setup' })}>むしさがしへ</PillButton>
            </div>
          ) : (
            <div className="pt-table" style={{ ['--row-h' as string]: `${ROW_H}px` }}>
              <div className="pt-fixed">
                <div className="pt-head-row">
                  <span className="pt-head">なまえ</span>
                  <span className="pt-head">ごうけい</span>
                </div>
                <div className="pt-period-spacer" />
                {players.map((p) => (
                  <div key={p.id} className="pt-row">
                    <span className="pt-name" title={p.displayName}><span style={fit(p.displayName)}>{p.displayName}</span></span>
                    <span className="pt-total"><b>{formatPoints(stats.totals[p.id] ?? 0)}</b><small>ポイント</small></span>
                  </div>
                ))}
              </div>
              <div className="pt-graph">
                <div className="pt-head-row"><span className="pt-head">グラフ</span></div>
                <div className="pt-graph-body">
                  <div className="y-col">
                    <div className="y-head" />
                    {players.map((p) => <div key={p.id} className="pt-row y-row"><YAxis max={max} /></div>)}
                  </div>
                  <div className="pt-scroll" ref={scroller} tabIndex={0} aria-label="ひごとの ポイントの グラフ（よこに うごかせます）">
                    <DayHeader days={days} />
                    {players.map((p) => (
                      <div key={p.id} className="pt-row graph-row"><Spark values={series[p.id] ?? []} max={max} /></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {loaded && players.length > 0 && days.length > 3 && <p className="scroll-hint">← よこに うごかすと まえの ポイントが みられるよ</p>}
        </div>
      </section>
    </Screen>
  );
}
