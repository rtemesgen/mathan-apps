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
    <div className="text-right text-[10px] leading-4 text-zinc-400">
      <p className="font-mono font-semibold text-zinc-500">v{version}</p>
      <p>Build {build}</p>
    </div>
  );
}
