export interface StationRecord {
  id: string;
  erp_code: string; // Cost Code (e.g., AY046)
  alds_name: string;
  type: string; // LOCO, JODO, DODO, JOCO, COCO
  coordinator: string;
  state: string; // Consolidating MS -> MH, AP -> TG
  raw_state?: string;
  tm: string; // Territory Manager
  tank_cap: string;
  sale_qty: number;
  collection: number;
  new_rate: number; // RSP
  other: number;
  diff: number;
  erp_rate: number;
  ret_test_cal: number;
  free_sale_litres: number;
  free_sale_rupees: number;
  free_sale?: number;
  sale_amount?: number;
  scheme: number;
  paytm: number;
  net_cash_collection: number;
  closing_dip_in_ltr: number;
  closing_dip?: number;
  remark: string;
  remarks?: string;
  net_total_collection: number;
  effective_rsp: number;
  actual_rsp?: number;
  discount?: number;
  collection_check: number;
  scheme_as_per_ho: number;
  free_sale_pct: number;
  sale_date: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  days_left: number;
  trend_slope: number;
  status_band: 'Achieved' | 'On track' | 'At risk' | 'Behind';
}

export interface StateSummary {
  state: string;
  stations: number;
  total_sale_qty: number;
  total_collection: number;
  avg_sale_per_station: number;
  effective_rsp: number;
  nominal_rsp: number;
  collection_gap_per_l: number;
  zero_sale_count: number;
  free_sale_litres: number;
  revenue_at_risk: number;
}

export interface TMSummary {
  tm: string;
  coordinator: string;
  stations: number;
  total_sale_qty: number;
  total_collection: number;
  avg_daily_sale: number;
  zero_sale_count: number;
  efficiency_pct: number;
}

export interface TypeSummary {
  type: string;
  stations: number;
  total_sale_qty: number;
  total_collection: number;
  avg_sale_per_station: number;
  share_pct: number;
}

export interface ForecastDay {
  date: string;
  day_name: string;
  predicted_qty: number;
  lower_bound: number;
  upper_bound: number;
  linear_pred: number;
  holt_winters_pred: number;
}

export interface ForecastPoint {
  date: string;
  day_name: string;
  weekday: string;
  weekday_short: string;
  predicted: number; // Ensemble / P50
  predicted_qty: number;
  p10: number; // Downside floor (90% exceedance)
  p50: number; // Expected median
  p90: number; // Peak procurement buffer
  linear: number;
  linear_pred: number;
  holt_winters: number;
  holt_winters_pred: number;
  naive_last_week: number;
  same_weekday_avg: number;
  ensemble: number;
  lower_bound: number;
  upper_bound: number;
  is_weekend: boolean;
  is_today: boolean;
  days_from_now: number;
  festival_name?: string;
}

export interface ForecastResult {
  horizon_days: number;
  predicted_total_7d: number;
  mape_ensemble: number;
  mape_linear: number;
  mape_holt_winters: number;
  mape_naive: number;
  forecast: ForecastPoint[];
  insufficient?: boolean;
  days_available?: number;
  dates?: string[];
  historical_actuals?: number[];
  models_metrics?: Record<string, { mape: number; rmse: number }>;
  weights?: Record<string, number>;
  insights?: string[];
  reasons?: string[];
  data_quality?: {
    outages_imputed: number;
    gaps_filled: number;
    anomalies_detected: number;
    has_db_history: boolean;
  };
}

export interface DailyHistoricalPoint {
  date: string;
  day_name: string;
  sale_qty: number;
  collection: number;
  effective_rsp: number;
  active_stations: number;
  zero_sale_count: number;
}

export interface StockoutRiskStation {
  code: string;
  name: string;
  state: string;
  stock_ltr: number;
  daily_burn_ltr: number;
  days_left: number;
  remark: string;
}

export interface DecliningStation {
  code: string;
  name: string;
  state: string;
  drop_pct: number;
  drop_litres: number;
  current_sale: number;
}

