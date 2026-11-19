/**
 * Analytical Dashboard View Aggregation Engine
 * Maps directly to SQL views in 02_views.sql:
 * - v_daily, v_state_period, v_coordinator_period, v_tm_period, v_type_period
 * - v_exceptions, v_data_status
 */

import {
  StateSummary,
  StationRecord,
  TMSummary,
  TypeSummary,
} from '../types.js';
import productConfig from '../../../product-config.json';

export const STATE_MAP: Record<string, string> = {
  ...productConfig.analytics.stateMap,
};

export function normalizeStateCode(raw: string): string {
  const s = (raw || '').trim().toUpperCase();
  return STATE_MAP[s] || s || 'OTHER';
}

export interface VDaily {
  sale_date: string;
  stations: number;
  sale_qty: number;
  net_total_collection: number;
  collection: number;
  paytm: number;
  free_sale_litres: number;
  free_sale_rupees: number;
  net_cash_collection: number;
  nominal_rsp_avg: number;
  effective_rsp_avg: number;
}

export interface VCoordinatorPeriod {
  coordinator: string;
  stations: number;
  sale_qty: number;
  net_total_collection: number;
  collection: number;
  paytm: number;
  free_sale_litres: number;
  effective_rsp: number;
  avg_per_station: number;
}

export interface VException {
  erp_code: string;
  alds_name: string;
  state: string;
  tm: string;
  coordinator: string;
  sale_qty: number;
  closing_dip: number;
  remark: string;
  exception_type: 'no_sale' | 'no_stock' | 'sale_not_received' | 'low_sale' | 'stockout_risk';
  severity: 'Critical' | 'Warning' | 'Info';
}

export interface VDataStatus {
  sale_date: string;
  rows_loaded: number;
  distinct_stations: number;
  sum_sale_qty: number;
  sum_collection: number;
  zero_sale_count: number;
  empty_tm_count: number;
  health_status: 'Healthy' | 'Missing TM' | 'Discrepancy';
}

// 1. v_daily aggregation
export function getDailyView(stations: StationRecord[]): VDaily {
  const totalSale = stations.reduce((a, b) => a + b.sale_qty, 0);
  const totalColl = stations.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
  const pricedStations = stations.filter((s) => s.sale_qty > 0 && (s.new_rate > 0 || s.erp_rate > 0));
  const pricedSale = pricedStations.reduce((a, b) => a + b.sale_qty, 0);
  const nominalRev = pricedStations.reduce((a, b) => a + (b.new_rate || b.erp_rate) * b.sale_qty, 0);

  return {
    sale_date: stations[0]?.sale_date || new Date().toISOString().split('T')[0],
    stations: stations.length,
    sale_qty: totalSale,
    net_total_collection: totalColl,
    collection: stations.reduce((a, b) => a + b.collection, 0),
    paytm: stations.reduce((a, b) => a + (b.paytm || 0), 0),
    free_sale_litres: stations.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0),
    free_sale_rupees: stations.reduce((a, b) => a + (b.free_sale_rupees || 0), 0),
    net_cash_collection: stations.reduce((a, b) => a + (b.net_cash_collection || 0), 0),
    nominal_rsp_avg: pricedSale > 0 ? Number((nominalRev / pricedSale).toFixed(2)) : 0,
    effective_rsp_avg: totalSale > 0 ? Number((totalColl / totalSale).toFixed(2)) : 0,
  };
}

