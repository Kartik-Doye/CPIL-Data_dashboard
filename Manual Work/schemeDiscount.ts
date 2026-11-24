export function estimateSchemeDiscount(
  value: unknown,
  saleQty: number,
  saleRate: number,
  rowNumber: number
): number {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  if (typeof value === 'number') return value;

  const text = String(value).trim();
  if (text.toUpperCase() === 'NA') return 0;

  const numericText = Number(text.replace(/,/g, ''));
  if (Number.isFinite(numericText)) return numericText;

  const percentage = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentage) {
    return Number(((saleQty * saleRate * Number(percentage[1])) / 100).toFixed(2));
  }

  const currencyAmount = text.match(/(?:₹\s*|(?:RS\.?|INR)\s*)([\d,]+(?:\.\d+)?)/i);
  if (currencyAmount) {
    const amount = Number(currencyAmount[1].replace(/,/g, ''));
    return /(?:PER\s*(?:LITRE|LTR|L)|\/\s*L(?:ITRE|TR)?)/i.test(text)
      ? Number((amount * saleQty).toFixed(2))
      : amount;
  }

  throw new Error(
    `[FAILED] Row ${rowNumber}, column "SCHEME" (Scheme): could not estimate discount from "${text}".`
  );
}