export interface DatabaseDiagnostics {
  connected: boolean;
  engine?: 'external' | 'embedded';
  connection_string: string;
  host: string;
  port: number;
  database: string;
  user: string;
  active_source: 'PostgreSQL' | 'Embedded PostgreSQL' | 'Excel Fallback';
  total_rows?: number;
  min_date?: string;
  max_date?: string;
  distinct_days?: number;
  distinct_stations?: number;
  total_volume?: number;
  latest_date?: string;
  latest_date_stations?: number;
  latest_date_sale_qty?: number;
  latest_date_collection?: number;
  sample_records?: Array<{
    erp_code: string;
    alds_name: string;
    state: string;
    sale_qty: number;
    collection: number;
    closing_dip_in_ltr: number;
    sale_date: string;
  }>;
  error?: string | null;
  external_connection_error?: string | null;
  server_timestamp: string;
  discrepancy_analysis?: {
    has_discrepancy: boolean;
    reason?: string;
    ui_date: string;
    db_date?: string;
    ui_station_count: number;
    db_station_count?: number;
    ui_volume: number;
    db_volume?: number;
  };
}

export interface ExecutiveTelemetry {
  date: string;
  is_live: boolean;
  source_file: string;
  stations_total: number;
  stations_with_sale: number;
  zero_sale_count: number;
  total_sale_qty: number;
  total_collection: number;
  average_rsp: number;
  effective_rsp: number;
  collection_gap_per_l: number;
  total_free_sale_litres: number;
  total_free_sale_rupees: number;
  total_paytm_collection: number;
  total_cash_collection: number;
  health_score: number;
  stockout_risk_stations: StockoutRiskStation[];
  zero_sale_stations: StationRecord[];
  top_declining_stations: DecliningStation[];
  top_performing_stations: StationRecord[];
  bottom_performing_stations: StationRecord[];
  forecast: ForecastResult;
  history_30d: DailyHistoricalPoint[];
  states_summary: StateSummary[];
  tm_summary: TMSummary[];
  type_summary: TypeSummary[];
  all_stations: StationRecord[];
  db_diagnostics?: DatabaseDiagnostics;
}

export interface WhatIfInput {
  free_sale_reduction_pct: number;
  reopened_zero_sale_stations: number;
  collection_efficiency_gain_pct: number;
  market_demand_growth_pct: number;
}

export interface WhatIfOutput {
  baseline_sale_litres: number;
  projected_sale_litres: number;
  delta_sale_litres: number;
  baseline_collection_rs: number;
  projected_collection_rs: number;
  delta_collection_rs: number;
  free_sale_savings_rs: number;
  zero_sale_revenue_gain_rs: number;
  efficiency_recovery_rs: number;
  demand_gain_rs: number;
}

export interface DayAggregate {
  sale_date: string;
  total_qty: number;
  total_amount: number;
  total_collection: number;
  active_stations: number;
  avg_rsp: number;
  free_sale_total: number;
  stockout_stations: number;
}

export interface StateAggregate {
  state: string;
  station_count: number;
  total_qty: number;
  total_amount: number;
  total_collection: number;
  avg_daily_qty: number;
  volume_share_pct: number;
  active_ratio: number;
}

export interface TMAggregate {
  tm: string;
  state: string;
  station_count: number;
  total_qty: number;
  target_qty: number;
  achievement_pct: number;
  pacing_status: 'Ahead' | 'On Track' | 'At Risk' | 'Behind';
}

export interface CoordinatorAggregate {
  coordinator: string;
  station_count: number;
  total_qty: number;
  total_collection: number;
  avg_collection_pct: number;
}

export interface OperatingModelAggregate {
  type: string;
  station_count: number;
  total_qty: number;
  total_amount: number;
  avg_rsp: number;
  free_sale_pct: number;
  margin_per_litre: number;
}

export interface OutlierStation {
  erp_code: string;
  alds_name: string;
  state: string;
  sale_qty: number;
  lower_fence: number;
  upper_fence: number;
  status: 'Extreme High' | 'Severe Low' | 'Zero Sale';
  deviation_litres: number;
}

export interface DistributionStats {
  mean: number;
  median: number;
  std_dev: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  gini_coefficient: number;
}

export interface SimulationParams {
  free_sale_reduction_pct: number;
  zero_sale_recovery_pct: number;
  efficiency_improvement_pct: number;
  demand_growth_pct: number;
}

export interface SimulationResult {
  baseline_qty: number;
  baseline_revenue: number;
  simulated_qty: number;
  simulated_revenue: number;
  qty_gain: number;
  revenue_gain: number;
  breakdown: {
    free_sale_savings: number;
    zero_sale_gain: number;
    efficiency_gain: number;
    growth_gain: number;
  };
}