// 2. v_state_period aggregation
export function getStatePeriodView(stations: StationRecord[]): StateSummary[] {
  const map: Record<string, StationRecord[]> = {};
  for (const s of stations) {
    const st = normalizeStateCode(s.state);
    if (!map[st]) map[st] = [];
    map[st].push(s);
  }

  return Object.keys(map)
    .map((st) => {
      const list = map[st];
      const sSale = list.reduce((a, b) => a + b.sale_qty, 0);
      const sColl = list.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
      const pricedList = list.filter((s) => s.sale_qty > 0 && (s.new_rate > 0 || s.erp_rate > 0));
      const pricedSale = pricedList.reduce((a, b) => a + b.sale_qty, 0);
      const sNominalRev = pricedList.reduce((a, b) => a + (b.new_rate || b.erp_rate) * b.sale_qty, 0);
      const rawNominalRsp = pricedSale > 0 ? sNominalRev / pricedSale : 0;
      const rawEffRsp = sSale > 0 ? sColl / sSale : 0;
      const sNominalRsp = Number(rawNominalRsp.toFixed(2));
      const sEffRsp = Number(rawEffRsp.toFixed(2));
      const rawGap = Math.max(0, rawNominalRsp - rawEffRsp);
      const sGap = Number((sNominalRsp - sEffRsp).toFixed(2));

      return {
        state: st,
        stations: list.length,
        total_sale_qty: sSale,
        total_collection: sColl,
        avg_sale_per_station: list.length > 0 ? Number((sSale / list.length).toFixed(2)) : 0,
        effective_rsp: sEffRsp,
        nominal_rsp: sNominalRsp,
        collection_gap_per_l: sGap,
        zero_sale_count: list.filter((s) => s.sale_qty === 0).length,
        free_sale_litres: Math.round(list.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0)),
        revenue_at_risk: rawGap > 0 ? Math.round(rawGap * sSale) : 0,
      };
    })
    .sort((a, b) => b.total_sale_qty - a.total_sale_qty);
}

// 3. v_coordinator_period aggregation
export function getCoordinatorPeriodView(stations: StationRecord[]): VCoordinatorPeriod[] {
  const map: Record<string, StationRecord[]> = {};
  for (const s of stations) {
    const coord = s.coordinator?.trim() || 'Unassigned';
    if (!map[coord]) map[coord] = [];
    map[coord].push(s);
  }

  return Object.keys(map)
    .map((coord) => {
      const list = map[coord];
      const cSale = list.reduce((a, b) => a + b.sale_qty, 0);
      const cColl = list.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);

      return {
        coordinator: coord,
        stations: list.length,
        sale_qty: Math.round(cSale),
        net_total_collection: Math.round(cColl),
        collection: Math.round(list.reduce((a, b) => a + b.collection, 0)),
        paytm: Math.round(list.reduce((a, b) => a + (b.paytm || 0), 0)),
        free_sale_litres: Math.round(list.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0)),
        effective_rsp: cSale > 0 ? Number((cColl / cSale).toFixed(2)) : 0,
        avg_per_station: list.length > 0 ? Math.round(cSale / list.length) : 0,
      };
    })
    .sort((a, b) => b.sale_qty - a.sale_qty);
}

