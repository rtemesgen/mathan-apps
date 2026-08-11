import { FormEvent, useState } from 'react';
import { ChevronDown, ChevronRight, Save, Trash2, X } from 'lucide-react';
import { Employee, SalaryChange } from '../types';
import { formatCurrency, formatDate } from '../utils/calc';
import { DeleteConfirmModal } from '../../../components/DeleteConfirmModal';

interface ManageEmployeesViewProps {
  employees: Employee[];
  onSaveEmployee: (employee: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
}

function createRaise(): SalaryChange {
  return { id: `raise-${Date.now()}`, effectiveDate: new Date().toISOString().slice(0, 10), newMonthlySalary: 0, reason: '', createdAt: new Date().toISOString() };
}

function normalizedEmployee(employee: Employee): Employee {
  return { ...employee, initialSalary: Number(employee.initialSalary) || 0, salaryHistory: (employee.salaryHistory ?? []).map((raise) => ({ ...raise, newMonthlySalary: Number(raise.newMonthlySalary) || 0 })) };
}

export function ManageEmployeesView({ employees, onSaveEmployee, onDeleteEmployee }: ManageEmployeesViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Employee | null>(null);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openEmployee = (employee: Employee) => { setExpandedId(employee.id); setDraft(normalizedEmployee(employee)); setMessage(''); };
  const closeEditor = () => { setExpandedId(null); setDraft(null); setMessage(''); setConfirmDelete(false); };
  const updateDraft = <K extends keyof Employee>(field: K, value: Employee[K]) => setDraft((current) => current ? { ...current, [field]: value } : current);
  const updateRaise = (raiseId: string, field: keyof SalaryChange, value: string) => setDraft((current) => current ? { ...current, salaryHistory: current.salaryHistory.map((raise) => raise.id === raiseId ? { ...raise, [field]: field === 'newMonthlySalary' ? Number(value) || 0 : value } : raise) } : current);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.name.trim() || !draft.startDate || draft.initialSalary < 0) return;
    if (draft.status === 'terminated' && !draft.terminationDate) { setMessage('Enter the termination date so salary stops correctly.'); return; }
    if (draft.status === 'on_leave' && (!draft.leaveStartDate || !draft.leaveEndDate)) { setMessage('Enter both the leave start date and return date.'); return; }
    if (draft.status === 'on_leave' && draft.leaveEndDate! < draft.leaveStartDate!) { setMessage('The return date must be on or after the leave start date.'); return; }
    if (draft.salaryHistory.some((raise) => !raise.effectiveDate || raise.newMonthlySalary < 0 || !raise.reason.trim())) { setMessage('Complete every raise date, salary, and reason before saving.'); return; }
    onSaveEmployee({ ...draft, name: draft.name.trim(), initialSalary: Number(draft.initialSalary) || 0, salaryHistory: [...draft.salaryHistory].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)) });
    closeEditor();
  };

  const deleteEmployee = () => {
    if (!draft) return;
    setConfirmDelete(true);
  };

  return <section className="space-y-3">
    {employees.length === 0 && <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">No employees to manage yet. Add an employee from the navigation.</div>}
    <div className="space-y-2">{[...employees].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((employee) => {
      const expanded = expandedId === employee.id;
      const currentSalary = employee.salaryHistory?.length ? [...employee.salaryHistory].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0].newMonthlySalary : employee.initialSalary;
      return <div key={employee.id} className="overflow-hidden rounded-xl border border-[#e8e6dc] bg-white shadow-2xs">
        <button onClick={() => expanded ? closeEditor() : openEmployee(employee)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#faf9f5]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f0e6] text-xs font-bold text-zinc-700">{employee.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-zinc-900">{employee.name}</span><span className="block text-[11px] text-zinc-500">Started {formatDate(employee.startDate)} · Current {formatCurrency(Number(currentSalary) || 0)}</span></span><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider ${employee.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{employee.status.replace('_', ' ')}</span>{expanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}</button>
        {expanded && draft && <form onSubmit={save} className="border-t border-[#e8e6dc] bg-[#fbfaf6] p-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-zinc-600">Full name<input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-zinc-600">Status<select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as Employee['status'])} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal"><option value="active">Active</option><option value="on_leave">On leave</option><option value="terminated">Terminated</option></select></label><label className="text-xs font-bold text-zinc-600">Starting date<input required type="date" value={draft.startDate} onChange={(event) => updateDraft('startDate', event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-zinc-600">Base monthly salary<input required min="0" step="1" type="number" placeholder="Enter amount" value={draft.initialSalary} onChange={(event) => updateDraft('initialSalary', Number(event.target.value) || 0)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal" /></label>
            {draft.status === 'terminated' && <label className="text-xs font-bold text-red-700">Termination date<input required type="date" value={draft.terminationDate ?? ''} onChange={(event) => updateDraft('terminationDate', event.target.value)} className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-normal" /><span className="mt-1 block text-[10px] font-normal text-zinc-500">Salary is earned through this date only.</span></label>}
            {draft.status === 'on_leave' && <><label className="text-xs font-bold text-amber-800">Leave start date<input required type="date" value={draft.leaveStartDate ?? ''} onChange={(event) => updateDraft('leaveStartDate', event.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-emerald-800">Return date<input required type="date" value={draft.leaveEndDate ?? ''} onChange={(event) => updateDraft('leaveEndDate', event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-normal" /></label></>}
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-3"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-zinc-900">Raises and raise dates</h3><p className="text-[11px] text-zinc-500">Edit the salary that begins on each effective date.</p></div><button type="button" onClick={() => setDraft((current) => current ? { ...current, salaryHistory: [...current.salaryHistory, createRaise()] } : current)} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Add raise</button></div><div className="mt-2 space-y-2">{draft.salaryHistory.length === 0 && <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-500">No raises recorded.</p>}{draft.salaryHistory.map((raise) => <div key={raise.id} className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 sm:grid-cols-[150px_150px_1fr_auto]"><input required type="date" value={raise.effectiveDate} onChange={(event) => updateRaise(raise.id, 'effectiveDate', event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs" /><input required min="0" step="1" type="number" value={raise.newMonthlySalary} onChange={(event) => updateRaise(raise.id, 'newMonthlySalary', event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs" placeholder="Monthly salary" /><input required value={raise.reason} onChange={(event) => updateRaise(raise.id, 'reason', event.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs" placeholder="Reason" /><button type="button" aria-label="Remove raise" onClick={() => setDraft((current) => current ? { ...current, salaryHistory: current.salaryHistory.filter((item) => item.id !== raise.id) } : current)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button></div>)}</div></div>
          {message && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">{message}</p>}<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3"><button type="button" onClick={deleteEmployee} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete employee</button><button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white"><Save className="h-3.5 w-3.5" /> Save changes</button></div>
          <DeleteConfirmModal isOpen={confirmDelete && !!draft} title="Delete employee?" message={draft ? <>Are you sure you want to delete <strong className="text-[#121212]">{draft.name}</strong>? This also removes the employee’s payroll transactions.</> : ''} onClose={() => setConfirmDelete(false)} onConfirm={() => { if (draft) onDeleteEmployee(draft.id); closeEditor(); }} confirmLabel="Delete employee" />
        </form>}
      </div>;
    })}</div>
  </section>;
}
