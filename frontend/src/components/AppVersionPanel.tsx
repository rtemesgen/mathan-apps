import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

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
    <div className="rounded-xl border border-[#e6e2d6] bg-white/75 px-3 py-2 text-right text-[11px] shadow-sm">
      <p className="font-mono font-bold text-zinc-700">v{version}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">Build {build}</p>
    </div>
  );
}
