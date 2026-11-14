import React, { useState } from 'react';
import {
  FileText,
  Search,
  ExternalLink,
  Info,
  ChevronRight,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Download,
  Truck,
} from 'lucide-react';
import { ExecutiveTelemetry } from '../types';
import type { ReportTab } from './Navigation';

interface AllReportsDirectoryProps {
  data: ExecutiveTelemetry;
  onSelectTab: (tab: ReportTab) => void;
}

interface ReportMeta {
  num: number;
  id: string;
  title: string;
  category: 'Executive' | 'Operations' | 'Collections & Realization' | 'Forecasting' | 'Diagnostics';
  desc: string;
  directTab?: ReportTab;
}

export const AllReportsDirectory: React.FC<AllReportsDirectoryProps> = ({
  data,
  onSelectTab,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportNum, setSelectedReportNum] = useState<number | null>(null);

  const reports: ReportMeta[] = [
    { num: 1, id: 'r1', title: 'Ad-hoc Data Explorer', category: 'Diagnostics', desc: 'Raw multi-dimensional explorer with flexible column selection and CSV export.', directTab: 'adhoc' },
    { num: 2, id: 'r2', title: 'Master Executive Dashboard', category: 'Executive', desc: '10-second snapshot for CMD/MD: KPIs, 30d trend, Top 5/Bottom 5, health score.', directTab: 'master' },
    { num: 3, id: 'r3', title: 'RSP & Collection Realization', category: 'Collections & Realization', desc: 'Interactive comparison of nominal ERP rate and effective collection per litre; this is not a profit or margin report.', directTab: 'rsp' },
    { num: 4, id: 'r4', title: 'Day-over-Day Variance (DoD)', category: 'Operations', desc: 'Planned scope: station volume comparison with the previous operational day.' },
    { num: 5, id: 'r5', title: 'Daily Sales Trend & 7MA', category: 'Executive', desc: 'Planned scope: daily network sales trend with a seven-day moving average.' },
    { num: 6, id: 'r6', title: 'Weekly Performance Analysis', category: 'Operations', desc: 'Planned scope: weekly volume comparison and week-on-week change.' },
    { num: 7, id: 'r7', title: 'Month-on-Month Growth (MoM)', category: 'Executive', desc: 'Planned scope: monthly volume and collection comparisons.' },
    { num: 8, id: 'r8', title: 'CMD MIS State Summary', category: 'Executive', desc: 'One-page executive table formatted for CMD/MD review with state-level metrics.', directTab: 'states' },
    { num: 9, id: 'r9', title: 'Averages & Unit Metrics', category: 'Operations', desc: 'Planned scope: average litres per day and per station, compared across regions.' },
    { num: 10, id: 'r10', title: 'Sales Analysis & Pareto Share', category: 'Operations', desc: 'Planned scope: volume breakdown by state, TM, coordinator, and station type.' },
    { num: 11, id: 'r11', title: 'Station-wise Detail Ledger', category: 'Operations', desc: 'Granular 316-station ledger with closing dip, sales, and collection stats.', directTab: 'stations' },
    { num: 12, id: 'r12', title: 'Dispenser & Pump Throughput', category: 'Operations', desc: 'Planned scope: pump-level throughput analysis; pump/nozzle data is not currently available.' },
    { num: 13, id: 'r13', title: 'Team Performance (TM & Coord)', category: 'Operations', desc: 'Latest-day territory volume leaderboard; the throughput percentage uses a default benchmark, not an approved plan.', directTab: 'team' },
    { num: 14, id: 'r14', title: 'Sales Benchmark vs Actual', category: 'Operations', desc: 'Compare latest-day volume with editable benchmarks stored in this browser; no approved business plan is connected.', directTab: 'targets' },
    { num: 15, id: 'r15', title: 'Station Benchmark Variance', category: 'Operations', desc: 'Planned scope: station-level comparison with an approved sales plan, which is not yet available.' },
    { num: 16, id: 'r16', title: 'Sub-state & District Mapping', category: 'Operations', desc: 'Planned scope: regional geographic clusters and market coverage.' },
    { num: 17, id: 'r17', title: 'Week 1/2/3 Intra-Month Slices', category: 'Operations', desc: 'Planned scope: volume by month segment; cash-flow data is not available.' },
    { num: 18, id: 'r18', title: 'Weekend vs Weekday Dynamics', category: 'Operations', desc: 'Planned scope: compare historical sales by weekday and weekend; no uplift assumption is applied.' },
    { num: 19, id: 'r19', title: 'Quarterly Analysis (Q1-Q4)', category: 'Executive', desc: 'Planned scope: quarterly sales volume and collection trends.' },
    { num: 20, id: 'r20', title: 'Monthly Network Expansion', category: 'Executive', desc: 'Active station count expansion and historical throughput growth.' },
    { num: 21, id: 'r21', title: 'Station Operating Models', category: 'Operations', desc: 'Interactive volume and collection breakdown by station operating type.', directTab: 'types' },
    { num: 22, id: 'r22', title: 'Competitor Proximity Audit', category: 'Operations', desc: 'Planned scope: station performance near competitors; competitor location and pricing data is not available.' },
    { num: 23, id: 'r23', title: 'AIML 7-Day Sales Forecast', category: 'Forecasting', desc: 'Ensemble prediction combining Holt-Winters, Linear Regression, and MAPE bounds.', directTab: 'forecast' },
    { num: 24, id: 'r24', title: 'Data Analysis & What-If Simulator', category: 'Forecasting', desc: 'Interactive scenario estimates; they are not actual financial outcomes or realized margin calculations.', directTab: 'whatif' },
    { num: 25, id: 'r25', title: 'Station Performance Heatmap', category: 'Diagnostics', desc: 'Interactive heatmap for latest-day station sales distribution.', directTab: 'heatmap' },
    { num: 26, id: 'r26', title: 'Collection Realization & Gap', category: 'Collections & Realization', desc: 'Interactive station/state comparison of rate realization and estimated per-litre collection gaps—not margin or profit.', directTab: 'rsp' },
    { num: 27, id: 'r27', title: 'Station Ranking & Momentum', category: 'Operations', desc: 'Planned scope: sales ranking with historical trend direction.' },
    { num: 28, id: 'r28', title: 'Daily Morning Briefing', category: 'Executive', desc: '30-second automated briefing with 1-click formatted copy for WhatsApp & Email.', directTab: 'briefing' },
    { num: 29, id: 'r29', title: 'Data Health & Quality Audit', category: 'Diagnostics', desc: 'Planned scope: sales-row validation and assignment completeness; use database diagnostics for connection/data status.' },
    { num: 30, id: 'r30', title: 'Zero-Sale & Exception Registry', category: 'Diagnostics', desc: 'Planned scope: a persistent exception register; current zero-sale stations appear in the briefing and station directory.' },
    { num: 31, id: 'r31', title: 'Closing Dip & Stockout Alerts', category: 'Operations', desc: 'Planned scope: stock-cover alerts; current replenishment details are available in the dispatch view.' },
    { num: 32, id: 'r32', title: 'Tanker Replenishment Dispatch Generator', category: 'Operations', desc: 'Automated 12T/18T AutoLPG tanker dispatch allocation and manifest exporter.', directTab: 'dispatch' },
  ];

  const categories = ['ALL', 'Executive', 'Operations', 'Collections & Realization', 'Forecasting', 'Diagnostics'];

  const filteredReports = reports.filter((r) => {
    const matchCat = selectedCategory === 'ALL' || r.category === selectedCategory;
    const matchSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `report ${r.num}`.includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const selectedReport = reports.find((r) => r.num === selectedReportNum);
  const openReport = (report: ReportMeta) => {
    const tab = report.directTab;
    if (tab) onSelectTab(tab);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                GO Gas Report Catalog
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {reports.filter((report) => report.directTab).length} interactive views; {reports.filter((report) => !report.directTab).length} planned report specifications.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-70">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by report name, number, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-2">Category Filter:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-orange-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map((r) => (
          <div
            key={r.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-orange-300 dark:hover:border-slate-700 rounded-xl p-4 shadow-xs flex flex-col justify-between transition-all group"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-500/20">
                {r.directTab ? 'Interactive view' : 'Planned specification'}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {r.category}
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors mb-1">
                {r.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {r.directTab ? r.desc : `Not yet implemented. Planned scope: ${r.desc.replace(/^Planned scope:\s*/i, '')}`}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              {r.directTab ? (
                <button
                  onClick={() => openReport(r)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <span>Open interactive view</span>
                  <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                </button>
              ) : (
                <button
                  onClick={() => setSelectedReportNum(r.num)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <span>View planned scope</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Report Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-2.5 py-1 rounded border border-orange-200 dark:border-orange-500/20">
                Report #{selectedReport.num} • Planned specification
              </span>
              <button
                onClick={() => setSelectedReportNum(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {selectedReport.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Not yet implemented. Planned scope: {selectedReport.desc.replace(/^Planned scope:\s*/i, '')}
            </p>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2 mb-5">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                Status:
              </div>
              <div className="font-mono text-[11px] text-orange-600 dark:text-orange-400">
                Not implemented as a live report. Latest telemetry date: {data.date}.
              </div>
              <div>Current sales and collection totals are not report-specific results.</div>
            </div>

            <button
              onClick={() => setSelectedReportNum(null)}
              className="w-full py-2 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
