import React, { useState, useMemo } from 'react';
import { Fuel, Search, ArrowUpDown, Download, AlertTriangle, ShieldCheck, Filter } from 'lucide-react';
import { StationRecord } from '../types';

interface StationDirectoryProps {
  stations: StationRecord[];
  isCompact?: boolean;
}

export const StationDirectory: React.FC<StationDirectoryProps> = ({ stations, isCompact = false }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof StationRecord>('sale_qty');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterZeroOnly, setFilterZeroOnly] = useState(false);
  const [filterStockoutOnly, setFilterStockoutOnly] = useState(false);

  const filtered = useMemo(() => {
    return stations.filter((s) => {
      const matchSearch =
        s.erp_code.toLowerCase().includes(search.toLowerCase()) ||
        s.alds_name.toLowerCase().includes(search.toLowerCase()) ||
        s.state.toLowerCase().includes(search.toLowerCase()) ||
        s.tm.toLowerCase().includes(search.toLowerCase()) ||
        s.coordinator.toLowerCase().includes(search.toLowerCase()) ||
        (s.remark || '').toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;
      if (filterZeroOnly && s.sale_qty > 0) return false;
      if (filterStockoutOnly && (s.days_left >= 3.0 || s.sale_qty === 0)) return false;

      return true;
    });
  }, [stations, search, filterZeroOnly, filterStockoutOnly]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortOrder]);

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: keyof StationRecord) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const exportCurrentViewCSV = () => {
    const headers = [
      'Cost Code',
      'ALDS Name',
      'State',
      'Type',
      'TM',
      'Coordinator',
      'Sale Qty (L)',
      'Collection (Rs)',
      'RSP (Rs)',
      'Effective RSP (Rs)',
      'Closing Dip (L)',
      'Days Left',
      'Remark',
    ];
    const rows = sorted.map((s) => [
      `"${s.erp_code}"`,
      `"${s.alds_name.replace(/"/g, '""')}"`,
      `"${s.state}"`,
      `"${s.type}"`,
      `"${s.tm}"`,
      `"${s.coordinator}"`,
      s.sale_qty,
      s.net_total_collection,
      s.new_rate,
      s.effective_rsp,
      s.closing_dip_in_ltr,
      s.days_left,
      `"${(s.remark || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Station_Directory_Filtered.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs transition-colors">
        {/* Search & Fast Toggles */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, station name, remark..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>

          <button
            onClick={() => {
              setFilterZeroOnly(!filterZeroOnly);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
              filterZeroOnly
                ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Zero Sales Only
          </button>

          <button
            onClick={() => {
              setFilterStockoutOnly(!filterStockoutOnly);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
              filterStockoutOnly
                ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Stockout Risk (&lt;3d)
          </button>
        </div>

        {/* Right side: Count & Export */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <span className="text-slate-500 dark:text-slate-400">
            Found <span className="font-mono font-bold text-slate-900 dark:text-white">{sorted.length}</span> stations
          </span>

          <button
            onClick={exportCurrentViewCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Export View</span>
          </button>
        </div>
      </div>

      {/* Stations Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 select-none">
              <tr>
                <th
                  onClick={() => toggleSort('erp_code')}
                  className={`px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  <div className="flex items-center gap-1">
                    <span>Cost Code</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('alds_name')}
                  className={`px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  <div className="flex items-center gap-1">
                    <span>ALDS Station Name</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('state')}
                  className={`px-2 cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  State
                </th>
                <th
                  onClick={() => toggleSort('type')}
                  className={`px-2 cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  Type
                </th>
                <th
                  onClick={() => toggleSort('tm')}
                  className={`px-3 cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  TM / Coord
                </th>
                <th
                  onClick={() => toggleSort('sale_qty')}
                  className={`px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Sale Qty</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('net_total_collection')}
                  className={`px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  Collection (₹)
                </th>
                <th
                  onClick={() => toggleSort('effective_rsp')}
                  className={`px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  Eff RSP
                </th>
                <th
                  onClick={() => toggleSort('closing_dip_in_ltr')}
                  className={`px-3 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  Closing Dip
                </th>
                <th
                  onClick={() => toggleSort('days_left')}
                  className={`px-3 text-center cursor-pointer hover:text-slate-900 dark:hover:text-white ${isCompact ? 'py-2' : 'py-3'}`}
                >
                  Stock Left
                </th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'}`}>Remarks / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {paginated.map((st) => {
                const isZero = st.sale_qty === 0;
                const isStockout = st.days_left < 3.0 && !isZero;

                return (
                  <tr
                    key={st.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      isZero ? 'bg-amber-50/50 dark:bg-amber-950/10' : isStockout ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''
                    }`}
                  >
                    <td className={`px-3 font-bold text-orange-600 dark:text-orange-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {st.erp_code}
                    </td>
                    <td className={`px-3 font-sans font-semibold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {st.alds_name}
                    </td>
                    <td className={`px-2 font-sans text-slate-600 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {st.state}
                    </td>
                    <td className={`px-2 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {st.type}
                      </span>
                    </td>
                    <td className={`px-3 font-sans text-slate-600 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="truncate max-w-[130px] font-medium">{st.tm}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
                        {st.coordinator}
                      </div>
                    </td>
                    <td
                      className={`px-3 text-right font-bold text-sm ${isCompact ? 'py-1.5' : 'py-2.5'} ${
                        isZero ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {st.sale_qty.toLocaleString('en-IN')} L
                    </td>
                    <td className={`px-3 text-right text-emerald-600 dark:text-emerald-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      ₹{st.net_total_collection.toLocaleString('en-IN')}
                    </td>
                    <td className={`px-3 text-right text-slate-600 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      ₹{st.effective_rsp.toFixed(2)}
                    </td>
                    <td className={`px-3 text-right text-slate-600 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {st.closing_dip_in_ltr.toLocaleString('en-IN')} L
                    </td>
                    <td className={`px-3 text-center ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {isZero ? (
                        <span className="text-[10px] font-sans text-amber-600 dark:text-amber-400 font-semibold">Zero Sale</span>
                      ) : (
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                            st.days_left < 2.0
                              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                              : st.days_left < 3.0
                              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                              : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {st.days_left > 30 ? '>30d' : `${st.days_left}d`}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 font-sans text-slate-500 dark:text-slate-400 max-w-45 truncate ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {st.remark ? (
                        <span className="text-amber-600 dark:text-amber-300 italic">{st.remark}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-50 dark:bg-slate-950 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 transition-colors">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-slate-900 dark:text-slate-200 focus:outline-none"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>
              Page <span className="text-slate-900 dark:text-white font-mono">{page}</span> of{' '}
              <span className="text-slate-900 dark:text-white font-mono">{totalPages}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
