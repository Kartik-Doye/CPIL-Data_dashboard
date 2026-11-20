import type {
  ExecutiveTelemetry,
  StateSummary,
  StationRecord,
  TMSummary,
} from '../types.js';
import { getStatePeriodView, getTMPeriodView } from './analyticsViews.js';
import { recommendTanker } from './tanker.js';

function cleanAscii(text: string): string {
  return String(text ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/→/g, '->')
    .replace(/↓/g, '(down)')
    .replace(/↑/g, '(up)')
    .replace(/−|–|—/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[^\x20-\x7E]/g, '');
}

function pdfEscape(str: string): string {
  return cleanAscii(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

const fmtNum = (val: number) =>
  Math.round(val || 0).toLocaleString('en-IN');

export function buildExecutivePdfBuffer(params: {
  date: string;
  stations: StationRecord[];
  statesSummary?: StateSummary[];
  tmSummary?: TMSummary[];
  telemetry?: Partial<ExecutiveTelemetry>;
}): Buffer {
  const { date, stations } = params;
  const states = params.statesSummary ?? getStatePeriodView(stations);
  const tms = params.tmSummary ?? getTMPeriodView(stations);
  const periodLabel =
    params.telemetry?.tm_target_meta?.period_label || 'Monthly Daily Target';

  const totalSale = stations.reduce((s, st) => s + st.sale_qty, 0);
  const totalDailyTgt = stations.reduce((s, st) => s + (st.daily_target || 0), 0);
  const totalAchievePct = totalDailyTgt > 0 ? ((totalSale / totalDailyTgt) * 100).toFixed(1) : '0.0';
  const totalColl = stations.reduce((s, st) => s + (st.net_total_collection || st.collection || 0), 0);
  const totalPaytm = stations.reduce((s, st) => s + (st.paytm || 0), 0);
  const totalCash = stations.reduce(
    (s, st) =>
      s +
      (st.net_cash_collection && st.net_cash_collection > 0
        ? st.net_cash_collection
        : Math.max(0, (st.net_total_collection || st.collection || 0) - (st.paytm || 0))),
    0,
  );
  const payDenom = Math.max(1, totalColl, totalPaytm + totalCash);
  const digPct = totalColl > 0 ? ((totalPaytm / payDenom) * 100).toFixed(1) : '0.0';
  const cashPct = totalColl > 0 ? ((totalCash / payDenom) * 100).toFixed(1) : '0.0';
  const activeCount = stations.filter((s) => s.sale_qty > 0).length;
  const zeroCount = stations.length - activeCount;
  const effRsp = totalSale > 0 ? (totalColl / totalSale).toFixed(2) : '0.00';

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_L = 36;
  const MARGIN_R = 36;
  const MARGIN_T = 48;
  const MARGIN_B = 42;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

  const pages: string[][] = [];
  let ops: string[] = [];
  let cursorY = PAGE_H - MARGIN_T;

  function startNewPage() {
    if (ops.length > 0) pages.push(ops);
    ops = [];
    cursorY = PAGE_H - MARGIN_T;
    ops.push('0.10 0.14 0.22 rg');
    ops.push(`${MARGIN_L} ${PAGE_H - 32} ${CONTENT_W} 15 re f`);
    ops.push('1 1 1 rg');
    ops.push(
      `BT /F2 7.5 Tf ${MARGIN_L + 6} ${PAGE_H - 27} Td (CPIL GO GAS EXECUTIVE DAILY DOSSIER  |  OPERATING DATE: ${pdfEscape(date)}  |  ${pdfEscape(periodLabel)}) Tj ET`,
    );
  }

  function ensureSpace(h: number) {
    if (cursorY - h < MARGIN_B) startNewPage();
  }

  function drawSectionHeader(title: string) {
    ensureSpace(26);
    cursorY -= 6;
    ops.push('0.93 0.95 0.98 rg');
    ops.push(`${MARGIN_L} ${cursorY - 16} ${CONTENT_W} 18 re f`);
    ops.push('0.25 0.22 0.78 rg');
    ops.push(`${MARGIN_L} ${cursorY - 16} 3.5 18 re f`);
    ops.push('0.10 0.14 0.22 rg');
    ops.push(`BT /F2 10 Tf ${MARGIN_L + 8} ${cursorY - 11} Td (${pdfEscape(title)}) Tj ET`);
    cursorY -= 22;
  }

  function drawTable(headers: string[], colWidths: number[], rows: string[][]) {
    const rowH = 14;
    ensureSpace(rowH * 2);

    const renderRow = (cells: string[], isHeader: boolean, isEven: boolean) => {
      if (cursorY - (rowH + 2) < MARGIN_B) {
        startNewPage();
        if (!isHeader) {
          renderRow(headers, true, false);
        }
      }
      if (isHeader) {
        ops.push('0.12 0.16 0.25 rg');
        ops.push(`${MARGIN_L} ${cursorY - rowH} ${CONTENT_W} ${rowH} re f`);
      } else if (isEven) {
        ops.push('0.96 0.97 0.99 rg');
        ops.push(`${MARGIN_L} ${cursorY - rowH} ${CONTENT_W} ${rowH} re f`);
      }
      let cx = MARGIN_L;
      for (let i = 0; i < cells.length; i++) {
        const w = colWidths[i];
        ops.push('0.82 0.85 0.90 RG 0.4 w');
        ops.push(`${cx} ${cursorY - rowH} ${w} ${rowH} re S`);
        const maxChars = Math.max(4, Math.floor(w / 4.2));
        const txt = cleanAscii(cells[i] || '').slice(0, maxChars);
        if (isHeader) {
          ops.push('1 1 1 rg');
          ops.push(`BT /F2 7.2 Tf ${cx + 3} ${cursorY - 10} Td (${pdfEscape(txt)}) Tj ET`);
        } else {
          ops.push('0.10 0.14 0.20 rg');
          const font = i === 0 ? '/F2' : '/F1';
          ops.push(`BT ${font} 7.2 Tf ${cx + 3} ${cursorY - 10} Td (${pdfEscape(txt)}) Tj ET`);
        }
        cx += w;
      }
      cursorY -= rowH;
    };

    renderRow(headers, true, false);
    rows.forEach((r, idx) => renderRow(r, false, idx % 2 === 1));
    cursorY -= 8;
  }

  startNewPage();

  // Title Banner
  ensureSpace(50);
  ops.push('0.18 0.17 0.48 rg');
  ops.push(`${MARGIN_L} ${cursorY - 42} ${CONTENT_W} 42 re f`);
  ops.push('1 1 1 rg');
  ops.push(
    `BT /F2 13.5 Tf ${MARGIN_L + 10} ${cursorY - 18} Td (CPIL GO Gas Daily Executive Intelligence & Target Dossier) Tj ET`,
  );
  ops.push('0.86 0.90 0.98 rg');
  ops.push(
    `BT /F1 8.5 Tf ${MARGIN_L + 10} ${cursorY - 33} Td (Date: ${pdfEscape(date)}   |   Active Stations: ${activeCount}/${stations.length} (Zero-Sale: ${zeroCount})   |   Target Source: ${pdfEscape(periodLabel)}) Tj ET`,
  );
  cursorY -= 50;

  // Section 1: Network KPI Summary
  drawSectionHeader('1. Executive Network Performance, Target & Money Security Snapshot');
  drawTable(
    ['Metric', 'Value', 'Benchmark / Operational Context'],
    [CONTENT_W * 0.30, CONTENT_W * 0.28, CONTENT_W * 0.42],
    [
      ['Total Daily Volume Sold', `${fmtNum(totalSale)} L`, `Daily Target: ${fmtNum(totalDailyTgt)} L (${totalAchievePct}% Achieved)`],
      ['Total Net Collections', `Rs. ${fmtNum(totalColl)}`, `Weighted Realized Effective RSP: Rs. ${effRsp}/L`],
      ['Digital Payment (Money Security)', `Rs. ${fmtNum(totalPaytm)} (${digPct}%)`, 'Mission Goal: >= 50% Digital QR/UPI Collection'],
      ['Physical Cash Payment', `Rs. ${fmtNum(totalCash)} (${cashPct}%)`, 'High-cash sites prioritized for digital conversion'],
      ['Active vs Zero-Sale Stations', `${activeCount} Active / ${zeroCount} Zero`, `Network Uptime: ${stations.length > 0 ? ((activeCount / stations.length) * 100).toFixed(1) : '0'}%`],
    ],
  );

  // Section 2: State-Wise MIS Table
  drawSectionHeader('2. State-Wise MIS Summary');
  drawTable(
    ['State', 'Stations', 'Zero Sale', 'Total Sale (L)', 'Avg/Stn (L)', 'Collections (Rs.)', 'Eff RSP'],
    [
      CONTENT_W * 0.11,
      CONTENT_W * 0.11,
      CONTENT_W * 0.12,
      CONTENT_W * 0.18,
      CONTENT_W * 0.15,
      CONTENT_W * 0.20,
      CONTENT_W * 0.13,
    ],
    states.map((st) => [
      st.state,
      String(st.stations),
      String(st.zero_sale_count),
      fmtNum(st.total_sale_qty),
      fmtNum(st.avg_sale_per_station),
      `Rs. ${fmtNum(st.total_collection)}`,
      `Rs. ${st.effective_rsp.toFixed(2)}`,
    ]),
  );

  // Section 3: TM Daily Target, MTD Pace, Required Asking Rate, 3-Month Trend & Payment Mix
  drawSectionHeader(`3. Territory Manager Daily Target, MTD Pace, 3M Trend & Payment Mix (${periodLabel})`);
  drawTable(
    ['TM Name', 'Met/Tot', 'Daily Tgt (L)', 'Actual (L)', '% Tgt', 'MTD / Mnth Tgt', 'Ask L/d', '3M Trend', 'Dig/Cash %'],
    [
      CONTENT_W * 0.17,
      CONTENT_W * 0.08,
      CONTENT_W * 0.11,
      CONTENT_W * 0.11,
      CONTENT_W * 0.08,
      CONTENT_W * 0.17,
      CONTENT_W * 0.09,
      CONTENT_W * 0.09,
      CONTENT_W * 0.10,
    ],
    tms.map((t) => [
      t.tm,
      `${t.stations_met_target ?? 0}/${t.stations}`,
      fmtNum(t.daily_target || 0),
      fmtNum(t.total_sale_qty),
      `${t.efficiency_pct}%`,
      `${fmtNum(t.mtd_sale_qty || 0)}/${fmtNum(t.monthly_target || 0)}`,
      fmtNum(t.required_asking_rate_l_per_day || 0),
      `${(t.three_month_change_pct || 0) > 0 ? '+' : ''}${t.three_month_change_pct || 0}%`,
      `${t.digital_pct ?? 0}%/${t.cash_pct ?? 0}%`,
    ]),
  );

  // Section 4: Top 12 Cash-Heavy Stations (Money Security Conversion Priority)
  const topCashStations = [...stations]
    .filter((s) => (s.net_total_collection || s.collection || 0) >= 1000)
    .sort((a, b) => (b.net_cash_collection || 0) - (a.net_cash_collection || 0))
    .slice(0, 12);

  drawSectionHeader('4. Top 12 Cash-Heavy Stations (Priority to Convert to Digital for Money Security)');
  drawTable(
    ['ERP', 'Station Name', 'State', 'TM', 'SS (Supervisor)', 'Cash (Rs.)', 'Cash %', 'Digital %'],
    [
      CONTENT_W * 0.09,
      CONTENT_W * 0.24,
      CONTENT_W * 0.07,
      CONTENT_W * 0.16,
      CONTENT_W * 0.18,
      CONTENT_W * 0.12,
      CONTENT_W * 0.07,
      CONTENT_W * 0.07,
    ],
    topCashStations.map((s) => [
      s.erp_code,
      s.alds_name,
      s.state,
      s.tm,
      s.ss_name || '-',
      `Rs. ${fmtNum(s.net_cash_collection || 0)}`,
      `${s.cash_pct ?? 0}%`,
      `${s.digital_pct ?? 0}%`,
    ]),
  );

  // Section 5: Urgent Tanker Dispatch Queue (<2.5 Days Cover)
  const urgentDispatch = [...stations]
    .filter((s) => s.days_left <= 2.5)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 15);

  if (urgentDispatch.length > 0) {
    drawSectionHeader('5. Urgent Tanker Replenishment Queue (<= 2.5 Days Stock Cover)');
    drawTable(
      ['ERP', 'Station Name', 'State', 'TM', 'Closing Dip', '7d Burn', 'Cover', 'Recommended Tanker'],
      [
        CONTENT_W * 0.09,
        CONTENT_W * 0.24,
        CONTENT_W * 0.07,
        CONTENT_W * 0.16,
        CONTENT_W * 0.11,
        CONTENT_W * 0.11,
        CONTENT_W * 0.08,
        CONTENT_W * 0.14,
      ],
      urgentDispatch.map((s) => {
        const burn = s.rolling_7d_burn || s.sale_qty || 0;
        const rec = recommendTanker(burn, s.closing_dip_in_ltr, 3, s.tank_cap);
        return [
          s.erp_code,
          s.alds_name,
          s.state,
          s.tm,
          `${fmtNum(s.closing_dip_in_ltr)} L`,
          `${fmtNum(burn)} L/d`,
          `${s.days_left}d`,
          rec.tankerLabel,
        ];
      }),
    );
  }

  if (ops.length > 0) pages.push(ops);

  const totalPages = pages.length;
  for (let p = 0; p < totalPages; p++) {
    pages[p].push('0.40 0.45 0.55 rg');
    pages[p].push(
      `BT /F1 7.5 Tf ${MARGIN_L} 22 Td (CPIL GO Gas Executive Intelligence Suite - Automated Daily Dossier (${pdfEscape(date)})          Page ${p + 1} of ${totalPages}) Tj ET`,
    );
  }

  const objects: string[] = [];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesRootId = addObj('');
  const pageIds: number[] = [];

  for (const pageOps of pages) {
    const streamData = pageOps.join('\n');
    const contentId = addObj(`<< /Length ${Buffer.byteLength(streamData, 'latin1')} >>\nstream\n${streamData}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[pagesRootId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
