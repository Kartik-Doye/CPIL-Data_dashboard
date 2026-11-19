import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Fuel,
  Truck,
  TrendingUp,
  DollarSign,
  Calendar,
  Download,
  User,
  MapPin,
  ShieldAlert,
  Loader2,
  Target,
  Wallet,
} from 'lucide-react';
import { StationRecord, StationMonthlySales } from '../types';
import { fmtQty, fmtCurrency, escapeCsvCell } from '../engine/formatting';
import { recommendTanker } from '../engine/tanker';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface StationHistoryRow {
  date: string;
  sale_qty: number;
  collection: number;
  nominal_rsp: number;
  effective_rsp: number;
  closing_dip: number;
  paytm: number;
  free_sale_litres: number;
  remark: string;
}

interface Station360DrawerProps {
  station: StationRecord | null;
  onClose: () => void;
  monthlySales?: StationMonthlySales[];
}

export const Station360Drawer: React.FC<Station360DrawerProps> = ({
  station,
  onClose,
  monthlySales = [],
}) => {
  const [history, setHistory] = useState<StationHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!station) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/station/${encodeURIComponent(station.erp_code)}/history`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.history && Array.isArray(payload.history) && payload.history.length > 0) {
          setHistory(payload.history);
        } else if (station.recent_7d_sales && station.recent_7d_sales.length > 0) {
          setHistory(
            station.recent_7d_sales.map((pt) => ({
              date: pt.date,
              sale_qty: pt.sale_qty,
              collection:
                pt.date === station.sale_date
                  ? station.net_total_collection || station.collection
                  : Math.round(pt.sale_qty * (station.effective_rsp || station.new_rate || 0)),
              nominal_rsp: station.new_rate || station.erp_rate || 0,
              effective_rsp: station.effective_rsp || 0,
              closing_dip: pt.date === station.sale_date ? station.closing_dip_in_ltr : 0,
              paytm: pt.date === station.sale_date ? station.paytm : 0,
              free_sale_litres: pt.date === station.sale_date ? station.free_sale_litres : 0,
              remark: pt.date === station.sale_date ? station.remark : '',
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled && station.recent_7d_sales) {
          setHistory(
            station.recent_7d_sales.map((pt) => ({
              date: pt.date,
              sale_qty: pt.sale_qty,
              collection: 0,
              nominal_rsp: station.new_rate || station.erp_rate || 0,
              effective_rsp: station.effective_rsp || 0,
              closing_dip: pt.date === station.sale_date ? station.closing_dip_in_ltr : 0,
              paytm: 0,
              free_sale_litres: 0,
              remark: '',
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [station]);

  const stationMonths = useMemo(() => {
    if (!station) return [];
    return monthlySales
      .filter((m) => m.erp_code === station.erp_code)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [station, monthlySales]);

  if (!station) return null;

  const dailyBurn = station.rolling_7d_burn || station.sale_qty || 0;
  const tankerRec = recommendTanker(dailyBurn, station.closing_dip_in_ltr, undefined, station.tank_cap);
  const nominalRsp = station.new_rate || station.erp_rate || 0;
  const rspGap = Math.max(0, Number((nominalRsp - station.effective_rsp).toFixed(2)));

  const totalHistVolume = history.reduce((sum, h) => sum + h.sale_qty, 0);
  const totalHistCollection = history.reduce((sum, h) => sum + h.collection, 0);
  const activeHistDays = history.filter((h) => h.sale_qty > 0).length;
  const avgHistDaily = activeHistDays > 0 ? Math.round(totalHistVolume / activeHistDays) : 0;
  const peakHistDay = history.reduce(
    (best, cur) => (cur.sale_qty > best.sale_qty ? cur : best),
    history[0] || { date: station.sale_date, sale_qty: station.sale_qty },
  );

  // Empirical Weekday (Mon-Fri) vs Weekend (Sat-Sun) Burn Rate & 7-Day Forward Tank Depletion Schedule
  const activeHistoryRows = history.filter((h) => h.sale_qty > 0);
  const weekdayRows = activeHistoryRows.filter((h) => {
    const dow = new Date(`${h.date}T00:00:00Z`).getUTCDay();
    return dow >= 1 && dow <= 5;
  });
  const weekendRows = activeHistoryRows.filter((h) => {
    const dow = new Date(`${h.date}T00:00:00Z`).getUTCDay();
    return dow === 0 || dow === 6;
  });

  const baseBurn = dailyBurn || avgHistDaily || station.daily_target || 1000;
  const weekdayBurn =
    weekdayRows.length >= 2
      ? Math.round(weekdayRows.reduce((s, r) => s + r.sale_qty, 0) / weekdayRows.length)
      : Math.round(baseBurn * 1.04);
  const weekendBurn =
    weekendRows.length >= 2
      ? Math.round(weekendRows.reduce((s, r) => s + r.sale_qty, 0) / weekendRows.length)
      : Math.round(weekdayBurn * 0.82);
  const weekendDropPct =
    weekdayBurn > 0 ? Number((((weekendBurn - weekdayBurn) / weekdayBurn) * 100).toFixed(1)) : 0;

  // Simulate forward day-by-day tank depletion up to 14 days to find exact stockout / safety date
  const safetyBufferLitres = 1500;
  let simStock = Math.max(0, station.closing_dip_in_ltr);
  let predictedDepletionDate: string | null = null;
  let predictedSafetyBreachDate: string | null = null;
  const forward7dSchedule: Array<{
    date: string;
    dayLabel: string;
    isWeekend: boolean;
    projectedBurn: number;
    openingDip: number;
    endingDip: number;
    status: 'Healthy' | 'Safety Alert' | 'Stockout';
  }> = [];

  const anchorMs = Date.parse(`${station.sale_date}T00:00:00Z`);
  if (Number.isFinite(anchorMs)) {
    for (let step = 1; step <= 14; step += 1) {
      const nextDateObj = new Date(anchorMs + step * 86_400_000);
      const nextDateStr = nextDateObj.toISOString().slice(0, 10);
      const dow = nextDateObj.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const dayBurn = isWeekend ? weekendBurn : weekdayBurn;
      const openingDip = simStock;
      const endingDip = Math.max(0, openingDip - dayBurn);
      simStock = endingDip;

      if (!predictedSafetyBreachDate && endingDip <= safetyBufferLitres) {
        predictedSafetyBreachDate = nextDateStr;
      }
      if (!predictedDepletionDate && endingDip <= 0) {
        predictedDepletionDate = nextDateStr;
      }

      if (step <= 7) {
        forward7dSchedule.push({
          date: nextDateStr,
          dayLabel: WEEKDAY_SHORT[dow],
          isWeekend,
          projectedBurn: dayBurn,
          openingDip: Math.round(openingDip),
          endingDip: Math.round(endingDip),
          status:
            endingDip <= 0
              ? 'Stockout'
              : endingDip <= safetyBufferLitres
                ? 'Safety Alert'
                : 'Healthy',
        });
      }
    }
  }

  // SVG Chart coordinates
  const chartW = 560;
  const chartH = 130;
  const maxSale = Math.max(...history.map((h) => h.sale_qty), 1);
  const minSale = Math.min(...history.map((h) => h.sale_qty), 0);
  const plotMax = maxSale * 1.05;
  const plotMin = minSale > 0 ? minSale * 0.85 : 0;
  const coords = history.map((h, i) => {
    const x = history.length <= 1 ? chartW / 2 : 16 + (i / (history.length - 1)) * (chartW - 32);
    const y = chartH - 16 - ((h.sale_qty - plotMin) / (plotMax - plotMin || 1)) * (chartH - 32);
    return { x, y, row: h };
  });
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const hovered = hoveredIdx !== null ? coords[hoveredIdx] : null;

  const exportStationCSV = () => {
    const headers = [
      'Date',
      'Station Code',
      'Station Name',
      'Sale Qty (L)',
      'Net Collection (Rs)',
      'Nominal RSP (Rs)',
      'Effective RSP (Rs)',
      'Closing Dip (L)',
      'Paytm (Rs)',
      'Free Sale (L)',
      'Remark',
    ];
    const rows = [...history].reverse().map((h) => [
      escapeCsvCell(h.date),
      escapeCsvCell(station.erp_code),
      escapeCsvCell(station.alds_name),
      h.sale_qty,
      h.collection,
      h.nominal_rsp,
      h.effective_rsp,
      h.closing_dip,
      h.paytm,
      h.free_sale_litres,
      escapeCsvCell(h.remark),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Station_360_${station.erp_code}_${station.sale_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
      />

      {/* Side Drawer Panel */}
      <aside className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full z-10 overflow-hidden transition-colors">
        {/* Top Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/50">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-orange-600 text-white">
                {station.erp_code}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {station.type} • {station.tank_cap || '10KL'} Tank
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                {station.status_band}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {station.alds_name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                State: <strong className="text-slate-800 dark:text-slate-200">{station.state}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                TM: <strong className="text-slate-800 dark:text-slate-200">{station.tm}</strong>
              </span>
              {station.ss_name && (
                <span>
                  SS Supervisor: <strong className="text-slate-800 dark:text-slate-200">{station.ss_name}</strong>
                </span>
              )}
              <span>
                Coord: <strong className="text-slate-800 dark:text-slate-200">{station.coordinator}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportStationCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Ledger</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close Station 360 Drawer"
              className="p-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Sale ({station.sale_date})
              </span>
              <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {fmtQty(station.sale_qty)} L
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                7d Burn: {fmtQty(dailyBurn)} L/d
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Net Collection
              </span>
              <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                {fmtCurrency(station.net_total_collection || station.collection)}
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                Paytm: {fmtCurrency(station.paytm)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Realized vs ERP RSP
              </span>
              <div className="text-base font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                ₹{station.effective_rsp.toFixed(2)}/L
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                ERP: ₹{nominalRsp.toFixed(2)} (Gap ₹{rspGap.toFixed(2)})
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                Closing Dip & Cover
              </span>
              <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {fmtQty(station.closing_dip_in_ltr)} L
              </div>
              <span
                className={`text-[10px] font-mono font-bold ${
                  station.days_left < 2
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {station.days_left > 30 ? '>30d' : `${station.days_left}d`} • {tankerRec.tankerLabel}
              </span>
            </div>
          </div>

          {/* Target Pace, 3-Month Trend & Payment Mix Strip */}
          {((station.daily_target && station.daily_target > 0) ||
            (station.net_total_collection || station.collection) > 0) && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-orange-500" />
                    <span>Daily Target vs Actual</span>
                  </span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {fmtQty(station.sale_qty)} / {fmtQty(station.daily_target || 0)} L (
                    <span
                      className={
                        (station.target_achievement_pct || 0) >= 100
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {(station.target_achievement_pct || 0).toFixed(1)}%
                    </span>
                    )
                  </div>
                  {station.historical_months && station.historical_months.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                      3M Avg: {station.historical_months.map((m) => `${m.monthLabel} ${Math.round(m.avgDailyAch)}`).join(' → ')} L/d
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    MTD Cumulative & Asking Rate
                  </span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {fmtQty(station.mtd_sale_qty || 0)} / {fmtQty(station.monthly_target || 0)} L
                  </div>
                  <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 block mt-0.5">
                    Ask: {fmtQty(station.required_asking_rate_l_per_day || 0)} L/d • EOM:{' '}
                    {(station.projected_eom_achievement_pct || 0).toFixed(1)}%
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Digital vs Cash Security</span>
                  </span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    Digital {(station.digital_pct || 0).toFixed(1)}% / Cash {(station.cash_pct || 0).toFixed(1)}%
                  </div>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block mt-0.5">
                    Cash Held: {fmtCurrency(station.net_cash_collection || 0)}
                    {(station.cash_spike_pct || 0) >= 15
                      ? ` • ⚠️ +${(station.cash_spike_pct || 0).toFixed(1)}% Cash Spike`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Weekday-Aware 7-Day Forward Tank Depletion Schedule */}
          {forward7dSchedule.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-orange-500" />
                  <span>Weekday-Aware 7-Day Forward Tank Depletion Predictor</span>
                </span>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Mon–Fri Burn: <strong>{fmtQty(weekdayBurn)} L/d</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                    Sat–Sun Dip Burn: <strong>{fmtQty(weekendBurn)} L/d</strong> ({weekendDropPct}%)
                  </span>
                  {predictedDepletionDate ? (
                    <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold">
                      Est. Depletion: {predictedDepletionDate}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold">
                      &gt;14d Tank Cover
                    </span>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-slate-50/60 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-1.5 px-3">Date</th>
                      <th className="py-1.5 px-3">Day</th>
                      <th className="py-1.5 px-3 text-right">Opening Dip</th>
                      <th className="py-1.5 px-3 text-right">Proj. Burn</th>
                      <th className="py-1.5 px-3 text-right">Ending Dip</th>
                      <th className="py-1.5 px-3 text-center">Tank Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {forward7dSchedule.map((row) => (
                      <tr
                        key={row.date}
                        className={
                          row.isWeekend
                            ? 'bg-amber-50/30 dark:bg-amber-950/10'
                            : ''
                        }
                      >
                        <td className="py-1.5 px-3 font-bold text-slate-900 dark:text-white">{row.date}</td>
                        <td className="py-1.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              row.isWeekend
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {row.dayLabel}
                            {row.isWeekend ? '↓' : ''}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-slate-600 dark:text-slate-400">
                          {fmtQty(row.openingDip)} L
                        </td>
                        <td className="py-1.5 px-3 text-right text-orange-600 dark:text-orange-400">
                          -{fmtQty(row.projectedBurn)} L
                        </td>
                        <td className="py-1.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                          {fmtQty(row.endingDip)} L
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                              row.status === 'Stockout'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                : row.status === 'Safety Alert'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historical Performance Summary Strip */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/20 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                Cumulative DB Volume ({history.length}d)
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {fmtQty(totalHistVolume)} L ({fmtCurrency(totalHistCollection)})
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                Historical Active Mean
              </span>
              <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                {fmtQty(avgHistDaily)} L/d ({activeHistDays}/{history.length} active days)
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                All-Time Peak Day
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {fmtQty(peakHistDay.sale_qty)} L ({peakHistDay.date})
              </span>
            </div>
          </div>

          {/* Historical Trajectory SVG Chart */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                <span>Historical Daily Volume Trajectory ({history.length} Loaded Days)</span>
              </span>
              {loading && (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading DB history...
                </span>
              )}
            </div>

            <div className="h-5 text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center justify-between">
              {hovered ? (
                <>
                  <span>
                    <strong>{hovered.row.date}</strong>
                  </span>
                  <span className="text-orange-600 dark:text-orange-400 font-bold">
                    {fmtQty(hovered.row.sale_qty)} L · {fmtCurrency(hovered.row.collection)} · Dip: {fmtQty(hovered.row.closing_dip)} L
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 font-sans">
                  Hover over any point to inspect daily volume, collection, and closing dip
                </span>
              )}
            </div>

            <div className="h-36 w-full" onMouseLeave={() => setHoveredIdx(null)}>
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                {polylinePoints && (
                  <polyline
                    fill="none"
                    stroke="#F97316"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />
                )}
                {coords.map((c, idx) => (
                  <g key={c.row.date} onMouseEnter={() => setHoveredIdx(idx)}>
                    <circle cx={c.x} cy={c.y} r="8" fill="transparent" className="cursor-pointer" />
                    {hoveredIdx === idx && (
                      <circle cx={c.x} cy={c.y} r="4" fill="#F97316" stroke="#FFFFFF" strokeWidth="1.5" />
                    )}
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Monthly Run-Rate Breakdown */}
          {stationMonths.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 font-bold text-xs text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Monthly Throughput Summary</span>
              </div>
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-slate-50/60 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Month</th>
                    <th className="py-2 px-3 text-center">Reporting Days</th>
                    <th className="py-2 px-3 text-right">Monthly Volume</th>
                    <th className="py-2 px-3 text-right">Daily Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stationMonths.map((m) => (
                    <tr key={m.month}>
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">{m.month.slice(0, 7)}</td>
                      <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400">{m.reporting_days}d</td>
                      <td className="py-2 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {fmtQty(m.sale_qty)} L
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                        {fmtQty(m.reporting_days > 0 ? m.sale_qty / m.reporting_days : 0)} L/d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Complete Daily Ledger */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 font-bold text-xs text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800">
              Daily Historical Ledger (Most Recent First)
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3 text-right">Sale (L)</th>
                    <th className="py-2 px-3 text-right">Collection</th>
                    <th className="py-2 px-3 text-right">Eff RSP</th>
                    <th className="py-2 px-3 text-right">Closing Dip</th>
                    <th className="py-2 px-3">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {[...history].reverse().map((h) => (
                    <tr key={h.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-white">{h.date}</td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          h.sale_qty === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {fmtQty(h.sale_qty)} L
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(h.collection)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                        ₹{h.effective_rsp.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                        {fmtQty(h.closing_dip)} L
                      </td>
                      <td className="py-2 px-3 font-sans text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-36">
                        {h.remark || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
