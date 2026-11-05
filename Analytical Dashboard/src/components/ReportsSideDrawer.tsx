import React, { useState } from 'react';
import {
  X,
  Search,
  LayoutDashboard,
  FileText,
  Truck,
  Sparkles,
  Sliders,
  Activity,
  DollarSign,
  MapPin,
  Fuel,
  Users,
  Layers,
  Grid,
  Target,
  Database,
  ListTree,
  ChevronRight,
  Flame,
  ShieldAlert,
  Percent,
  TrendingDown,
  UserCheck,
} from 'lucide-react';
import { ReportTab } from './Navigation';

interface ReportsSideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ReportTab;
  onChangeTab: (tab: ReportTab) => void;
  zeroSaleCount?: number;
  stockoutCount?: number;
}

interface DrawerCategory {
  title: string;
  items: {
    id: ReportTab;
    label: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
  }[];
}

export const ReportsSideDrawer: React.FC<ReportsSideDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onChangeTab,
  zeroSaleCount = 0,
  stockoutCount = 0,
}) => {
  const [search, setSearch] = useState('');

  const categories: DrawerCategory[] = [
    {
      title: 'Executive Suite',
      items: [
        {
          id: 'master',
          label: 'Master Executive Dashboard',
          description: 'Network-wide sales volume, revenue, effective RSP & 30-day run-rate',
          icon: <LayoutDashboard className="w-4 h-4 text-orange-500" />,
        },
        {
          id: 'briefing',
          label: 'Morning Executive Briefing',
          description: 'Structured 1-page summary ready for WhatsApp & Email broadcast',
          icon: <FileText className="w-4 h-4 text-blue-500" />,
          badge: 'Broadcast',
          badgeColor: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30',
        },
        {
          id: 'all_reports',
          label: 'Master 32 Reports Catalog',
          description: 'Comprehensive index of all 32 analytical slices and breakdown tables',
          icon: <ListTree className="w-4 h-4 text-amber-500" />,
          badge: 'Index',
        },
      ],
    },
    {
      title: 'Operations & Supply Chain',
      items: [
        {
          id: 'dispatch',
          label: 'Report 32: Tanker Dispatch',
          description: 'Automated 12T/18T AutoLPG truck scheduling & WhatsApp manifest copy',
          icon: <Truck className="w-4 h-4 text-emerald-500" />,
          badge: stockoutCount > 0 ? `${stockoutCount} Urgent` : 'Logistics',
          badgeColor: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30',
        },
        {
          id: 'stations',
          label: 'Station Directory & Dips',
          description: 'Master list of 316+ stations with closing tank dips & stockout days',
          icon: <Fuel className="w-4 h-4 text-cyan-500" />,
          badge: zeroSaleCount > 0 ? `${zeroSaleCount} Zero` : undefined,
          badgeColor: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30',
        },
        {
          id: 'states',
          label: 'State MIS Performance',
          description: 'Regional performance summary across MS, MH, AP, TG, KA, TN & North',
          icon: <MapPin className="w-4 h-4 text-red-500" />,
        },
        {
          id: 'team',
          label: 'TM & Coordinator Leaders',
          description: 'Territory Manager volume achievements, zero-sale recovery & efficiency',
          icon: <Users className="w-4 h-4 text-indigo-500" />,
        },
        {
          id: 'targets',
          label: 'Target Achievement Tracker',
          description: 'Monthly target tracking, pacing run-rates & deficit gap analysis',
          icon: <Target className="w-4 h-4 text-violet-500" />,
        },
      ],
    },
    {
      title: 'Forecasting & Simulation',
      items: [
        {
          id: 'forecast',
          label: 'AIML 7-Day Sales Forecast',
          description: 'Multi-model ensemble ML predictions (Linear, Holt-Winters, Naive)',
          icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
          badge: '10 ML Models',
          badgeColor: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30',
        },
        {
          id: 'whatif',
          label: 'What-If Revenue Simulator',
          description: 'Interactive scenario planner for Free Sale cuts & zero-sale recovery',
          icon: <Sliders className="w-4 h-4 text-teal-500" />,
        },
      ],
    },
    {
      title: 'Analytics & Financials',
      items: [
        {
          id: 'rsp',
          label: 'RSP & Collection Gap Audit',
          description: 'Nominal ERP rate vs effective collection rate per litre analysis',
          icon: <DollarSign className="w-4 h-4 text-emerald-500" />,
        },
        {
          id: 'analysis',
          label: 'Report 24: Deep Statistics',
          description: 'Tukey IQR outlier detection, skewness & Gini inequality metrics',
          icon: <Activity className="w-4 h-4 text-amber-500" />,
          badge: 'Tukey IQR',
        },
        {
          id: 'types',
          label: 'Operating Models (LOCO/DODO)',
          description: 'Volume and collection breakdown across LOCO, DODO, JOCO & COCO',
          icon: <Layers className="w-4 h-4 text-purple-500" />,
        },
        {
          id: 'heatmap',
          label: 'Sales Intensity Heatmap',
          description: 'Visual volume distribution grid across stations and regions',
          icon: <Grid className="w-4 h-4 text-rose-500" />,
        },
        {
          id: 'adhoc',
          label: 'Ad-hoc Data Explorer',
          description: 'Custom multi-column sorting, query filtering & dynamic data export',
          icon: <Database className="w-4 h-4 text-blue-500" />,
        },
      ],
    },
  ];

  if (!isOpen) return null;

  const handleSelect = (id: ReportTab) => {
    onChangeTab(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Panel */}
      <aside className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full z-10 transition-colors animate-in slide-in-from-left duration-250">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Reports Navigation Drawer</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">GO Gas Executive Suite MIS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Search Box */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {categories.map((cat) => {
            const filteredItems = cat.items.filter(
              (item) =>
                item.label.toLowerCase().includes(search.toLowerCase()) ||
                item.description.toLowerCase().includes(search.toLowerCase())
            );

            if (filteredItems.length === 0) return null;

            return (
              <div key={cat.title} className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  {cat.title}
                </div>
                <div className="space-y-1">
                  {filteredItems.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item.id)}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          isActive
                            ? 'bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30 text-slate-900 dark:text-white shadow-xs'
                            : 'bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 shrink-0">{item.icon}</div>
                          <div>
                            <div className="text-xs font-bold flex items-center gap-1.5">
                              <span>{item.label}</span>
                              {item.badge && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                                    item.badgeColor ||
                                    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 shrink-0 mt-1 ${isActive ? 'text-orange-500' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Drawer Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center text-xs text-slate-500 dark:text-slate-400">
          <span>GO Gas Executive Suite • 32 MIS Reports</span>
        </div>
      </aside>
    </div>
  );
};
