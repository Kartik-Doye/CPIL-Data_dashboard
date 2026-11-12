/**
 * Analytical Dashboard View Aggregation Engine
 * Converted from 02_views.sql, 03_state_map.sql, and 04_settings.sql
 * 
 * Maps directly to SQL views in 02_views.sql:
 * - v_daily, v_state_period, v_coordinator_period, v_tm_period, v_type_period
 * - v_exceptions, v_data_status, v_station_period
 * 
 * Works seamlessly across both live PostgreSQL database and offline Excel ingestion.
 */

import {
  CoordinatorAggregate,
  DayAggregate,
  OperatingModelAggregate,
  StateAggregate,
  StateSummary,
  StationRecord,
  TMAggregate,
  TMSummary,
  TypeSummary,
} from '../types.js';
import productConfig from '../../../product-config.json';

export const STATE_MAP: Record<string, string> = {
  MS: 'MH',
  AP: 'TG',
  KAR: 'KA',
  RAJ: 'RJ',
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
  const nominalRev = stations.reduce((a, b) => a + (b.new_rate || b.erp_rate || 0) * b.sale_qty, 0);

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
    nominal_rsp_avg: totalSale > 0 ? Number((nominalRev / totalSale).toFixed(2)) : 0,
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
      const sNominalRev = list.reduce((a, b) => a + (b.new_rate || b.erp_rate || 0) * b.sale_qty, 0);
      const sNominalRsp = sSale > 0 ? Number((sNominalRev / sSale).toFixed(2)) : 0;
      const sEffRsp = sSale > 0 ? Number((sColl / sSale).toFixed(2)) : 0;
      const sGap = Number((sNominalRsp - sEffRsp).toFixed(2));

      return {
        state: st,
        stations: list.length,
        total_sale_qty: sSale,
        total_collection: sColl,
        avg_sale_per_station: list.length > 0 ? sSale / list.length : 0,
        effective_rsp: sEffRsp,
        nominal_rsp: sNominalRsp,
        collection_gap_per_l: sGap,
        zero_sale_count: list.filter((s) => s.sale_qty === 0).length,
        free_sale_litres: Math.round(list.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0)),
        revenue_at_risk: sGap > 0 ? Math.round(sGap * sSale) : 0,
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
export function getTMPeriodView(stations: StationRecord[]): TMSummary[] {
  const map: Record<string, StationRecord[]> = {};
  for (const s of stations) {
    const tm = s.tm?.trim() || 'No TM';
    if (!map[tm]) map[tm] = [];
    map[tm].push(s);
  }

  return Object.keys(map)
    .map((tm) => {
      const list = map[tm];
      const tSale = list.reduce((a, b) => a + b.sale_qty, 0);
      const tColl = list.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);

      return {
        tm,
        coordinator: list[0]?.coordinator || 'Unassigned',
        stations: list.length,
        total_sale_qty: Math.round(tSale),
        total_collection: Math.round(tColl),
        avg_daily_sale: list.length > 0 ? Math.round(tSale / list.length) : 0,
        zero_sale_count: list.filter((s) => s.sale_qty === 0).length,
        efficiency_pct: Number((Math.min(100, (tSale / (list.length * 1100)) * 100)).toFixed(1)),
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
    } else if (s.days_left < 3.0) {
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
        severity: s.days_left < 1.5 ? 'Critical' : 'Warning',
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

export function aggregateByState(stations: StationRecord[]): StateAggregate[] {
  const map: Record<string, { count: number; qty: number; amount: number; collection: number; active: number }> = {};
  const totalVolume = stations.reduce((sum, s) => sum + s.sale_qty, 0);

  for (const s of stations) {
    const st = normalizeStateCode(s.state);
    if (!map[st]) {
      map[st] = { count: 0, qty: 0, amount: 0, collection: 0, active: 0 };
    }
    map[st].count++;
    map[st].qty += s.sale_qty;
    map[st].amount += s.sale_amount || s.sale_qty * (s.new_rate || productConfig.analytics.fallbackRetailPricePerLitre);
    map[st].collection += s.collection;
    if (s.sale_qty > 0) map[st].active++;
  }

  const result: StateAggregate[] = [];
  for (const st in map) {
    const data = map[st];
    result.push({
      state: st,
      station_count: data.count,
      total_qty: Math.round(data.qty),
      total_amount: Math.round(data.amount),
      total_collection: Math.round(data.collection),
      avg_daily_qty: data.count > 0 ? Math.round(data.qty / data.count) : 0,
      volume_share_pct: totalVolume > 0 ? Math.round((data.qty / totalVolume) * 1000) / 10 : 0,
      active_ratio: data.count > 0 ? Math.round((data.active / data.count) * 100) : 0,
    });
  }

  return result.sort((a, b) => b.total_qty - a.total_qty);
}

export function aggregateByTM(stations: StationRecord[]): TMAggregate[] {
  const map: Record<string, { tm: string; state: string; count: number; qty: number }> = {};

  for (const s of stations) {
    const tm = s.tm || 'No TM';
    if (!map[tm]) {
      map[tm] = { tm, state: s.state, count: 0, qty: 0 };
    }
    map[tm].count++;
    map[tm].qty += s.sale_qty;
  }

  const result: TMAggregate[] = [];
  for (const tm in map) {
    const data = map[tm];
    const target = data.count * 1200;
    const pct = target > 0 ? Math.round((data.qty / target) * 100) : 0;
    let pacing: 'Ahead' | 'On Track' | 'At Risk' | 'Behind' = 'On Track';
    if (pct >= 105) pacing = 'Ahead';
    else if (pct >= 95) pacing = 'On Track';
    else if (pct >= 80) pacing = 'At Risk';
    else pacing = 'Behind';

    result.push({
      tm,
      state: data.state,
      station_count: data.count,
      total_qty: Math.round(data.qty),
      target_qty: target,
      achievement_pct: pct,
      pacing_status: pacing,
    });
  }

  return result.sort((a, b) => b.total_qty - a.total_qty);
}

export function aggregateByCoordinator(stations: StationRecord[]): CoordinatorAggregate[] {
  const map: Record<string, { count: number; qty: number; collection: number }> = {};

  for (const s of stations) {
    const c = s.coordinator || 'Unknown';
    if (!map[c]) {
      map[c] = { count: 0, qty: 0, collection: 0 };
    }
    map[c].count++;
    map[c].qty += s.sale_qty;
    map[c].collection += s.collection;
  }

  const result: CoordinatorAggregate[] = [];
  for (const c in map) {
    const data = map[c];
    const totalAmount = data.qty * productConfig.analytics.fallbackRetailPricePerLitre;
    const collPct = totalAmount > 0 ? Math.round((data.collection / totalAmount) * 100) : 100;
    result.push({
      coordinator: c,
      station_count: data.count,
      total_qty: Math.round(data.qty),
      total_collection: Math.round(data.collection),
      avg_collection_pct: collPct,
    });
  }

  return result.sort((a, b) => b.total_qty - a.total_qty);
}

export function aggregateByOperatingModel(stations: StationRecord[]): OperatingModelAggregate[] {
  const map: Record<string, { count: number; qty: number; amount: number; freeSale: number }> = {};

  for (const s of stations) {
    const t = s.type || 'Unknown';
    if (!map[t]) {
      map[t] = { count: 0, qty: 0, amount: 0, freeSale: 0 };
    }
    map[t].count++;
    map[t].qty += s.sale_qty;
    map[t].amount += s.sale_amount || s.sale_qty * (s.new_rate || productConfig.analytics.fallbackRetailPricePerLitre);
    map[t].freeSale += s.free_sale || s.free_sale_litres || 0;
  }

  const result: OperatingModelAggregate[] = [];
  for (const t in map) {
    const data = map[t];
    const avgRsp = data.qty > 0 ? data.amount / data.qty : productConfig.analytics.fallbackRetailPricePerLitre;
    const freePct = data.qty > 0 ? (data.freeSale / data.qty) * 100 : 0;
    const margins = productConfig.analytics.operatingModelMarginsPerLitre;
    const margin = t === 'COCO' ? margins.COCO : t === 'LOCO' ? margins.LOCO : t === 'DODO' ? margins.DODO : margins.default;

    result.push({
      type: t,
      station_count: data.count,
      total_qty: Math.round(data.qty),
      total_amount: Math.round(data.amount),
      avg_rsp: Math.round(avgRsp * 100) / 100,
      free_sale_pct: Math.round(freePct * 10) / 10,
      margin_per_litre: margin,
    });
  }

  return result.sort((a, b) => b.total_qty - a.total_qty);
}

export function aggregateDailyTrend(stations: StationRecord[]): DayAggregate[] {
  const map: Record<string, { qty: number; amount: number; collection: number; active: number; free: number; stockouts: number; count: number }> = {};

  for (const s of stations) {
    if (!s.sale_date) continue;
    const d = s.sale_date;
    if (!map[d]) {
      map[d] = { qty: 0, amount: 0, collection: 0, active: 0, free: 0, stockouts: 0, count: 0 };
    }
    map[d].count++;
    map[d].qty += s.sale_qty;
    map[d].amount += s.sale_amount || s.sale_qty * (s.new_rate || productConfig.analytics.fallbackRetailPricePerLitre);
    map[d].collection += s.collection;
    map[d].free += s.free_sale || s.free_sale_litres || 0;
    if (s.sale_qty > 0) map[d].active++;
    if (
      (s.closing_dip_in_ltr ?? s.closing_dip ?? 0) < productConfig.analytics.stockoutDipThresholdLitres ||
      (s.remark && /stock/i.test(s.remark))
    ) map[d].stockouts++;
  }

  const result: DayAggregate[] = [];
  for (const d in map) {
    const data = map[d];
    result.push({
      sale_date: d,
      total_qty: Math.round(data.qty),
      total_amount: Math.round(data.amount),
      total_collection: Math.round(data.collection),
      active_stations: data.active,
      avg_rsp: data.qty > 0
        ? Math.round((data.amount / data.qty) * 100) / 100
        : productConfig.analytics.fallbackRetailPricePerLitre,
      free_sale_total: Math.round(data.free),
      stockout_stations: data.stockouts,
    });
  }

  return result.sort((a, b) => a.sale_date.localeCompare(b.sale_date));
}