// 4. v_tm_period aggregation
export function getTMPeriodView(
  stations: StationRecord[],
  tmBenchmarks?: Record<string, number>,
  tmTotalTargets?: Record<string, number>,
): TMSummary[] {
  const map: Record<string, StationRecord[]> = {};
  for (const s of stations) {
    const tm = s.tm?.trim() || 'No TM';
    if (!map[tm]) map[tm] = [];
    map[tm].push(s);
  }

  const activeStations = stations.filter((s) => s.sale_qty > 0);
  const dynamicNetworkMean = activeStations.length > 0
    ? activeStations.reduce((sum, s) => sum + s.sale_qty, 0) / activeStations.length
    : productConfig.analytics.defaultStationBenchmarkLitres;

  return Object.keys(map)
    .map((tm) => {
      const list = map[tm];
      const tSale = list.reduce((a, b) => a + b.sale_qty, 0);
      const tColl = list.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
      const benchmarkPerStation = tmBenchmarks?.[tm] || dynamicNetworkMean || productConfig.analytics.defaultStationBenchmarkLitres;
      const stationTargetsSum = list.reduce(
        (sum, s) => sum + (s.daily_target !== undefined && s.daily_target > 0 ? s.daily_target : 0),
        0,
      );
      const hasStationTargets = list.some((s) => s.daily_target !== undefined && s.daily_target > 0);
      const dailyTarget = hasStationTargets
        ? Math.round(stationTargetsSum)
        : tmTotalTargets?.[tm] !== undefined && tmTotalTargets[tm] > 0
          ? Math.round(tmTotalTargets[tm])
          : Math.round(list.length * benchmarkPerStation);
      const targetVarianceQty = Math.round(tSale - dailyTarget);
      const achievementPct = dailyTarget > 0
        ? Number(((tSale / dailyTarget) * 100).toFixed(1))
        : 0;
      const stationsMetTarget = list.filter((s) => {
        const stTarget = s.daily_target !== undefined && s.daily_target > 0 ? s.daily_target : benchmarkPerStation;
        return stTarget > 0 && s.sale_qty >= stTarget;
      }).length;

      // Aggregate 3-month historical trajectory across this TM's stations
      const monthMap = new Map<string, { monthLabel: string; totalAch: number; avgDailyAch: number }>();
      for (const s of list) {
        if (!s.historical_months) continue;
        for (const hm of s.historical_months) {
          const existing = monthMap.get(hm.monthLabel) || {
            monthLabel: hm.monthLabel,
            totalAch: 0,
            avgDailyAch: 0,
          };
          existing.totalAch = Number((existing.totalAch + hm.totalAch).toFixed(2));
          existing.avgDailyAch = Number((existing.avgDailyAch + hm.avgDailyAch).toFixed(2));
          monthMap.set(hm.monthLabel, existing);
        }
      }
      const historicalMonths = [...monthMap.values()];
      const firstM = historicalMonths[0];
      const lastM = historicalMonths[historicalMonths.length - 1];
      const startingMonthAvgDaily = firstM?.avgDailyAch || 0;
      const latestMonthAvgDaily = lastM?.avgDailyAch || 0;
      const posM = historicalMonths.filter((m) => m.avgDailyAch > 0);
      const threeMonthAvgDaily = posM.length > 0
        ? Number((posM.reduce((sum, m) => sum + m.avgDailyAch, 0) / posM.length).toFixed(2))
        : 0;
      const threeMonthChangeLitres = Number((latestMonthAvgDaily - startingMonthAvgDaily).toFixed(2));
      const threeMonthChangePct = startingMonthAvgDaily > 0
        ? Number((((latestMonthAvgDaily - startingMonthAvgDaily) / startingMonthAvgDaily) * 100).toFixed(1))
        : 0;
      const targetVsStartingMonthPct = startingMonthAvgDaily > 0
        ? Number((((dailyTarget - startingMonthAvgDaily) / startingMonthAvgDaily) * 100).toFixed(1))
        : 0;
      const isConsecutive3mDecline =
        historicalMonths.length >= 3 &&
        historicalMonths[0].avgDailyAch > 0 &&
        historicalMonths[1].avgDailyAch < historicalMonths[0].avgDailyAch &&
        historicalMonths[2].avgDailyAch < historicalMonths[1].avgDailyAch;

      const tPaytm = list.reduce((a, b) => a + (b.paytm || 0), 0);
      const tCashRaw = list.reduce((a, b) => a + (b.net_cash_collection || 0), 0);
      const tCash = tCashRaw > 0 ? tCashRaw : Math.max(0, tColl - tPaytm);
      const paymentDenom = tPaytm + tCash > 0 ? Math.max(tColl, tPaytm + tCash) : tColl;
      const digitalPct = paymentDenom > 0 ? Number(((tPaytm / paymentDenom) * 100).toFixed(1)) : 0;
      const cashPct = paymentDenom > 0 ? Number(((tCash / paymentDenom) * 100).toFixed(1)) : 0;

      // Aggregate MTD & EOM pacing metrics
      const monthlyTarget = Math.round(
        list.reduce((sum, s) => sum + (s.monthly_target ?? (s.daily_target ?? benchmarkPerStation) * 30), 0),
      );
      const mtdSaleQty = Math.round(
        list.reduce((sum, s) => sum + (s.mtd_sale_qty ?? s.sale_qty), 0),
      );
      const mtdProRataTarget = Math.round(
        list.reduce((sum, s) => sum + (s.mtd_pro_rata_target ?? (s.daily_target ?? benchmarkPerStation)), 0),
      );
      const mtdAchievementPct = mtdProRataTarget > 0
        ? Number(((mtdSaleQty / mtdProRataTarget) * 100).toFixed(1))
        : 0;
      const monthlyTargetAchievedPct = monthlyTarget > 0
        ? Number(((mtdSaleQty / monthlyTarget) * 100).toFixed(1))
        : 0;
      const requiredAskingRate = Math.round(
        list.reduce((sum, s) => sum + (s.required_asking_rate_l_per_day ?? 0), 0),
      );
      const projectedEomSaleQty = Math.round(
        list.reduce((sum, s) => sum + (s.projected_eom_sale_qty ?? s.mtd_sale_qty ?? s.sale_qty), 0),
      );
      const projectedEomAchievementPct = monthlyTarget > 0
        ? Number(((projectedEomSaleQty / monthlyTarget) * 100).toFixed(1))
        : 0;

      return {
        tm,
        coordinator: list[0]?.coordinator || 'Unassigned',
        stations: list.length,
        total_sale_qty: Math.round(tSale),
        total_collection: Math.round(tColl),
        avg_daily_sale: list.length > 0 ? Math.round(tSale / list.length) : 0,
        zero_sale_count: list.filter((s) => s.sale_qty === 0).length,
        efficiency_pct: achievementPct,
        daily_target: dailyTarget,
        monthly_target: monthlyTarget,
        target_variance_qty: targetVarianceQty,
        stations_met_target: stationsMetTarget,
        historical_months: historicalMonths,
        starting_month_label: firstM?.monthLabel || 'Month 1',
        starting_month_avg_daily: startingMonthAvgDaily,
        latest_month_label: lastM?.monthLabel || 'Latest Month',
        latest_month_avg_daily: latestMonthAvgDaily,
        three_month_avg_daily: threeMonthAvgDaily,
        three_month_change_litres: threeMonthChangeLitres,
        three_month_change_pct: threeMonthChangePct,
        target_vs_starting_month_pct: targetVsStartingMonthPct,
        is_consecutive_3m_decline: isConsecutive3mDecline,
        total_paytm: Math.round(tPaytm),
        total_cash: Math.round(tCash),
        digital_pct: digitalPct,
        cash_pct: cashPct,
        mtd_sale_qty: mtdSaleQty,
        mtd_pro_rata_target: mtdProRataTarget,
        mtd_achievement_pct: mtdAchievementPct,
        monthly_target_achieved_pct: monthlyTargetAchievedPct,
        required_asking_rate_l_per_day: requiredAskingRate,
        projected_eom_sale_qty: projectedEomSaleQty,
        projected_eom_achievement_pct: projectedEomAchievementPct,
      };
    })
    .sort((a, b) => b.total_sale_qty - a.total_sale_qty);
}

