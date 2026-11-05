import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

type SpreadsheetSource = string | Buffer;

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
  }
  if (typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return '';
}

export async function readSpreadsheetRows(source: SpreadsheetSource): Promise<Record<string, unknown>[]> {
  if (typeof source === 'string' && !source.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Unsupported spreadsheet format. Save the workbook as .xlsx and try again.');
  }

  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) {
    await workbook.xlsx.read(Readable.from([source]));
  } else {
    await workbook.xlsx.readFile(source);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Spreadsheet does not contain a worksheet.');
  }

  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    headerRow.getCell(index + 1).text.trim()
  );
  if (!headers.some(Boolean)) {
    throw new Error('Spreadsheet does not contain a header row.');
  }

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    for (let index = 0; index < headers.length; index += 1) {
      if (headers[index]) {
        values[headers[index]] = cellValue(row.getCell(index + 1).value);
      }
    }
    if (Object.values(values).some((value) => value !== '')) {
      rows.push(values);
    }
  });
  return rows;
}
