import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

export interface MonthlyHistoricalAchievement {
  monthLabel: string;
  totalAch: number;
  avgDailyAch: number;
}

export interface StationTargetRow {
  erpCode: string;
  srNo: number | null;
  stationName: string;
  state: string;
  tm: string;
  ss: string;
  type: string;
  dailyTarget: number;
  monthlyTarget: number;
  historicalMonths: MonthlyHistoricalAchievement[];
  startingMonthLabel: string;
  startingMonthAvgDaily: number;
  latestMonthLabel: string;
  latestMonthAvgDaily: number;
  threeMonthAvgDaily: number;
  threeMonthChangeLitres: number;
  threeMonthChangePct: number;
  targetVsStartingMonthPct: number;
  isConsecutive3mDecline: boolean;
}

export interface TmHistoricalSummary {
  tm: string;
  stationsCount: number;
  dailyTarget: number;
  monthlyTarget: number;
  historicalMonths: MonthlyHistoricalAchievement[];
  startingMonthLabel: string;
  startingMonthAvgDaily: number;
  latestMonthLabel: string;
  latestMonthAvgDaily: number;
  threeMonthAvgDaily: number;
  threeMonthChangeLitres: number;
  threeMonthChangePct: number;
  targetVsStartingMonthPct: number;
  isConsecutive3mDecline: boolean;
}

export interface TmTargetDailySummary {
  sourceFile: string;
  periodLabel: string;
  monthlyTargetLabel: string;
  historicalMonthLabels: string[];
  updatedAt: string;
  mtimeMs: number;
  stationCount: number;
  tmCount: number;
  totalNetworkDailyTarget: number;
  totalNetworkMonthlyTarget: number;
  stationTargetsByErp: Record<string, number>;
  stationMetaByErp: Record<string, StationTargetRow>;
  tmTotalDailyTargets: Record<string, number>;
  tmAvgStationTargets: Record<string, number>;
  tmStationCounts: Record<string, number>;
  tmHistoryByTm: Record<string, TmHistoricalSummary>;
}

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s._-]+/g, '');

const normalizeText = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

