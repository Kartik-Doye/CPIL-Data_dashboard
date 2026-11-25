import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  Database,
  ShieldCheck,
} from 'lucide-react';
import { fmtQty, fmtCurrency } from '../engine/formatting';

interface SalesPreviewPayload {
  valid: boolean;
  fileName: string;
  saleDate: string;
  stationCount: number;
  activeStationCount: number;
  zeroSaleCount: number;
  totalSaleQty: number;
  totalCollection: number;
  totalPaytm: number;
  outlierStations: Array<{ erp_code: string; alds_name: string; sale_qty: number }>;
  existingDbCount: number;
  existingDbVolume: number;
  loaderConfigured: boolean;
  warnings: string[];
  sampleRows: Array<{
    erp_code: string;
    alds_name: string;
    state: string;
    sale_qty: number;
    collection: number;
  }>;
}

interface SalesUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (saleDate: string, message: string) => void;
}

export const SalesUploadModal: React.FC<SalesUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [fileName, setFileName] = useState('');
  const [base64Data, setBase64Data] = useState('');
  const [preview, setPreview] = useState<SalesPreviewPayload | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFileName('');
    setBase64Data('');
    setPreview(null);
    setReplaceExisting(false);
    setErrorMsg(null);
    setValidating(false);
    setIngesting(false);
  };

  const handleClose = () => {
    if (ingesting) return;
    resetState();
    onClose();
  };

  const processSelectedFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMsg('Please select a valid Excel (.xlsx) sales workbook.');
      return;
    }
    setErrorMsg(null);
    setPreview(null);
    setReplaceExisting(false);
    setFileName(file.name);
    setValidating(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resultStr = String(reader.result || '');
        setBase64Data(resultStr);
        const res = await fetch('/api/sales/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-go-gas-email-request': 'authorized-client',
          },
          body: JSON.stringify({ fileName: file.name, base64Data: resultStr }),
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || `Validation failed (HTTP ${res.status}).`);
        }
        setPreview(payload as SalesPreviewPayload);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setValidating(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Unable to read the selected Excel file.');
      setValidating(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCommitIngest = async () => {
    if (!preview || !base64Data) return;
    setIngesting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/sales/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-go-gas-email-request': 'authorized-client',
        },
        body: JSON.stringify({
          fileName,
          base64Data,
          replaceExisting,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || `Database load failed (HTTP ${res.status}).`);
      }
      const msg = payload.message || `Loaded ${payload.insertedRows} rows for ${payload.saleDate}.`;
      resetState();
      onClose();
      onUploadSuccess(payload.saleDate, msg);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                In-App Daily Sales Workbook Uploader (.xlsx)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dry-run schema, duplicate ERP &amp; outlier validation before transactional PostgreSQL commit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close sales uploader"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) processSelectedFile(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/20'
                : 'border-slate-300 dark:border-slate-700 hover:border-orange-400 bg-slate-50/60 dark:bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) processSelectedFile(selected);
                e.target.value = '';
              }}
            />
            <Upload className="w-7 h-7 mx-auto text-orange-500 mb-2" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {fileName ? `Selected: ${fileName}` : 'Drag & drop your daily sale.xlsx workbook here, or click to browse'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Validates Cost Code uniqueness, single operating date, numeric fields, and scheme discounts automatically.
            </p>
          </div>

          {validating && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <LoaderCircle className="w-4 h-4 animate-spin" />
              <span>Running dry-run validation &amp; checking PostgreSQL sale_tracker...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Validation / Upload Blocked</div>
                <div className="mt-0.5">{errorMsg}</div>
              </div>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Dry-Run Validation Passed — Operating Date: {preview.saleDate}</span>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                  {preview.stationCount} Stations Parsed
                </span>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Total Volume</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {fmtQty(preview.totalSaleQty)} L
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Net Collection</span>
                  <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {fmtCurrency(preview.totalCollection)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Active / Zero-Sale</span>
                  <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                    {preview.activeStationCount} / {preview.zeroSaleCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Digital Paytm</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {fmtCurrency(preview.totalPaytm)}
                  </span>
                </div>
              </div>

              {/* Warnings & Existing Date Check */}
              {preview.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-xs space-y-1.5">
                  <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Pre-Commit Advisories</span>
                  </div>
                  <ul className="list-disc list-inside text-amber-700 dark:text-amber-300/90 space-y-1 text-[11px]">
                    {preview.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                  {preview.existingDbCount > 0 && (
                    <label className="flex items-center gap-2 pt-2 mt-2 border-t border-amber-200/70 dark:border-amber-800/50 font-semibold text-amber-900 dark:text-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceExisting}
                        onChange={(e) => setReplaceExisting(e.target.checked)}
                        className="rounded border-amber-400"
                      />
                      <span>
                        Replace existing {preview.existingDbCount} PostgreSQL rows for {preview.saleDate} inside one atomic transaction
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Sample Top Stations */}
              {preview.sampleRows.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/70 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    Top 5 Parsed Station Records (Preview)
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {preview.sampleRows.map((r) => (
                        <tr key={r.erp_code}>
                          <td className="px-3 py-1.5 font-bold text-slate-900 dark:text-white">{r.erp_code}</td>
                          <td className="px-3 py-1.5 font-sans text-slate-700 dark:text-slate-300">{r.alds_name}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.state}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-indigo-600 dark:text-indigo-400">
                            {fmtQty(r.sale_qty)} L
                          </td>
                          <td className="px-3 py-1.5 text-right text-emerald-600 dark:text-emerald-400">
                            {fmtCurrency(r.collection)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!preview.loaderConfigured && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                  <code className="font-mono">BOT_LOADER_PASSWORD</code> is not configured in <code className="font-mono">.env</code>. Configure loader credentials to commit rows.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={ingesting}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommitIngest}
            disabled={
              !preview ||
              !preview.loaderConfigured ||
              ingesting ||
              (preview.existingDbCount > 0 && !replaceExisting)
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-500 disabled:bg-slate-400 dark:disabled:bg-slate-800 disabled:text-slate-200 dark:disabled:text-slate-500 text-white transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {ingesting ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            <span>
              {ingesting
                ? 'Committing to PostgreSQL...'
                : preview
                ? `Commit ${preview.stationCount} Rows (${preview.saleDate})`
                : 'Commit to PostgreSQL'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
