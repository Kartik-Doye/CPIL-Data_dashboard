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
import { ExecutiveTelemetry, StationRecord } from '../types';
import { formatINR, formatVolume, formatPercent, formatIndianNumber } from '../engine/formatting';

interface AllReportsDirectoryProps {
  data: ExecutiveTelemetry;
  stations: StationRecord[];
  onSelectTab: (tab: any) => void;
}

interface ReportMeta {
  num: number;
  id: string;
  title: string;
  category: 'Executive' | 'Operations' | 'Finance & Margins' | 'Forecasting' | 'Diagnostics';
  desc: string;
  directTab?: string;
}

export const AllReportsDirectory: React.FC<AllReportsDirectoryProps> = ({
  data,
  stations,
  onSelectTab,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportNum, setSelectedReportNum] = useState<number | null>(null);

  const reports: ReportMeta[] = [
    { num: 1, id: 'r1', title: 'Ad-hoc Data Explorer', category: 'Diagnostics', desc: 'Raw multi-dimensional explorer with flexible column selection and CSV export.', directTab: 'adhoc' },
    { num: 2, id: 'r2', title: 'Master Executive Dashboard', category: 'Executive', desc: '10-second snapshot for CMD/MD: KPIs, 30d trend, Top 5/Bottom 5, health score.', directTab: 'master' },
    { num: 3, id: 'r3', title: 'RSP & Pricing Realization', category: 'Finance & Margins', desc: 'Actual vs effective RSP by station/state, tracking discount & scheme leakage.', directTab: 'rsp' },
    { num: 4, id: 'r4', title: 'Day-over-Day Variance (DoD)', category: 'Operations', desc: 'Side-by-side station volume movement compared with previous operational day.' },
    { num: 5, id: 'r5', title: 'Daily Sales Trend & 7MA', category: 'Executive', desc: '30-day timeline chart with 7-day moving average and weekend pattern isolation.' },
    { num: 6, id: 'r6', title: 'Weekly Performance Analysis', category: 'Operations', desc: 'Sunday-Saturday and Monday-Sunday week cycles with week-on-week delta.' },
    { num: 7, id: 'r7', title: 'Month-on-Month Growth (MoM)', category: 'Executive', desc: 'Monthly total volume, collections, and network throughput comparisons.' },
    { num: 8, id: 'r8', title: 'CMD MIS State Summary', category: 'Executive', desc: 'One-page executive table formatted for CMD/MD review with state-level metrics.', directTab: 'states' },
    { num: 9, id: 'r9', title: 'Averages & Unit Margins', category: 'Finance & Margins', desc: 'Average litres per day and average per station normalized across regions.' },
    { num: 10, id: 'r10', title: 'Sales Analysis & Pareto Share', category: 'Operations', desc: 'Categorical breakdowns by State, Coordinator, TM, and Station Type.' },
    { num: 11, id: 'r11', title: 'Station-wise Detail Ledger', category: 'Operations', desc: 'Granular 316-station ledger with closing dip, sales, and collection stats.', directTab: 'stations' },
    { num: 12, id: 'r12', title: 'Dispenser & Pump Throughput', category: 'Operations', desc: 'Pump-level efficiency analysis and nozzle throughput diagnostics.' },
    { num: 13, id: 'r13', title: 'Team Performance (TM & Coord)', category: 'Operations', desc: 'Territory Manager and Coordinator volume leaderboards and target pacing.', directTab: 'team' },
    { num: 14, id: 'r14', title: 'Targets vs Actual Achievement', category: 'Operations', desc: 'Status bands: Achieved (≥100%), On Track (90-99%), At Risk (75-89%), Behind.', directTab: 'targets' },
    { num: 15, id: 'r15', title: 'Station Target Variance', category: 'Operations', desc: 'Station-by-station gap to daily 1,100 L operational benchmark.' },
    { num: 16, id: 'r16', title: 'Sub-state & District Mapping', category: 'Operations', desc: 'Regional geographic clusters and market penetration density.' },
    { num: 17, id: 'r17', title: 'Week 1/2/3 Intra-Month Slices', category: 'Finance & Margins', desc: 'Intra-month cash flow and volume front-loading vs back-loading pattern.' },
    { num: 18, id: 'r18', title: 'Weekend vs Weekday Dynamics', category: 'Operations', desc: 'Impact of Saturday/Sunday taxi and transit demand curve (+6% to +8%).' },
    { num: 19, id: 'r19', title: 'Quarterly Analysis (Q1-Q4)', category: 'Executive', desc: 'Financial year performance tracking (Q1 Apr-Jun to Q4 Jan-Mar).' },
    { num: 20, id: 'r20', title: 'Monthly Network Expansion', category: 'Executive', desc: 'Active station count expansion and historical throughput growth.' },
    { num: 21, id: 'r21', title: 'Five Station Types (LOCO/DODO)', category: 'Finance & Margins', desc: 'Business model margins: LOCO, DODO, JODO, COCO, and JOCO.', directTab: 'types' },
    { num: 22, id: 'r22', title: 'Competitor Proximity Audit', category: 'Operations', desc: 'Station performance and pricing dynamics near competing AutoLPG/CNG hubs.' },
    { num: 23, id: 'r23', title: 'AIML 7-Day Sales Forecast', category: 'Forecasting', desc: 'Ensemble prediction combining Holt-Winters, Linear Regression, and MAPE bounds.', directTab: 'forecast' },
    { num: 24, id: 'r24', title: 'Data Analysis & What-If Simulator', category: 'Forecasting', desc: 'Interactive financial impact modeling and Tukey statistical outlier detection.', directTab: 'whatif' },
    { num: 25, id: 'r25', title: 'Station Performance Heatmap', category: 'Diagnostics', desc: 'Color intensity grid (Station × Day) flagging chronic red-flag stations.', directTab: 'heatmap' },
    { num: 26, id: 'r26', title: 'Collection Efficiency & Risk Map', category: 'Finance & Margins', desc: 'Realized collections by state and total monetary Revenue at Risk.', directTab: 'rsp' },
    { num: 27, id: 'r27', title: 'Station Ranking & Momentum', category: 'Operations', desc: 'Leaderboard ranked by total sales with trend direction (↑ Improving, ↓ Declining).' },
    { num: 28, id: 'r28', title: 'Daily Morning Briefing', category: 'Executive', desc: '30-second automated briefing with 1-click formatted copy for WhatsApp & Email.', directTab: 'briefing' },
    { num: 29, id: 'r29', title: 'Data Health & Quality Audit', category: 'Diagnostics', desc: 'Row count validation, missing Cost Codes, duplicate checks, and TM assignments.' },
    { num: 30, id: 'r30', title: 'Zero-Sale & Exception Registry', category: 'Diagnostics', desc: 'Complete breakdown of all offline stations with explicit remarks and coordinator.' },
    { num: 31, id: 'r31', title: 'Closing Dip & Stockout Alerts', category: 'Operations', desc: 'Tanker replenishment dispatch schedule for stations with <3 days fuel buffer.' },
    { num: 32, id: 'r32', title: 'Tanker Replenishment Dispatch Generator', category: 'Operations', desc: 'Automated 12T/18T AutoLPG tanker dispatch allocation and manifest exporter.', directTab: 'dispatch' },
  ];

  const categories = ['ALL', 'Executive', 'Operations', 'Finance & Margins', 'Forecasting', 'Diagnostics'];

  const filteredReports = reports.filter((r) => {
    const matchCat = selectedCategory === 'ALL' || r.category === selectedCategory;
    const matchSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `report ${r.num}`.includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const selectedReport = reports.find((r) => r.num === selectedReportNum);

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
                GO Gas 32-Report Master Analytical Catalog
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Complete index of all 32 operational, financial, temporal, predictive, and diagnostic reports specified in the analytical PRD.
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
                  Report #{r.num}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {r.category}
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors mb-1">
                {r.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {r.desc}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              {r.directTab ? (
                <button
                  onClick={() => onSelectTab(r.directTab)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <span>Open Interactive Report</span>
                  <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                </button>
              ) : (
                <button
                  onClick={() => setSelectedReportNum(r.num)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <span>Inspect Report Metrics</span>
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
                Report #{selectedReport.num} Specification
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
              {selectedReport.desc}
            </p>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-2 mb-5">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                Authoritative SQL View Mapping:
              </div>
              <div className="font-mono text-[11px] text-orange-600 dark:text-orange-400">
                SELECT * FROM v_daily WHERE sale_date = '{data.date}';
              </div>
              <div>Network Throughput: {formatVolume(data.total_sale_qty)} L</div>
              <div>Collections: {formatINR(data.total_collection)}</div>
            </div>

            <button
              onClick={() => setSelectedReportNum(null)}
              className="w-full py-2 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              Close Inspection Window
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
