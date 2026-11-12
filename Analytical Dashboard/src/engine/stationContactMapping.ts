import type ExcelJS from 'exceljs';

export interface StationContactMapping {
  erpCode: string;
  stationName: string;
  state: string;
  region: string;
  tm: string;
}

export interface StationContactMappingImport {
  mappings: StationContactMapping[];
  skippedMissingTm: number;
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, '');
const normalizeValue = (value: string) => value.trim().replace(/\s+/g, ' ');

export function parseStationContactMappings(workbook: ExcelJS.Workbook): StationContactMappingImport {
  const sheet = workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() === 'contact');
  if (!sheet) throw new Error('Contact.xlsx must contain a worksheet named "contact".');

  const requiredHeaders = ['erpcode', 'stationname', 'state', 'region', 'tm'];
  let headerRow = 0;
  let columnByHeader = new Map<string, number>();

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber++) {
    const candidateColumns = new Map<string, number>();
    sheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      const header = normalizeHeader(String(cell.text ?? ''));
      if (header) candidateColumns.set(header, columnNumber);
    });
    if (requiredHeaders.every((header) => candidateColumns.has(header))) {
      headerRow = rowNumber;
      columnByHeader = candidateColumns;
      break;
    }
  }
  if (!headerRow) {
    throw new Error('Contact.xlsx "contact" sheet is missing the ERP Code, Station Name, State, Region, or TM header.');
  }

  const mappingsByCode = new Map<string, StationContactMapping>();
  let skippedMissingTm = 0;
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const getValue = (header: string) => normalizeValue(String(row.getCell(columnByHeader.get(header)!).text ?? ''));
    const erpCode = getValue('erpcode');
    const stationName = getValue('stationname');
    const state = getValue('state');
    const region = getValue('region');
    const tm = getValue('tm');
    if (![erpCode, stationName, state, region, tm].some(Boolean)) continue;
    if (!tm) {
      skippedMissingTm++;
      continue;
    }
    if (!erpCode || !stationName || !state || !region) {
      throw new Error(`Contact.xlsx "contact" sheet row ${rowNumber} has a TM but is missing a required mapping field.`);
    }

    const mapping = { erpCode, stationName, state, region, tm };
    const codeKey = erpCode.toUpperCase();
    const previous = mappingsByCode.get(codeKey);
    if (previous && (
      normalizeHeader(previous.stationName) !== normalizeHeader(stationName)
      || normalizeHeader(previous.state) !== normalizeHeader(state)
      || normalizeHeader(previous.region) !== normalizeHeader(region)
      || normalizeHeader(previous.tm) !== normalizeHeader(tm)
    )) {
      throw new Error(`Contact.xlsx contains conflicting non-empty mappings for ERP code on row ${rowNumber}.`);
    }
    mappingsByCode.set(codeKey, mapping);
  }

  if (mappingsByCode.size === 0) {
    throw new Error('Contact.xlsx did not contain any complete station mappings with a TM assigned.');
  }
  return { mappings: [...mappingsByCode.values()], skippedMissingTm };
}
