import type { ExportDatePreset } from './exportTypes';

const pad = (value: number) => String(value).padStart(2, '0');
const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function getDatePresetRange(preset: ExportDatePreset, anchor = new Date()): { startDate?: string; endDate?: string } {
  if (preset === 'all' || preset === 'custom') return {};
  const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (preset === 'daily') {
    const value = formatDate(date);
    return { startDate: value, endDate: value };
  }
  if (preset === 'weekly') {
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(date);
    start.setDate(date.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }
  return {
    startDate: formatDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

export function inferDatePreset(startDate?: string, endDate?: string): ExportDatePreset {
  if (!startDate && !endDate) return 'all';
  return 'custom';
}
