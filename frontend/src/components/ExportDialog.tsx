import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Printer, X } from 'lucide-react';
import { emitToast } from '../lib/toast';
import { exportReport } from '../lib/exports/exportService';
import type { ExportBuildOptions, ExportContext, ExportDetail, ExportFormat } from '../lib/exports/exportTypes';

const formats: Array<{ id: ExportFormat; label: string; icon: typeof FileDown }> = [
  { id: 'pdf', label: 'PDF', icon: FileDown },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet },
  { id: 'print', label: 'Print preview', icon: Printer },
];
const detailLabels: Record<ExportDetail, string> = {
  condensed: 'Condensed summary', detailed: 'Detailed report', full: 'Full transaction breakdown',
};

export function ExportDialog({ open, onClose, context }: { open: boolean; onClose: () => void; context: ExportContext | null }) {
  const [detail, setDetail] = useState<ExportDetail>('detailed');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [entityId, setEntityId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [transactionType, setTransactionType] = useState('');
  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
    setDetail(context.availableDetailLevels?.[0] ?? 'detailed');
    setFormat(context.availableFormats?.[0] ?? 'pdf');
  }, [context, open]);

  const selectedEntity = useMemo(() => entities.find((item) => item.value === entityId) ?? context?.selectedEntity, [entities, entityId, context]);
  const selectedOwner = useMemo(() => owners.find((item) => item.value === ownerId), [owners, ownerId]);
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
      const entityName = [selectedEntity?.label, selectedOwner?.label].filter(Boolean).join(' · ') || undefined;
      const metadata = { companyName: context.companyName, appName: context.appName, reportName: context.reportName, entityName, startDate: options.startDate, endDate: options.endDate, detailLabel: detailLabels[detail], generatedAt: new Date().toISOString() };
      const period = options.startDate || options.endDate ? `-${options.startDate ?? 'all'}-${options.endDate ?? 'current'}` : '';
      const filename = `${context.companyName}-${context.appName}-${context.reportName}${selectedEntity ? `-${selectedEntity.label}` : ''}${selectedOwner ? `-${selectedOwner.label}` : ''}${period}`;
      await exportReport({ ...report, metadata, filename }, format);
      emitToast({ kind: 'message', message: format === 'print' ? `${context.reportName} is ready to print.` : `${context.reportName} exported successfully.` });
      onClose();
    } catch (error) {
      emitToast({ kind: 'message', message: error instanceof Error ? error.message : 'Could not export this report.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const showFilters = entities.length > 0 || owners.length > 0 || context.activeFilters?.startDate !== undefined || context.activeFilters?.endDate !== undefined || !!context.availableTransactionTypes?.length || !!context.availableCategories?.length;
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#e5dfd2] bg-[#f8f6f0] p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#3f4d34]">{context.companyName} · {context.appName}</p><h2 id="export-dialog-title" className="mt-1 font-serif text-2xl font-bold text-[#1c1d1f]">Export {context.reportName}</h2><p className="mt-1 text-xs text-[#787672]">This export is tied to the report currently on screen.</p></div><button type="button" aria-label="Close export dialog" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-zinc-500 hover:bg-white"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 space-y-5"><section><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Detail level</label><div className="grid gap-2 sm:grid-cols-3">{details.map((item) => <button type="button" key={item} onClick={() => setDetail(item)} className={`rounded-xl border p-3 text-left ${detail === item ? 'border-[#3f4d34] bg-[#3f4d34] text-white' : 'border-[#e5dfd2] bg-white text-[#1c1d1f]'}`}><span className="block text-sm font-bold">{detailLabels[item]}</span></button>)}</div></section>
        <section><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Format</label><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{formats.filter((item) => allowedFormats.includes(item.id)).map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setFormat(item.id)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${format === item.id ? 'border-[#3f4d34] bg-[#3f4d34] text-white' : 'border-[#e5dfd2] bg-white text-[#1c1d1f]'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></section>
        {showFilters && <section><label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wider text-[#787672]">Filters</label><div className="grid gap-2 sm:grid-cols-4">{entities.length > 0 && <select value={entityId} onChange={(event) => setEntityId(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm"><option value="">All entities</option>{entities.map((entity) => <option key={entity.value} value={entity.value}>{entity.label}</option>)}</select>}{owners.length > 0 && <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm"><option value="">All partners</option>{owners.map((owner) => <option key={owner.value} value={owner.value}>{owner.label}</option>)}</select>}{context.availableTransactionTypes?.length ? <select value={transactionType} onChange={(event) => setTransactionType(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm">{context.availableTransactionTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : null}{context.availableCategories?.length ? <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm"><option value="">All categories</option>{context.availableCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : null}<input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm" /><input aria-label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-[#e5dfd2] bg-white px-3 py-2 text-sm" /></div></section>}
      </div><div className="mt-6 flex justify-end gap-2 border-t border-[#e5dfd2] pt-4"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#d8d0be] bg-white px-4 py-2.5 text-sm font-bold text-[#4a4843]">Cancel</button><button type="button" onClick={() => void run()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#1c1d1f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Export report'}</button></div>
    </section></div>;
}
