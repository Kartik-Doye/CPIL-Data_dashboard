import React from 'react';
import { Filter, X, Search, RotateCcw, Maximize2, Minimize2, Calendar } from 'lucide-react';
import { StateSummary, TMSummary, TypeSummary } from '../types';

export interface FilterState {
  state: string;
  type: string;
  tm: string;
  coordinator: string;
  search: string;
}

interface FilterBarProps {
  filters: FilterState;
  onChangeFilters: (newFilters: FilterState) => void;
  states: StateSummary[];
  types: TypeSummary[];
  tms: TMSummary[];
  coordinators?: string[];
  availableDates?: string[];
  selectedDate?: string;
  onChangeDate?: (date: string) => void;
  totalMatches: number;
  totalStations: number;
  isCompact: boolean;
  onToggleCompact: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChangeFilters,
  states,
  types,
  tms,
  coordinators = [],
  availableDates = [],
  selectedDate,
  onChangeDate,
  totalMatches,
  totalStations,
  isCompact,
  onToggleCompact,
}) => {
  const latestDate = availableDates[0];
  const isHistoricalDate = Boolean(selectedDate && latestDate && selectedDate !== latestDate);
  const isFiltered =
    filters.state !== 'ALL' ||
    filters.type !== 'ALL' ||
    filters.tm !== 'ALL' ||
    filters.coordinator !== 'ALL' ||
    filters.search.trim() !== '' ||
    isHistoricalDate;

  const handleReset = () => {
    onChangeFilters({
      state: 'ALL',
      type: 'ALL',
      tm: 'ALL',
      coordinator: 'ALL',
      search: '',
    });
    if (isHistoricalDate && latestDate && onChangeDate) {
      onChangeDate(latestDate);
    }
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 px-4 py-2.5 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-orange-500" />
            <span>Filters:</span>
          </div>

          {/* Operating Date Selector */}
          {availableDates.length > 0 && onChangeDate && (
            <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
              <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <select
                aria-label="Select operating date"
                value={selectedDate || availableDates[0]}
                onChange={(e) => onChangeDate(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
              >
                {availableDates.map((d, idx) => (
                  <option key={d} value={d} className="bg-white dark:bg-slate-900">
                    {d}{idx === 0 ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* State Dropdown */}
          <select
            aria-label="Filter by state"
            value={filters.state}
            onChange={(e) => onChangeFilters({ ...filters, state: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">All States ({states.length})</option>
            {states.map((s) => (
              <option key={s.state} value={s.state}>
                {s.state} ({s.stations} stns)
              </option>
            ))}
          </select>

          {/* Type Dropdown */}
          <select
            aria-label="Filter by operating model type"
            value={filters.type}
            onChange={(e) => onChangeFilters({ ...filters, type: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">All Types ({types.length})</option>
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.type} ({t.stations} stns)
              </option>
            ))}
          </select>

          {/* Coordinator Dropdown */}
          {coordinators.length > 0 && (
            <select
              aria-label="Filter by coordinator"
              value={filters.coordinator}
              onChange={(e) => onChangeFilters({ ...filters, coordinator: e.target.value })}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 cursor-pointer max-w-36 truncate"
            >
              <option value="ALL">All Coordinators ({coordinators.length})</option>
              {coordinators.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* TM Dropdown */}
          <select
            aria-label="Filter by Territory Manager"
            value={filters.tm}
            onChange={(e) => onChangeFilters({ ...filters, tm: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 cursor-pointer max-w-37.5 truncate"
          >
            <option value="ALL">All TMs ({tms.length})</option>
            {tms.map((t) => (
              <option key={t.tm} value={t.tm}>
                {t.tm} ({t.stations})
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code / station / TM / remark..."
              value={filters.search}
              onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-7 py-1 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500 w-45 sm:w-55"
            />
            {filters.search && (
              <button
                onClick={() => onChangeFilters({ ...filters, search: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Reset Filters */}
          {isFiltered && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Reset all filters and date selection"
            >
              <RotateCcw className="w-3 h-3 text-orange-500" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right side controls: Match count and Compact View Toggle */}
        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Showing <span className="font-mono font-semibold text-slate-900 dark:text-white">{totalMatches}</span> of{' '}
            <span className="font-mono text-slate-500 dark:text-slate-400">{totalStations}</span> stations
          </div>

          {/* High Density Compact View Toggle */}
          <button
            onClick={onToggleCompact}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${isCompact
                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            title="Toggle High Density Compact View for maximum row visibility"
          >
            {isCompact ? <Minimize2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>Compact View</span>
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {isHistoricalDate
          ? `Viewing historical operating date ${selectedDate}. Station tables, KPIs, and comparisons reflect ${selectedDate}.`
          : 'Filters narrow station-based views, state/TM summaries, and simulators dynamically.'}
      </p>
    </div>
  );
};
