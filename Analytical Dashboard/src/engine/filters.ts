/**
 * Pure TypeScript conversion of filters.py
 * Shared multi-dimensional filter engine for Analytical Dashboard.
 * 
 * Supports:
 * - Time buttons: 'latest', '7', '30', 'month', 'custom'
 * - State, Coordinator, TM, Operating Type (LOCO/DODO/JODO/COCO)
 * - Station ERP / Name search
 * - Year & Month narrowing
 * - SQL WHERE clause generation
 */

import { query, queryOne } from './db.js';

export interface FilterParams {
  time?: string;
  start?: string;
  end?: string;
  state?: string;
  coordinator?: string;
  tm?: string;
  type?: string;
  station?: string;
  year?: string;
  month?: string;
  compare?: string;
  cmp_start?: string;
  cmp_end?: string;
}

export interface FilterChoices {
  states: string[];
  coordinators: string[];
  tms: string[];
  types: string[];
  years: number[];
  months: number[];
}

export class Filters {
  time_btn: string;
  custom_start: string;
  custom_end: string;
  state: string;
  coordinator: string;
  tm: string;
  type: string;
  station_search: string;
  year: string;
  month: string;

  latest_date: string | null = null;
  earliest_date: string | null = null;
  date_start: string | null = null;
  date_end: string | null = null;
  calendar_days = 0;
  private _loaded = false;

  constructor(params: FilterParams = {}) {
    this.time_btn = params.time || 'month';
    this.custom_start = params.start || '';
    this.custom_end = params.end || '';
    this.state = params.state || '';
    this.coordinator = params.coordinator || '';
    this.tm = params.tm || '';
    this.type = params.type || '';
    this.station_search = params.station || '';
    this.year = params.year || '';
    this.month = params.month || '';
  }

  async load(): Promise<void> {
    if (this._loaded) return;

    const row = await queryOne<{ latest: string; earliest: string }>(
      'SELECT MAX(sale_date)::text AS latest, MIN(sale_date)::text AS earliest FROM v_daily'
    );

    if (row && row.latest) {
      this.latest_date = row.latest.slice(0, 10);
      this.earliest_date = row.earliest.slice(0, 10);
    } else {
      // Fallback
      this.latest_date = '2026-10-30';
      this.earliest_date = '2026-08-01';
    }

    this.computeDateRange();
    this._loaded = true;
  }

  private computeDateRange(): void {
    if (!this.latest_date) return;
    const ld = new Date(this.latest_date);

    if (this.year && this.month) {
      const y = parseInt(this.year, 10);
      const m = parseInt(this.month, 10);
      const s = new Date(Date.UTC(y, m - 1, 1));
      const e = new Date(Date.UTC(y, m, 0));
      this.date_start = s.toISOString().slice(0, 10);
      this.date_end = e.toISOString().slice(0, 10);
      return;
    }

    if (this.time_btn === 'latest') {
      this.date_start = this.latest_date;
      this.date_end = this.latest_date;
    } else if (this.time_btn === '7') {
      const s = new Date(ld.getTime() - 6 * 86400000);
      this.date_start = s.toISOString().slice(0, 10);
      this.date_end = this.latest_date;
    } else if (this.time_btn === '30') {
      const s = new Date(ld.getTime() - 29 * 86400000);
      this.date_start = s.toISOString().slice(0, 10);
      this.date_end = this.latest_date;
    } else if (this.time_btn === 'month') {
      const s = new Date(Date.UTC(ld.getUTCFullYear(), ld.getUTCMonth(), 1));
      this.date_start = s.toISOString().slice(0, 10);
      this.date_end = this.latest_date;
    } else if (this.time_btn === 'custom' && this.custom_start && this.custom_end) {
      this.date_start = this.custom_start;
      this.date_end = this.custom_end;
    } else {
      this.date_start = this.earliest_date || '2026-08-01';
      this.date_end = this.latest_date;
    }
  }

  where(options: {
    view_has_state?: boolean;
    view_has_coord?: boolean;
    view_has_tm?: boolean;
    view_has_type?: boolean;
    view_has_station?: boolean;
    table_alias?: string;
    include_dates?: boolean;
  } = {}): { clause: string; params: any[] } {
    const {
      view_has_state = true,
      view_has_coord = true,
      view_has_tm = true,
      view_has_type = true,
      view_has_station = false,
      table_alias = '',
      include_dates = true,
    } = options;

    const prefix = table_alias ? `${table_alias}.` : '';
    const conditions: string[] = [];
    const params: any[] = [];

    if (include_dates && this.date_start && this.date_end) {
      conditions.push(`${prefix}sale_date BETWEEN $${params.length + 1} AND $${params.length + 2}`);
      params.push(this.date_start, this.date_end);
    }

    if (this.state && view_has_state) {
      conditions.push(`${prefix}state = $${params.length + 1}`);
      params.push(this.state);
    }
    if (this.coordinator && view_has_coord) {
      conditions.push(`${prefix}coordinator = $${params.length + 1}`);
      params.push(this.coordinator);
    }
    if (this.tm && view_has_tm) {
      conditions.push(`${prefix}tm = $${params.length + 1}`);
      params.push(this.tm);
    }
    if (this.type && view_has_type) {
      conditions.push(`${prefix}type = $${params.length + 1}`);
      params.push(this.type);
    }
    if (this.station_search && view_has_station) {
      conditions.push(`(${prefix}erp_code ILIKE $${params.length + 1} OR ${prefix}alds_name ILIKE $${params.length + 2})`);
      params.push(`%${this.station_search}%`, `%${this.station_search}%`);
    }

    const clause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }

  async choices(): Promise<FilterChoices> {
    const statesRow = await query<{ state: string }>(
      'SELECT DISTINCT state FROM v_daily ORDER BY state'
    );
    const coordinatorsRow = await query<{ coordinator: string }>(
      'SELECT DISTINCT coordinator FROM v_daily ORDER BY coordinator'
    );
    const tmsRow = await query<{ tm: string }>(
      'SELECT DISTINCT tm FROM v_daily ORDER BY tm'
    );
    const typesRow = await query<{ type: string }>(
      'SELECT DISTINCT type FROM v_daily ORDER BY type'
    );

    return {
      states: statesRow.map(r => r.state).filter(Boolean),
      coordinators: coordinatorsRow.map(r => r.coordinator).filter(Boolean),
      tms: tmsRow.map(r => r.tm).filter(Boolean),
      types: typesRow.map(r => r.type).filter(Boolean),
      years: [2026],
      months: [8, 9, 10],
    };
  }
}
