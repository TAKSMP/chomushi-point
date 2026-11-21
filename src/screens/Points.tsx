import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BackButton, Loading, PillButton, Screen, TitleBoard, TopBar, fit } from '../components/ui';
import { buildSeries, formatPoints, niceMax, periodLabel, type Period } from '../lib/scoring';
import { navigate } from '../router';
import { useApp } from '../store';

const COL = 66;      // px per half-month
const ROW_H = 76;    // px per player row (keep in sync with --row-h in CSS)
const PAD_X = 36;

function shortNum(n: number) {
  if (n >= 100000000) return `${Math.round(n / 100000000)}おく`;
  if (n >= 10000) return `${Math.round(n / 1000) / 10}まん`;
  return String(n);
}

function Spark({ values }: { values: number[] }) {
  const w = PAD_X * 2 + COL * (values.length - 1);
  const top = 18, bottom = ROW_H - 12;
  const max = niceMax(Math.max(...values));
  const x = (i: number) => PAD_X + i * COL;
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="spark" width={w} height={ROW_H} viewBox={`0 0 ${w} ${ROW_H}`} aria-hidden="true">
      {values.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={8} y2={bottom} className="grid-v" />)}
      <line x1={4} x2={w - 4} y1={bottom} y2={bottom} className="grid-base" />
      {values.length > 1 && <path d={d} className="line" />}
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={v > 0 ? 5 : 3.5} className={v > 0 ? 'dot' : 'dot zero'} />
          {v > 0 && <text x={x(i)} y={y(v) - 9} className="val">{shortNum(v)}</text>}
        </g>
      ))}
    </svg>
  );
}

function PeriodHeader({ periods }: { periods: Period[] }) {
  const w = PAD_X * 2 + COL * (periods.length - 1);
  return (
    <div className="period-head" style={{ width: w }}>
      {periods.map((p, i) => (
        <span key={p.key} className="period" style={{ left: PAD_X + i * COL }}>
          {(i === 0 || p.month === 1 && p.half === 1) && <em>{p.year}</em>}
          {periodLabel(p)}
        </span>
      ))}
    </div>
  );
}

export function Points() {
  const { players, stats, loaded, refresh, syncError } = useApp();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { void refresh(); }, [refresh]);

  const { periods, series } = useMemo(
    () => buildSeries(stats.results, players.map((p) => p.id)),
    [stats.results, players],
  );

  // open on the latest half-month
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [periods.length, players.length]);

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
                <div className="pt-scroll" ref={scroller} tabIndex={0} aria-label="はんつきごとの ポイントの グラフ（よこに うごかせます）">
                  <PeriodHeader periods={periods} />
                  {players.map((p) => (
                    <div key={p.id} className="pt-row graph-row"><Spark values={series[p.id] ?? []} /></div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {loaded && players.length > 0 && periods.length > 3 && <p className="scroll-hint">← よこに うごかすと まえの ポイントが みられるよ</p>}
        </div>
      </section>
    </Screen>
  );
}
