import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (msg: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.name.toLowerCase().endsWith('.xlsx')
      ) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please drop an Excel workbook (.xlsx)');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];

          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64Data,
              filename: file.name,
            }),
          });

          const json = await response.json();
          if (!response.ok) {
            throw new Error(json.error || 'Failed to process file');
          }

          onUploadSuccess(json.message || 'File loaded successfully!');
          onClose();
        } catch (err: any) {
          setError(err.message || 'Error uploading file');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read file from disk');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'Unexpected upload error');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Load Daily Sales Excel</h3>
            <p className="text-xs text-slate-400">
              Upload standard 28-column <code className="text-orange-400">sale.xlsx</code>
            </p>
          </div>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-orange-500 bg-orange-500/5'
              : file
              ? 'border-emerald-500/50 bg-emerald-950/20'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept=".xlsx"
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center gap-2">
            {file ? (
              <>
                <CheckCircle className="w-8 h-8 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300 font-mono">
                  {file.name}
                </span>
                <span className="text-[11px] text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB • Click to change
                </span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-slate-500 mb-1" />
                <span className="text-xs font-medium text-slate-200">
                  Drag & drop daily Excel here, or <span className="text-orange-400 underline">browse</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Supports .xlsx (28 columns with Cost Code)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer shadow-md shadow-orange-600/30"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing & Validating...</span>
              </>
            ) : (
              <span>Load & Parse File</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
