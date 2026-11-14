import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Sparkles,
  Sliders,
  DollarSign,
  MapPin,
  Fuel,
  Users,
  Layers,
  Grid,
  Target,
  Database,
  Search,
  Activity,
  ListTree,
  Truck,
} from 'lucide-react';

export type ReportTab =
  | 'master'
  | 'briefing'
  | 'dispatch'
  | 'forecast'
  | 'whatif'
  | 'analysis'
  | 'rsp'
  | 'free_sale_leakage'
  | 'churn_ai'
  | 'states'
  | 'stations'
  | 'team'
  | 'types'
  | 'heatmap'
  | 'targets'
  | 'adhoc'
  | 'all_reports';

interface NavigationProps {
  activeTab: ReportTab;
  onChangeTab: (tab: ReportTab) => void;
  zeroSaleCount?: number;
  stockoutCount?: number;
}

interface NavItem {
  id: ReportTab;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  category: 'Executive' | 'Forecasting & Simulation' | 'Operations' | 'Analytics';
  badge?: string;
  badgeColor?: string;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onChangeTab,
  zeroSaleCount = 0,
  stockoutCount = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const items: NavItem[] = [
    {
      id: 'master',
      label: 'Master Dashboard',
      shortLabel: 'Overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
      category: 'Executive',
    },
    {
      id: 'briefing',
      label: 'Morning Briefing',
      shortLabel: 'Briefing',
      icon: <FileText className="w-4 h-4" />,
      category: 'Executive',
      badge: 'WhatsApp/Email',
      badgeColor: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30',
    },
    {
      id: 'dispatch',
      label: 'Report 32: Tanker Dispatch',
      shortLabel: 'Tanker Dispatch',
      icon: <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      category: 'Operations',
      badge: stockoutCount > 0 ? `${stockoutCount} Urgent` : 'Supply Chain',
      badgeColor: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30',
    },
    {
      id: 'forecast',
      label: 'AIML 7-Day Forecast',
      shortLabel: 'Forecast',
      icon: <Sparkles className="w-4 h-4" />,
      category: 'Forecasting & Simulation',
      badge: 'Backtested',
      badgeColor: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-500/30',
    },
    {
      id: 'whatif',
      label: 'What-If Simulator',
      shortLabel: 'Simulator',
      icon: <Sliders className="w-4 h-4" />,
      category: 'Forecasting & Simulation',
    },
    {
      id: 'analysis',
      label: 'Report 24: Deep Stats',
      shortLabel: 'Statistics',
      icon: <Activity className="w-4 h-4" />,
      category: 'Analytics',
      badge: 'Tukey IQR',
      badgeColor: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30',
    },
    {
      id: 'rsp',
      label: 'RSP & Collection Gap',
      shortLabel: 'RSP & Gaps',
      icon: <DollarSign className="w-4 h-4" />,
      category: 'Analytics',
    },
    {
      id: 'states',
      label: 'State MIS Performance',
      shortLabel: 'States',
      icon: <MapPin className="w-4 h-4" />,
      category: 'Operations',
    },
    {
      id: 'stations',
      label: 'Station Directory & Dips',
      shortLabel: 'Stations',
      icon: <Fuel className="w-4 h-4" />,
      category: 'Operations',
      badge: stockoutCount > 0 ? `${stockoutCount} Risk` : undefined,
      badgeColor: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/30',
    },
    {
      id: 'team',
      label: 'TM & Coordinator Leaders',
      shortLabel: 'Team',
      icon: <Users className="w-4 h-4" />,
      category: 'Operations',
    },
    {
      id: 'types',
      label: 'Operating Models (LOCO/DODO)',
      shortLabel: 'Types',
      icon: <Layers className="w-4 h-4" />,
      category: 'Analytics',
    },
    {
      id: 'heatmap',
      label: 'Sales Intensity Heatmap',
      shortLabel: 'Heatmap',
      icon: <Grid className="w-4 h-4" />,
      category: 'Analytics',
    },
    {
      id: 'targets',
      label: 'Sales Benchmarks',
      shortLabel: 'Benchmarks',
      icon: <Target className="w-4 h-4" />,
      category: 'Operations',
    },
    {
      id: 'adhoc',
      label: 'Ad-hoc Data Explorer',
      shortLabel: 'Explorer',
      icon: <Database className="w-4 h-4" />,
      category: 'Analytics',
    },
    {
      id: 'all_reports',
      label: 'Report Catalog',
      shortLabel: 'Catalog',
      icon: <ListTree className="w-4 h-4 text-orange-500" />,
      category: 'Executive',
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <nav className="bg-white/90 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 sticky top-16.25 z-30 transition-colors">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Horizontal scrollable tab buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 lg:pb-0 scrollbar-none">
          {filteredItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-500/30 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                      item.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Report Finder Search */}
        <div className="relative min-w-50 max-w-65 self-end lg:self-center hidden sm:block">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search report module..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>
    </nav>
  );
};
