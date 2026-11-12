import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface FestivalEntry {
  date: string;
  name: string;
  note?: string;
}

interface FestivalCalendarFile {
  festivals: FestivalEntry[];
}

const calendarPath = fileURLToPath(new URL('../../../festival-calendar.json', import.meta.url));
const calendarFile = JSON.parse(readFileSync(calendarPath, 'utf8')) as FestivalCalendarFile;

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

if (!calendarFile || !Array.isArray(calendarFile.festivals)) {
  throw new Error(`Festival calendar must contain a festivals array: ${calendarPath}`);
}

const festivalsByDate = new Map<string, FestivalEntry>();
for (const festival of calendarFile.festivals) {
  if (
    !festival
    || typeof festival.date !== 'string'
    || !isValidDate(festival.date)
    || typeof festival.name !== 'string'
    || !festival.name.trim()
    || (festival.note !== undefined && typeof festival.note !== 'string')
  ) {
    throw new Error(`Festival calendar contains an invalid entry: ${calendarPath}`);
  }
  if (festivalsByDate.has(festival.date)) {
    throw new Error(`Festival calendar contains a duplicate date (${festival.date}): ${calendarPath}`);
  }
  festivalsByDate.set(festival.date, festival);
}

export function getFestivalEntry(date: Date): FestivalEntry | undefined {
  const dateKey = date.toISOString().slice(0, 10);
  return festivalsByDate.get(dateKey);
}

export function getFestivalName(date: Date): string | undefined {
  return getFestivalEntry(date)?.name;
}

export function isFestivalDate(date: Date): boolean {
  return getFestivalEntry(date) !== undefined;
}
