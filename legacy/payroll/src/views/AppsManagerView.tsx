import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  CheckCircle2,
  Building,
  Globe,
  Check,
  ArrowRight,
  ShieldCheck,
  Activity,
  ChevronRight,
  Layers,
  CreditCard,
  Clock,
  Briefcase
} from 'lucide-react';
import { SystemApp } from '../types';
import { ActiveTab } from '../components/Sidebar';

interface AppsManagerViewProps {
  currentAppId: string;
  onSelectApp: (appId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  customApps: SystemApp[];
  onCreateApp: (newApp: SystemApp) => void;
}

const DEFAULT_APPS: SystemApp[] = [
  {
    id: 'payroll',
    name: 'Mathan Payroll ERP',
    category: 'USD ECONOMY',
    description: 'Pro-rated daily accruals, backdated salary history, employee payment ledgers and disbursements.',
    iconName: 'Building',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    status: 'active',
    itemCount: '3 Staff Members',
    lastUsed: 'Currently Active',
  },
  {
    id: 'attendance',
    name: 'Attendance & Shifts',
    category: 'WORKFORCE MODULE',
    description: 'Daily check-in/out tracking, shift scheduling, overtime rules, and leave approval workflows.',
    iconName: 'Clock',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    status: 'installed',
    itemCount: '12 Active Shifts',
    lastUsed: 'Today',
  },
  {
    id: 'expenses',
    name: 'Petty Cash & Expense',
    category: 'FINANCE MODULE',
    description: 'Receipt scanning, vendor invoice approvals, petty cash balance tracking, and audit logs.',
    iconName: 'CreditCard',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    status: 'installed',
    itemCount: '8 Pending Claims',
    lastUsed: '2 days ago',
  },
];

export const AppsManagerView: React.FC<AppsManagerViewProps> = ({
  currentAppId,
  onSelectApp,
  onNavigateTab,
  customApps,
  onCreateApp,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppView, setSelectedAppView] = useState<SystemApp | null>(null);

  // Creation form states matching the screenshot
  const [appName, setAppName] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'UGX' | 'KES' | 'SSP'>('USD');
  const [appDescription, setAppDescription] = useState('');

  const allApps = [...DEFAULT_APPS, ...customApps];

  const handleLaunch = (app: SystemApp) => {
    onSelectApp(app.id);
    if (app.id === 'payroll') {
      onNavigateTab('dashboard');
    } else {
      setSelectedAppView(app);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;

    const newAppObj: SystemApp = {
      id: `app-${Date.now()}`,
      name: appName.trim(),
      category: `${currency} ECONOMY`,
      description: appDescription.trim() || `Enterprise module managed in ${currency} economy.`,
      iconName: 'Building',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
      status: 'active',
      itemCount: 'New App Profile',
      lastUsed: 'Initialized Just Now',
    };

    onCreateApp(newAppObj);
    setIsModalOpen(false);
    setAppName('');
    setAppDescription('');
    onSelectApp(newAppObj.id);
    setSelectedAppView(newAppObj);
  };

  // Active workspace view for non-payroll app
  if (selectedAppView && selectedAppView.id !== 'payroll') {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        {/* Navigation header bar */}
        <div className="bg-[#f6f5ef] border border-[#e8e6dc] p-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-zinc-900">
              Active Module: <span className="text-emerald-800 font-serif italic text-sm font-bold">{selectedAppView.name}</span>
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onSelectApp('payroll');
                onNavigateTab('dashboard');
              }}
              className="px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Switch to Payroll ERP
            </button>
            <button
              onClick={() => setSelectedAppView(null)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              ← Back to Apps Switcher
            </button>
          </div>
        </div>

        {/* Active App Profile Card */}
        <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-[#e8e6dc] shadow-xs relative overflow-hidden space-y-4">
          <Building className="w-32 h-32 text-zinc-100 absolute -right-4 -top-4 pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="p-3 bg-[#f6f5ef] border border-zinc-200/80 rounded-2xl w-12 h-12 flex items-center justify-center text-zinc-900 mb-3">
                <Building className="w-6 h-6" />
              </div>
              <h2 className="font-serif italic text-3xl font-bold text-zinc-900">{selectedAppView.name}</h2>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mt-1">
                <Globe className="w-3.5 h-3.5 text-zinc-400" /> {selectedAppView.category}
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wider rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Active Profile
            </span>
          </div>

          <p className="text-xs text-zinc-600 max-w-xl font-medium leading-relaxed">{selectedAppView.description}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-zinc-100">
            <div className="p-3 bg-[#f8f7f2] rounded-2xl border border-zinc-200/60">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 block">Status</span>
              <span className="text-xs font-bold text-emerald-700 mt-0.5 block">Operational & Active</span>
            </div>
            <div className="p-3 bg-[#f8f7f2] rounded-2xl border border-zinc-200/60">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 block">Core Tenant</span>
              <span className="text-xs font-bold text-zinc-800 mt-0.5 block">Mathan Enterprise</span>
            </div>
            <div className="p-3 bg-[#f8f7f2] rounded-2xl border border-zinc-200/60">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 block">Records</span>
              <span className="text-xs font-mono font-bold text-zinc-900 mt-0.5 block">{selectedAppView.itemCount}</span>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white p-5 rounded-[28px] border border-[#e8e6dc] shadow-xs space-y-3">
            <h3 className="font-serif-title text-base font-bold text-zinc-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-800" /> Quick Operations
            </h3>
            <div className="space-y-2 text-xs">
              <button
                onClick={() => alert(`Opening Record Entry for ${selectedAppView.name}`)}
                className="w-full text-left p-3 bg-[#f6f5ef] hover:bg-[#e8e6dc]/60 rounded-xl transition flex items-center justify-between font-bold text-zinc-800 cursor-pointer"
              >
                <span>+ Create New Module Record</span>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                onClick={() => alert(`Exporting audit log for ${selectedAppView.name}`)}
                className="w-full text-left p-3 bg-[#f6f5ef] hover:bg-[#e8e6dc]/60 rounded-xl transition flex items-center justify-between font-bold text-zinc-800 cursor-pointer"
              >
                <span>View Reports & Audit Log</span>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          <div className="bg-white p-5 rounded-[28px] border border-[#e8e6dc] shadow-xs space-y-3">
            <h3 className="font-serif-title text-base font-bold text-zinc-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-zinc-700" /> System Integration
            </h3>
            <div className="p-3 bg-[#f8f7f2] rounded-xl border border-zinc-200/60 text-xs space-y-1.5">
              <div className="flex justify-between text-zinc-600">
                <span>Database Sync:</span>
                <span className="font-mono font-bold text-emerald-800">Connected</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Tenant Isolation:</span>
                <span className="font-mono font-bold text-zinc-900">Encrypted</span>
              </div>
            </div>
            <button
              onClick={() => {
                onSelectApp('payroll');
                onNavigateTab('dashboard');
              }}
              className="w-full py-2.5 bg-[#54623e] hover:bg-[#435031] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              Return to Payroll ERP Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-2">
      {/* Header Intro */}
      <div className="text-center space-y-1">
        <h2 className="font-serif italic text-2xl sm:text-3xl font-bold text-zinc-900">Application Profiles</h2>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">
          SELECT AN ACTIVE APP MODULE OR INITIALIZE A NEW PROFILE
        </p>
      </div>

      {/* List of App Profile Cards (Matching Screenshot 1) */}
      <div className="space-y-4">
        {allApps.map((app) => {
          const isSelected = currentAppId === app.id;

          return (
            <div
              key={app.id}
              onClick={() => handleLaunch(app)}
              className={`bg-white rounded-[32px] p-6 sm:p-7 border shadow-xs transition-all relative overflow-hidden cursor-pointer group ${
                isSelected
                  ? 'border-emerald-700 ring-2 ring-emerald-700/20'
                  : 'border-[#e8e6dc] hover:border-zinc-400'
              }`}
            >
              {/* Background Watermark Icon */}
              <Building className="w-32 h-32 text-zinc-100 opacity-70 absolute right-4 top-2 pointer-events-none group-hover:text-zinc-200/80 transition" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="p-3 bg-[#f6f5ef] border border-zinc-200/80 rounded-2xl w-12 h-12 flex items-center justify-center text-zinc-800 shadow-2xs">
                    <Building className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="font-serif italic text-2xl sm:text-3xl font-bold text-zinc-900 group-hover:text-emerald-950 transition">
                      {app.name}
                    </h3>
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mt-1">
                      <Globe className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{app.category}</span>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  {isSelected ? (
                    <span className="px-3 py-1 bg-emerald-800 text-white text-[10px] font-extrabold uppercase tracking-widest rounded-full flex items-center gap-1 shadow-2xs">
                      <Check className="w-3 h-3" /> Active Profile
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-zinc-100 text-zinc-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-zinc-200 group-hover:bg-[#54623e] group-hover:text-white transition">
                      Launch App
                    </span>
                  )}
                  <span className="text-[10px] font-mono font-medium text-zinc-400">
                    {app.itemCount || 'App Module'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* "NEW APP PROFILE" Dashed Button Card (Matching Screenshot 1) */}
        <div
          onClick={() => setIsModalOpen(true)}
          className="border-2 border-dashed border-[#54623e]/40 hover:border-[#54623e] bg-white/50 hover:bg-white rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all shadow-xs group"
        >
          <div className="w-14 h-14 rounded-full border-2 border-[#54623e] text-[#54623e] flex items-center justify-center group-hover:bg-[#54623e] group-hover:text-white transition-all shadow-2xs">
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#54623e] mt-4">
            NEW APP PROFILE
          </span>
        </div>
      </div>

      {/* ESTABLISH APP MODAL (Matching Screenshot 2) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#f6f5ef] w-full max-w-md rounded-[36px] p-6 sm:p-8 border border-zinc-300 shadow-2xl relative text-center animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="space-y-1 mb-6">
              <h3 className="font-serif italic text-3xl font-bold text-zinc-900">Establish App</h3>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-zinc-400 block">
                NEW TENANT INITIALIZATION
              </span>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-5 text-left">
              {/* App / Business Legal Name Input */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">
                  APP LEGAL NAME
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jolly Payroll Co."
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-5 py-3.5 bg-[#f8f7f2] border border-transparent focus:border-zinc-400 rounded-2xl font-serif italic text-base text-zinc-900 placeholder:text-zinc-400 placeholder:not-italic focus:outline-none transition shadow-2xs"
                />
              </div>

              {/* Functional Currency Options (Grid matching Screenshot 2) */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">
                  FUNCTIONAL CURRENCY
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[
                    { code: 'USD' as const, symbol: '$', label: 'USD' },
                    { code: 'UGX' as const, symbol: 'USh', label: 'UGX' },
                    { code: 'KES' as const, symbol: 'KSh', label: 'KES' },
                    { code: 'SSP' as const, symbol: 'SSP', label: 'SSP' },
                  ].map((item) => {
                    const isCurrSelected = currency === item.code;
                    return (
                      <div
                        key={item.code}
                        onClick={() => setCurrency(item.code)}
                        className={`p-3.5 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition select-none ${
                          isCurrSelected
                            ? 'bg-[#54623e] text-white shadow-md border border-[#54623e]'
                            : 'bg-white text-zinc-800 border border-zinc-200/80 hover:border-zinc-400'
                        }`}
                      >
                        <span className="font-extrabold text-base leading-none mb-1">{item.symbol}</span>
                        <span className={`text-[9px] font-bold tracking-widest uppercase ${isCurrSelected ? 'text-zinc-200' : 'text-zinc-400'}`}>
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Functional Description */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">
                  DESCRIPTION (OPTIONAL)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Regional operations ledger"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-[#f8f7f2] border border-transparent focus:border-zinc-400 rounded-2xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition"
                />
              </div>

              {/* Submit Button (Matching Screenshot 2) */}
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  className="w-full py-4 bg-[#54623e] hover:bg-[#435031] text-white font-extrabold uppercase tracking-[0.2em] rounded-full text-xs transition shadow-md cursor-pointer"
                >
                  CONFIRM INCORPORATION
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-2 text-zinc-400 hover:text-zinc-800 text-[11px] font-extrabold uppercase tracking-widest transition cursor-pointer text-center block"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
