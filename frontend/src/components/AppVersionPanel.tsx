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
    <div className="fixed bottom-3 right-3 z-[205] text-[10px] font-mono font-semibold text-zinc-400">
      v{version}{build !== 'local' && <span className="sr-only"> build {build}</span>}
    </div>
  );
}