function extractNumericCellValue(cell: ExcelJS.Cell): number {
  const val = cell.value;
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.round(val * 100) / 100);
  }
  if (val && typeof val === 'object' && 'result' in val) {
    const res = Number((val as { result?: unknown }).result);
    if (Number.isFinite(res)) return Math.max(0, Math.round(res * 100) / 100);
  }
  const parsed = Number(String(cell.text ?? val ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

/**
 * Parses `TM Target Daily.xlsx` dynamically so monthly updates (e.g. "Nov. 2026 Avg. daily Tgt.",
 * "Dec. 2026 Avg. daily Tgt.") and their preceding 3 months' achievement columns ("Aug. 26 Ach.",
 * "Aug. 26 Avg. Daily Ach.", etc.) are detected automatically without hardcoding.
 */
export function parseTmTargetDailyWorkbook(
  workbook: ExcelJS.Workbook,
  sourceFile = 'TM Target Daily.xlsx',
  mtimeMs = Date.now(),
): TmTargetDailySummary {
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error(`${sourceFile} does not contain any worksheet.`);
  }

  let headerRowNumber = 0;
  let erpCol = 0;
  let srNoCol = 0;
  let stationNameCol = 0;
  let stateCol = 0;
  let tmCol = 0;
  let ssCol = 0;
  let typeCol = 0;
  let dailyTargetCol = 0;
  let monthlyTargetCol = 0;
  let periodLabel = 'Monthly Avg. Daily Target';
  let monthlyTargetLabel = 'Monthly Total Target';
  const histMonthColMap = new Map<string, { monthLabel: string; totalCol?: number; avgDailyCol?: number }>();

  for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
    const row = sheet.getRow(r);
    let candidateErp = 0;
    let candidateName = 0;
    let candidateState = 0;
    let candidateTm = 0;
    let candidateSs = 0;
    let candidateType = 0;
    let candidateSr = 0;
    let candidateDailyTarget = 0;
    let candidateMonthlyTarget = 0;
    let candidateDailyLabel = '';
    let candidateMonthlyLabel = '';
    const candidateHistMonths = new Map<string, { monthLabel: string; totalCol?: number; avgDailyCol?: number }>();

    row.eachCell((cell, colNumber) => {
      const rawHeader = normalizeText(String(cell.text ?? cell.value ?? ''));
      const norm = normalizeHeader(rawHeader);
      if (!norm) return;

      if (norm === 'erpcode' || norm === 'costcode' || norm === 'stationcode') {
        candidateErp = colNumber;
      } else if (norm === 'srno' || norm === 'sno') {
        candidateSr = colNumber;
      } else if (norm === 'stationname' || norm === 'aldsname' || norm === 'outletname') {
        candidateName = colNumber;
      } else if (norm === 'state') {
        candidateState = colNumber;
      } else if (norm === 'tm' || norm === 'territorymanager') {
        candidateTm = colNumber;
      } else if (norm === 'ss' || norm === 'stationsupervisor' || norm === 'supervisor') {
        candidateSs = colNumber;
      } else if (norm === 'type' || norm === 'stationtype') {
        candidateType = colNumber;
      } else if (/avg.*daily.*(tgt|target)|daily.*(tgt|target)/i.test(rawHeader)) {
        candidateDailyTarget = colNumber;
        candidateDailyLabel = rawHeader;
      } else if (/(mnth|month|monthly).*(tgt|target)/i.test(rawHeader)) {
        candidateMonthlyTarget = colNumber;
        candidateMonthlyLabel = rawHeader;
      } else if (/(tgt|target)/i.test(rawHeader) && !candidateDailyTarget) {
        candidateDailyTarget = colNumber;
        candidateDailyLabel = rawHeader;
      } else if (/avg.*daily.*ach/i.test(rawHeader)) {
        const prefix = normalizeText(rawHeader.replace(/avg\.?\s*daily\s*ach\.?/i, ''));
        const key = prefix.toLowerCase() || `m-${colNumber}`;
        const existing = candidateHistMonths.get(key) || { monthLabel: prefix || rawHeader };
        existing.avgDailyCol = colNumber;
        candidateHistMonths.set(key, existing);
      } else if (/ach\.?$/i.test(rawHeader)) {
        const prefix = normalizeText(rawHeader.replace(/ach\.?$/i, ''));
        const key = prefix.toLowerCase() || `m-${colNumber}`;
        const existing = candidateHistMonths.get(key) || { monthLabel: prefix || rawHeader };
        existing.totalCol = colNumber;
        candidateHistMonths.set(key, existing);
      }
    });

    if (candidateErp && candidateTm && (candidateDailyTarget || candidateType)) {
      headerRowNumber = r;
      erpCol = candidateErp;
      srNoCol = candidateSr;
      stationNameCol = candidateName;
      stateCol = candidateState;
      tmCol = candidateTm;
      ssCol = candidateSs;
      typeCol = candidateType;
      dailyTargetCol = candidateDailyTarget || (candidateType ? candidateType + 1 : 8);
      monthlyTargetCol = candidateMonthlyTarget;
      if (candidateDailyLabel) {
        periodLabel = candidateDailyLabel;
      }
      if (candidateMonthlyLabel) {
        monthlyTargetLabel = candidateMonthlyLabel;
      }
      for (const [k, v] of candidateHistMonths.entries()) {
        if (v.avgDailyCol || v.totalCol) {
          histMonthColMap.set(k, v);
        }
      }
      break;
    }
  }

  if (!headerRowNumber) {
    throw new Error(`${sourceFile} is missing required headers (ERP Code, TM, and Daily Target column).`);
  }

  const orderedHistMonths = [...histMonthColMap.values()];
  const historicalMonthLabels = orderedHistMonths.map((m) => m.monthLabel);

  const stationTargetsByErp: Record<string, number> = {};
  const stationMetaByErp: Record<string, StationTargetRow> = {};
  const tmTotalDailyTargets: Record<string, number> = {};
  const tmTotalMonthlyTargets: Record<string, number> = {};
  const tmStationCounts: Record<string, number> = {};
  const tmHistMonthAgg = new Map<string, Array<{ totalAch: number; avgDailyAch: number }>>();
  let totalNetworkDailyTarget = 0;
  let totalNetworkMonthlyTarget = 0;

  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rawErp = erpCol ? normalizeText(String(row.getCell(erpCol).text ?? '')) : '';
    if (!rawErp) continue;

    const erpCode = rawErp.toUpperCase();
    const srNoVal = srNoCol ? Number(row.getCell(srNoCol).value) : NaN;
    const srNo = Number.isFinite(srNoVal) ? srNoVal : null;
    const stationName = stationNameCol ? normalizeText(String(row.getCell(stationNameCol).text ?? '')) : '';
    const state = stateCol ? normalizeText(String(row.getCell(stateCol).text ?? '')) : '';
    const tm = tmCol ? normalizeText(String(row.getCell(tmCol).text ?? '')) || 'Unassigned' : 'Unassigned';
    const ss = ssCol ? normalizeText(String(row.getCell(ssCol).text ?? '')) : '';
    const type = typeCol ? normalizeText(String(row.getCell(typeCol).text ?? '')) : '';
    const dailyTarget = dailyTargetCol ? extractNumericCellValue(row.getCell(dailyTargetCol)) : 0;
    const monthlyTarget = monthlyTargetCol
      ? extractNumericCellValue(row.getCell(monthlyTargetCol))
      : Number((dailyTarget * 30).toFixed(2));

    const historicalMonths: MonthlyHistoricalAchievement[] = orderedHistMonths.map((m) => {
      const totalAch = m.totalCol ? extractNumericCellValue(row.getCell(m.totalCol)) : 0;
      const avgDailyAch = m.avgDailyCol
        ? extractNumericCellValue(row.getCell(m.avgDailyCol))
        : Number((totalAch / 30).toFixed(2));
      return {
        monthLabel: m.monthLabel,
        totalAch,
        avgDailyAch,
      };
    });

    const firstMonth = historicalMonths[0];
    const lastMonth = historicalMonths[historicalMonths.length - 1];
    const startingMonthLabel = firstMonth?.monthLabel || 'Month 1';
    const startingMonthAvgDaily = firstMonth?.avgDailyAch || 0;
    const latestMonthLabel = lastMonth?.monthLabel || 'Latest Month';
    const latestMonthAvgDaily = lastMonth?.avgDailyAch || 0;
    const positiveMonths = historicalMonths.filter((m) => m.avgDailyAch > 0);
    const threeMonthAvgDaily = positiveMonths.length > 0
      ? Number((positiveMonths.reduce((s, m) => s + m.avgDailyAch, 0) / positiveMonths.length).toFixed(2))
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

    stationTargetsByErp[erpCode] = dailyTarget;
    stationMetaByErp[erpCode] = {
      erpCode,
      srNo,
      stationName,
      state,
      tm,
      ss,
      type,
      dailyTarget,
      monthlyTarget,
      historicalMonths,
      startingMonthLabel,
      startingMonthAvgDaily,
      latestMonthLabel,
      latestMonthAvgDaily,
      threeMonthAvgDaily,
      threeMonthChangeLitres,
      threeMonthChangePct,
      targetVsStartingMonthPct,
      isConsecutive3mDecline,
    };

    tmTotalDailyTargets[tm] = Number(((tmTotalDailyTargets[tm] ?? 0) + dailyTarget).toFixed(2));
    tmTotalMonthlyTargets[tm] = Number(((tmTotalMonthlyTargets[tm] ?? 0) + monthlyTarget).toFixed(2));
    tmStationCounts[tm] = (tmStationCounts[tm] ?? 0) + 1;
    totalNetworkDailyTarget = Number((totalNetworkDailyTarget + dailyTarget).toFixed(2));
    totalNetworkMonthlyTarget = Number((totalNetworkMonthlyTarget + monthlyTarget).toFixed(2));

    if (!tmHistMonthAgg.has(tm)) {
      tmHistMonthAgg.set(
        tm,
        orderedHistMonths.map(() => ({ totalAch: 0, avgDailyAch: 0 })),
      );
    }
    const tmMonths = tmHistMonthAgg.get(tm)!;
    historicalMonths.forEach((hm, idx) => {
      tmMonths[idx].totalAch = Number((tmMonths[idx].totalAch + hm.totalAch).toFixed(2));
      tmMonths[idx].avgDailyAch = Number((tmMonths[idx].avgDailyAch + hm.avgDailyAch).toFixed(2));
    });
  }

  const tmAvgStationTargets: Record<string, number> = {};
  const tmHistoryByTm: Record<string, TmHistoricalSummary> = {};

  for (const [tm, totalTarget] of Object.entries(tmTotalDailyTargets)) {
    const count = tmStationCounts[tm] || 1;
    tmAvgStationTargets[tm] = Number((totalTarget / count).toFixed(2));

    const rawTmMonths = tmHistMonthAgg.get(tm) || [];
    const historicalMonths: MonthlyHistoricalAchievement[] = orderedHistMonths.map((m, idx) => ({
      monthLabel: m.monthLabel,
      totalAch: rawTmMonths[idx]?.totalAch ?? 0,
      avgDailyAch: rawTmMonths[idx]?.avgDailyAch ?? 0,
    }));
    const firstM = historicalMonths[0];
    const lastM = historicalMonths[historicalMonths.length - 1];
    const startingMonthAvgDaily = firstM?.avgDailyAch || 0;
    const latestMonthAvgDaily = lastM?.avgDailyAch || 0;
    const posM = historicalMonths.filter((m) => m.avgDailyAch > 0);
    const threeMonthAvgDaily = posM.length > 0
      ? Number((posM.reduce((s, m) => s + m.avgDailyAch, 0) / posM.length).toFixed(2))
      : 0;
    const threeMonthChangeLitres = Number((latestMonthAvgDaily - startingMonthAvgDaily).toFixed(2));
    const threeMonthChangePct = startingMonthAvgDaily > 0
      ? Number((((latestMonthAvgDaily - startingMonthAvgDaily) / startingMonthAvgDaily) * 100).toFixed(1))
      : 0;
    const targetVsStartingMonthPct = startingMonthAvgDaily > 0
      ? Number((((totalTarget - startingMonthAvgDaily) / startingMonthAvgDaily) * 100).toFixed(1))
      : 0;
    const isConsecutive3mDecline =
      historicalMonths.length >= 3 &&
      historicalMonths[0].avgDailyAch > 0 &&
      historicalMonths[1].avgDailyAch < historicalMonths[0].avgDailyAch &&
      historicalMonths[2].avgDailyAch < historicalMonths[1].avgDailyAch;

    tmHistoryByTm[tm] = {
      tm,
      stationsCount: count,
      dailyTarget: totalTarget,
      monthlyTarget: tmTotalMonthlyTargets[tm] ?? Number((totalTarget * 30).toFixed(2)),
      historicalMonths,
      startingMonthLabel: firstM?.monthLabel || 'Month 1',
      startingMonthAvgDaily,
      latestMonthLabel: lastM?.monthLabel || 'Latest Month',
      latestMonthAvgDaily,
      threeMonthAvgDaily,
      threeMonthChangeLitres,
      threeMonthChangePct,
      targetVsStartingMonthPct,
      isConsecutive3mDecline,
    };
  }

  return {
    sourceFile: path.basename(sourceFile),
    periodLabel,
    monthlyTargetLabel,
    historicalMonthLabels,
    updatedAt: new Date(mtimeMs).toISOString(),
    mtimeMs,
    stationCount: Object.keys(stationMetaByErp).length,
    tmCount: Object.keys(tmTotalDailyTargets).length,
    totalNetworkDailyTarget,
    totalNetworkMonthlyTarget,
    stationTargetsByErp,
    stationMetaByErp,
    tmTotalDailyTargets,
    tmAvgStationTargets,
    tmStationCounts,
    tmHistoryByTm,
  };
}

let cachedSummary: TmTargetDailySummary | null = null;
let cachedMtimeMs = 0;
let cachedFilePath = '';

export async function loadTmTargetDailyFromFile(
  customPath?: string,
): Promise<TmTargetDailySummary | null> {
  const candidates = [
    customPath,
    path.resolve(process.cwd(), 'TM Target Daily.xlsx'),
    path.resolve(process.cwd(), '..', 'TM Target Daily.xlsx'),
  ].filter((p): p is string => Boolean(p));

  const resolvedPath = candidates.find((p) => fs.existsSync(p));
  if (!resolvedPath) {
    return null;
  }

  const stat = fs.statSync(resolvedPath);
  if (
    cachedSummary &&
    cachedFilePath === resolvedPath &&
    cachedMtimeMs === stat.mtimeMs
  ) {
    return cachedSummary;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvedPath);
  const summary = parseTmTargetDailyWorkbook(workbook, resolvedPath, stat.mtimeMs);
  cachedSummary = summary;
  cachedMtimeMs = stat.mtimeMs;
  cachedFilePath = resolvedPath;
  return summary;
}

export function invalidateTmTargetDailyCache(): void {
  cachedSummary = null;
  cachedMtimeMs = 0;
}