// 5. v_type_period aggregation
export function getTypePeriodView(stations: StationRecord[]): TypeSummary[] {
  const map: Record<string, StationRecord[]> = {};
  for (const s of stations) {
    const tp = s.type?.trim().toUpperCase() || 'LOCO';
    if (!map[tp]) map[tp] = [];
    map[tp].push(s);
  }

  const totalSale = stations.reduce((a, b) => a + b.sale_qty, 0);

  return Object.keys(map)
    .map((tp) => {
      const list = map[tp];
      const tpSale = list.reduce((a, b) => a + b.sale_qty, 0);
      const tpColl = list.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);

      return {
        type: tp,
        stations: list.length,
        total_sale_qty: Math.round(tpSale),
        total_collection: Math.round(tpColl),
        avg_sale_per_station: list.length > 0 ? Math.round(tpSale / list.length) : 0,
        share_pct: totalSale > 0 ? Number(((tpSale / totalSale) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.total_sale_qty - a.total_sale_qty);
}

// 6. v_exceptions view
export function getExceptionsView(stations: StationRecord[]): VException[] {
  const exceptions: VException[] = [];

  for (const s of stations) {
    const remarkLower = (s.remark || s.remarks || '').toLowerCase();
    const closingDip = s.closing_dip_in_ltr ?? s.closing_dip ?? 0;

    if (s.sale_qty === 0) {
      exceptions.push({
        erp_code: s.erp_code,
        alds_name: s.alds_name,
        state: s.state,
        tm: s.tm,
        coordinator: s.coordinator,
        sale_qty: 0,
        closing_dip: closingDip,
        remark: s.remark || s.remarks || 'Zero volume reported',
        exception_type: 'no_sale',
        severity: 'Critical',
      });
    } else if (remarkLower.includes('no stock')) {
      exceptions.push({
        erp_code: s.erp_code,
        alds_name: s.alds_name,
        state: s.state,
        tm: s.tm,
        coordinator: s.coordinator,
        sale_qty: s.sale_qty,
        closing_dip: closingDip,
        remark: s.remark || s.remarks || '',
        exception_type: 'no_stock',
        severity: 'Critical',
      });
    } else if (remarkLower.includes('sale not received')) {
      exceptions.push({
        erp_code: s.erp_code,
        alds_name: s.alds_name,
        state: s.state,
        tm: s.tm,
        coordinator: s.coordinator,
        sale_qty: s.sale_qty,
        closing_dip: closingDip,
        remark: s.remark || s.remarks || '',
        exception_type: 'sale_not_received',
        severity: 'Warning',
      });
    } else if (s.days_left < productConfig.analytics.stockoutWarningDays) {
      exceptions.push({
        erp_code: s.erp_code,
        alds_name: s.alds_name,
        state: s.state,
        tm: s.tm,
        coordinator: s.coordinator,
        sale_qty: s.sale_qty,
        closing_dip: closingDip,
        remark: `${s.days_left} days fuel remaining`,
        exception_type: 'stockout_risk',
        severity: s.days_left < productConfig.analytics.stockoutCriticalDays ? 'Critical' : 'Warning',
      });
    } else if (s.sale_qty < 100) {
      exceptions.push({
        erp_code: s.erp_code,
        alds_name: s.alds_name,
        state: s.state,
        tm: s.tm,
        coordinator: s.coordinator,
        sale_qty: s.sale_qty,
        closing_dip: closingDip,
        remark: s.remark || s.remarks || 'Abnormally low throughput (<100 L)',
        exception_type: 'low_sale',
        severity: 'Warning',
      });
    }
  }

  return exceptions;
}

// 7. v_data_status view
export function getDataStatusView(stations: StationRecord[]): VDataStatus {
  const zeroCount = stations.filter((s) => s.sale_qty === 0).length;
  const emptyTmCount = stations.filter((s) => !s.tm || s.tm === 'No TM').length;
  const distinctErp = new Set(stations.map((s) => s.erp_code)).size;

  let healthStatus: VDataStatus['health_status'] = 'Healthy';
  if (emptyTmCount > 100) healthStatus = 'Missing TM';
  else if (distinctErp < stations.length) healthStatus = 'Discrepancy';

  return {
    sale_date: stations[0]?.sale_date || new Date().toISOString().split('T')[0],
    rows_loaded: stations.length,
    distinct_stations: distinctErp,
    sum_sale_qty: Math.round(stations.reduce((a, b) => a + b.sale_qty, 0)),
    sum_collection: Math.round(stations.reduce((a, b) => a + (b.net_total_collection || b.collection), 0)),
    zero_sale_count: zeroCount,
    empty_tm_count: emptyTmCount,
    health_status: healthStatus,
  };
}
