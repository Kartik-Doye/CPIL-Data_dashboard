import React, { useState } from 'react';
import { Database, Download, Search } from 'lucide-react';
import { StationRecord } from '../types';
import { escapeCsvCell } from '../engine/formatting';

interface AdHocExplorerProps {
  stations: StationRecord[];
}

export const AdHocExplorer: React.FC<AdHocExplorerProps> = ({ stations }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Columns toggle
  const allColumns: { key: keyof StationRecord; label: string }[] = [
    { key: 'erp_code', label: 'Cost Code' },
    { key: 'alds_name', label: 'Station Name' },
    { key: 'state', label: 'State' },
    { key: 'type', label: 'Type' },
    { key: 'tm', label: 'TM' },
    { key: 'coordinator', label: 'Coordinator' },
    { key: 'sale_qty', label: 'Sale Qty (L)' },
    { key: 'net_total_collection', label: 'Collection (₹)' },
    { key: 'new_rate', label: 'New Rate (RSP)' },
    { key: 'effective_rsp', label: 'Effective RSP' },
    { key: 'closing_dip_in_ltr', label: 'Closing Dip (L)' },
    { key: 'days_left', label: 'Days Left' },
    { key: 'free_sale_litres', label: 'Free Sale (L)' },
    { key: 'paytm', label: 'Paytm (₹)' },
    { key: 'net_cash_collection', label: 'Cash (₹)' },
    { key: 'remark', label: 'Remark' },
  ];

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'erp_code',
    'alds_name',
    'state',
    'type',
    'tm',
    'sale_qty',
    'net_total_collection',
    'effective_rsp',
    'closing_dip_in_ltr',
    'remark',
  ]);

  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      if (visibleColumns.length > 2) {
        setVisibleColumns(visibleColumns.filter((c) => c !== key));
      }
    } else {
      setVisibleColumns([...visibleColumns, key]);
    }
  };

  const filtered = stations.filter((s) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.erp_code.toLowerCase().includes(q) ||
      s.alds_name.toLowerCase().includes(q) ||
      s.state.toLowerCase().includes(q) ||
      s.tm.toLowerCase().includes(q) ||
      s.coordinator.toLowerCase().includes(q) ||
      (s.remark || '').toLowerCase().includes(q)
    );
  });

  const exportFilteredCSV = () => {
    const activeCols = allColumns.filter((c) => visibleColumns.includes(c.key as string));
    const headerRow = activeCols.map((c) => escapeCsvCell(c.label)).join(',');
    const dataRows = filtered.map((s) =>
      activeCols
        .map((c) => {
          const val = (s as any)[c.key];
          return escapeCsvCell(val ?? '');
        })
        .join(',')
    );

    const csvContent = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AdHoc_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedRows = showAll ? filtered : filtered.slice(0, 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Ad-hoc Multi-Dimensional Raw Explorer</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Customize visible fields, drill down by custom criteria, and download instant CSV cuts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filtered.length > 100 && (
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium transition-colors cursor-pointer"
            >
              {showAll ? 'Show Top 100' : `Show All (${filtered.length})`}
            </button>
          )}
          <button
            onClick={exportFilteredCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Filtered Cut ({filtered.length})</span>
          </button>
        </div>
      </div>

      {/* Filter and Column Toggles */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-3 transition-colors">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-50">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search data fields..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1 text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>

          <span className="text-slate-500 dark:text-slate-400 font-medium">Visible Columns:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {allColumns.map((col) => {
              const isChecked = visibleColumns.includes(col.key as string);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key as string)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                    isChecked
                      ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Raw Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                {allColumns
                  .filter((c) => visibleColumns.includes(c.key as string))
                  .map((c) => (
                    <th key={c.key} className="py-2.5 px-3 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {displayedRows.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  {allColumns
                    .filter((c) => visibleColumns.includes(c.key as string))
                    .map((c) => {
                      const val = (st as any)[c.key];
                      const isNum = typeof val === 'number';
                      return (
                        <td
                          key={c.key}
                          className={`py-2 px-3 whitespace-nowrap ${
                            c.key === 'erp_code'
                              ? 'font-bold text-orange-600 dark:text-orange-400'
                              : c.key === 'alds_name'
                              ? 'font-sans font-semibold text-slate-900 dark:text-white'
                              : c.key === 'sale_qty'
                              ? 'text-right font-bold text-slate-900 dark:text-slate-100'
                              : c.key === 'net_total_collection'
                              ? 'text-right text-emerald-600 dark:text-emerald-400'
                              : isNum
                              ? 'text-right text-slate-700 dark:text-slate-300'
                              : 'font-sans text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {isNum ? val.toLocaleString('en-IN') : val || '—'}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
