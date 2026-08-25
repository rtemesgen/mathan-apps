import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { emitToast } from '../lib/toast';
import { exportReport } from '../lib/exports/exportService';
import type { ExportBuildOptions, ExportContext, ExportDatePreset, ExportDetail, ExportFormat } from '../lib/exports/exportTypes';
import { getDatePresetRange, inferDatePreset } from '../lib/exports/datePresets';
import { AppSelect } from './AppSelect';

const formats: Array<{ id: ExportFormat; label: string }> = [
  { id: 'pdf', label: 'PDF' },
  { id: 'xlsx', label: 'Excel' },
  { id: 'csv', label: 'CSV' },
  { id: 'print', label: 'Print preview' },
];
const detailLabels: Record<ExportDetail, string> = {
  condensed: 'Condensed summary', detailed: 'Detailed report', full: 'Full transaction breakdown',
};
const datePresets: Array<{ value: ExportDatePreset; label: string }> = [
  { value: 'all', label: 'All dates' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom range' },
];

export function ExportDialog({ open, onClose, context }: { open: boolean; onClose: () => void; context: ExportContext | null }) {
  const [detail, setDetail] = useState<ExportDetail>('detailed');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [entityId, setEntityId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState<ExportDatePreset>('all');
  const [busy, setBusy] = useState(false);
  const details = context?.availableDetailLevels ?? ['condensed', 'detailed', 'full'];
  const allowedFormats = context?.availableFormats ?? formats.map((item) => item.id);
  const entities = context?.availableEntities ?? [];
  const owners = context?.availableOwners ?? [];

  useEffect(() => {
    if (!context || !open) return;
    setEntityId(context.activeFilters?.entityId ?? context.selectedEntity?.value ?? '');
    setOwnerId(context.activeFilters?.ownerId ?? '');
    setTransactionType(context.activeFilters?.transactionType ?? '');
    setCategory(context.activeFilters?.category ?? '');
    setStartDate(context.activeFilters?.startDate ?? '');
    setEndDate(context.activeFilters?.endDate ?? '');
    setDatePreset(inferDatePreset(context.activeFilters?.startDate, context.activeFilters?.endDate));
    setDetail(context.availableDetailLevels?.[0] ?? 'detailed');
    setFormat(context.availableFormats?.[0] ?? 'pdf');
  }, [context, open]);

  const selectedEntity = useMemo(() => entities.find((item) => item.value === entityId) ?? context?.selectedEntity, [entities, entityId, context]);
  const selectedOwner = useMemo(() => owners.find((item) => item.value === ownerId), [owners, ownerId]);
  const preview = useMemo(() => {
    if (!context) return null;
    const options: ExportBuildOptions = { ...context.activeFilters, detail, entityId: entityId || undefined, ownerId: ownerId || undefined, transactionType: transactionType || undefined, category: category || undefined, startDate: startDate || undefined, endDate: endDate || undefined };
    return context.report.build(options);
  }, [context, detail, entityId, ownerId, transactionType, category, startDate, endDate]);
  if (!open || !context) return null;

  const run = async () => {
    if (busy) return;
    if (startDate && endDate && startDate > endDate) {
      emitToast({ kind: 'message', message: 'Start date must be before end date.', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const options: ExportBuildOptions = { ...context.activeFilters, detail, entityId: entityId || undefined, ownerId: ownerId || undefined, transactionType: transactionType || undefined, category: category || undefined, startDate: startDate || undefined, endDate: endDate || undefined };
      const report = context.report.build(options);
      const expectedMarker = context.appName === 'Cash Book' ? 'cash book' : context.appName === 'Payroll' ? 'payroll' : context.appName === 'Truck Equity' ? 'truck' : '';
      if (expectedMarker && !report.title.toLowerCase().includes(expectedMarker)) throw new Error(`The ${context.appName} report context is invalid. Please close and reopen Export.`);
      const entityName = [selectedEntity?.label, selectedOwner?.label].filter(Boolean).join(' · ') || undefined;
      const dateValues = report.rows.flat().map((value) => String(value ?? '').match(/\b\d{4}-\d{2}-\d{2}/)?.[0]).filter((value): value is string => Boolean(value)).sort();
      const metadata = { companyName: context.companyName, entityName, startDate: options.startDate ?? report.dateRange?.startDate ?? dateValues[0], endDate: options.endDate ?? report.dateRange?.endDate ?? dateValues.at(-1) };
      const period = options.startDate || options.endDate ? `-${options.startDate ?? 'all'}-${options.endDate ?? 'current'}` : '';
      const filename = `${context.companyName}-${context.appName}-${context.reportName}${selectedEntity ? `-${selectedEntity.label}` : ''}${selectedOwner ? `-${selectedOwner.label}` : ''}${period}`;
      await exportReport({ ...report, metadata, filename }, format);
      emitToast({ kind: 'message', message: format === 'print' ? `${context.reportName} is ready to print.` : `${context.reportName} exported successfully.` });
      onClose();
    } catch (error) {
      emitToast({ kind: 'message', message: error instanceof Error ? error.message : 'Could not export this report.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const chooseDatePreset = (preset: ExportDatePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = getDatePresetRange(preset, new Date(endDate || startDate || new Date().toISOString().slice(0, 10)));
    setStartDate(range.startDate ?? '');
    setEndDate(range.endDate ?? '');
  };

  const showFilters = true;
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#e5dfd2] bg-[#f8f6f0] p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#3f4d34]">{context.companyName} · {context.appName}</p><h2 id="export-dialog-title" className="mt-1 font-serif text-2xl font-bold text-[#1c1d1f]">Export {context.reportName}</h2><p className="mt-1 text-xs text-[#787672]">This export is tied to the report currently on screen.</p></div><button type="button" aria-label="Close export dialog" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-zinc-500 hover:bg-white"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 space-y-5"><section><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Export options</label><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-[#787672]">Detail level<AppSelect value={detail} onChange={(value) => setDetail(value as ExportDetail)} options={details.map((value) => ({ value, label: detailLabels[value] }))} className="mt-1" /></label><label className="text-xs font-bold text-[#787672]">Format<AppSelect value={format} onChange={(value) => setFormat(value as ExportFormat)} options={formats.filter((item) => allowedFormats.includes(item.id)).map(({ id, label }) => ({ value: id, label }))} className="mt-1" /></label><label className="text-xs font-bold text-[#787672]">Date range<AppSelect value={datePreset} onChange={(value) => chooseDatePreset(value as ExportDatePreset)} options={datePresets} className="mt-1" /></label></div></section>
        {showFilters && <section><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Report filters</label><div className="grid gap-3 sm:grid-cols-2">{entities.length > 0 && <label className="text-xs font-bold text-[#787672]">Entity<AppSelect value={entityId} onChange={setEntityId} options={[{ value: '', label: 'All entities' }, ...entities]} className="mt-1" /></label>}{owners.length > 0 && <label className="text-xs font-bold text-[#787672]">Partner<AppSelect value={ownerId} onChange={setOwnerId} options={[{ value: '', label: 'All partners' }, ...owners]} className="mt-1" /></label>}{context.availableTransactionTypes?.length ? <label className="text-xs font-bold text-[#787672]">Transaction type<AppSelect value={transactionType} onChange={setTransactionType} options={context.availableTransactionTypes} className="mt-1" /></label> : null}{context.availableCategories?.length ? <label className="text-xs font-bold text-[#787672]">Category<AppSelect value={category} onChange={setCategory} options={[{ value: '', label: 'All categories' }, ...context.availableCategories]} className="mt-1" /></label> : null}</div>{datePreset === 'custom' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[#787672]">From<input aria-label="Start date" type="date" value={startDate} onChange={(event) => { setDatePreset('custom'); setStartDate(event.target.value); }} className="erp-control mt-1 block min-h-10 w-full px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-[#787672]">To<input aria-label="End date" type="date" value={endDate} onChange={(event) => { setDatePreset('custom'); setEndDate(event.target.value); }} className="erp-control mt-1 block min-h-10 w-full px-3 py-2 text-sm" /></label></div>}</section>}
        {preview && <section className="rounded-2xl border border-[#e5dfd2] bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Preview</p><h3 className="mt-1 text-sm font-bold text-[#1c1d1f]">{preview.title}</h3></div><span className="rounded-full bg-[#f1f5eb] px-2.5 py-1 text-[10px] font-extrabold text-[#3f4d34]">{preview.rows.length} rows</span></div>{preview.rows.length ? <div className="mt-3 overflow-x-auto rounded-xl border border-[#eee9df]"><table className="min-w-full text-left text-[11px]"><thead className="bg-[#f8f6f0] text-[10px] uppercase tracking-wide text-[#787672]"><tr>{preview.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 font-extrabold">{header}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 4).map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[#eee9df]">{row.map((value, columnIndex) => <td key={columnIndex} className="max-w-48 truncate whitespace-nowrap px-3 py-2 text-[#4a4843]">{String(value ?? '—')}</td>)}</tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl bg-[#f8f6f0] px-3 py-3 text-xs text-[#787672]">No records match these selections.</p>}{preview.rows.length > 4 && <p className="mt-2 text-[10px] text-[#787672]">Showing the first 4 rows. The export will include all {preview.rows.length} rows.</p>}</section>}
      </div><div className="mt-6 flex justify-end gap-2 border-t border-[#e5dfd2] pt-4"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#d8d0be] bg-white px-4 py-2.5 text-sm font-bold text-[#4a4843]">Cancel</button><button type="button" onClick={() => void run()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#1c1d1f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Export report'}</button></div>
    </section></div>;
}
