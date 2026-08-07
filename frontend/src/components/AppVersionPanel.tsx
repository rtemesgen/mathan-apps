import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Info } from 'lucide-react';

const bundledVersion = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim();
const bundledBuild = (import.meta.env.VITE_BUILD_NUMBER as string | undefined)?.trim();

export function AppVersionPanel() {
  const [version, setVersion] = useState(bundledVersion || 'Development build');
  const [build, setBuild] = useState(bundledBuild || 'local');

  useEffect(() => {
    let active = true;
    void CapacitorApp.getInfo().then((info) => {
      if (!active) return;
      setVersion(bundledVersion || info.version || 'Development build');
      setBuild(bundledBuild || info.build || 'local');
    }).catch(() => {
      // Browser builds do not provide native package metadata.
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#e6e2d6] bg-white/75 px-4 py-3 text-xs shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white"><Info className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="font-bold text-zinc-800">Mathan ERP</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">Version <span className="font-mono font-bold text-zinc-700">{version}</span> · Build <span className="font-mono font-bold text-zinc-700">{build}</span></p>
      </div>
    </div>
  );
}
