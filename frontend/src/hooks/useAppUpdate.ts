import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const RELEASES_API = 'https://api.github.com/repos/rtemesgen/mathan-apps/releases/latest';

function versionParts(value: string) {
  return value.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(latest: string, current: string) {
  const next = versionParts(latest);
  const installed = versionParts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0);
  }
  return false;
}

export function useAppUpdate() {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    void (async () => {
      try {
        const info = await CapacitorApp.getInfo();
        const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
        if (!response.ok) return;
        const release = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
        if (active && release.tag_name && release.html_url && !release.draft && !release.prerelease && isNewerVersion(release.tag_name, info.version)) {
          setUpdate({ version: release.tag_name.replace(/^v/i, ''), url: release.html_url });
        }
      } catch {
        // Updates are optional; the installed app remains fully usable offline.
      }
    })();
    return () => { active = false; };
  }, []);

  return {
    update,
    openUpdate: () => update ? void Browser.open({ url: update.url }) : undefined,
    dismissUpdate: () => setUpdate(null),
  };
}
