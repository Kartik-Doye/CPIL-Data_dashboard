/**
 * Pure TypeScript conversion of formatting.py
 * CPIL AutoLPG Executive Dashboard Formatter (PRD Phase 5).
 * 
 * Provides Indian Numbering System formatting (Lakhs & Crores),
 * currency symbols, tabular numeric alignment, and percentages.
 */

export function fmtQty(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const rounded = Math.round(val);
  return formatIndianNumber(rounded);
}

export function fmtCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  const rounded = Math.round(val);
  return '₹' + formatIndianNumber(rounded);
}

export function fmtLakhs(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '0.00 L';
  const lakhs = val / 100000;
  return lakhs.toFixed(decimals) + ' L';
}

export function fmtCrores(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '0.00 Cr';
  const crores = val / 10000000;
  return crores.toFixed(decimals) + ' Cr';
}

export function fmtCompactCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  const abs = Math.abs(val);
  if (abs >= 10000000) {
    return '₹' + (val / 10000000).toFixed(2) + ' Cr';
  }
  if (abs >= 100000) {
    return '₹' + (val / 100000).toFixed(2) + ' L';
  }
  return fmtCurrency(val);
}

export function fmtPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return val.toFixed(decimals) + '%';
}

export function fmtRSP(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '₹0.00';
  return '₹' + val.toFixed(2);
}

export function formatIndianNumber(x: number): string {
  const isNegative = x < 0;
  const numStr = Math.abs(x).toString();
  if (numStr.length <= 3) {
    return (isNegative ? '-' : '') + numStr;
  }
  const lastThree = numStr.substring(numStr.length - 3);
  const otherNumbers = numStr.substring(0, numStr.length - 3);
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  return (isNegative ? '-' : '') + formatted;
}

// Aliases for component ergonomics
export const formatINR = fmtCurrency;
export const formatVolume = fmtQty;
export const formatPercent = fmtPct;
