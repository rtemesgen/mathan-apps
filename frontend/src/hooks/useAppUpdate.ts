import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin } from '@capacitor/core';

const RELEASES_API = 'https://api.github.com/repos/rtemesgen/mathan-apps/releases/latest';

interface AppUpdaterPlugin {
  downloadAndInstall(options: { url: string; filename?: string }): Promise<void>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

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
  const [update, setUpdate] = useState<{ version: string; url: string; downloadUrl: string } | null>(null);

  const checkForUpdate = async () => {
    if (Capacitor.getPlatform() !== 'android') return null;
    try {
      const info = await CapacitorApp.getInfo();
      const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) return null;
      const release = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean; assets?: Array<{ name?: string; browser_download_url?: string }> };
      const apk = release.assets?.find((asset) => asset.name?.endsWith('.apk'));
      if (release.tag_name && release.html_url && apk?.browser_download_url && !release.draft && !release.prerelease && isNewerVersion(release.tag_name, info.version)) {
        const next = { version: release.tag_name.replace(/^v/i, ''), url: release.html_url, downloadUrl: apk.browser_download_url };
        setUpdate(next);
        const downloadKey = `mathan_update_download_started_${next.version}`;
        if (!localStorage.getItem(downloadKey)) {
          localStorage.setItem(downloadKey, 'true');
          void AppUpdater.downloadAndInstall({ url: next.downloadUrl, filename: `mathan-erp-${next.version}.apk` }).catch(() => {
            localStorage.removeItem(downloadKey);
          });
        }
        return next;
      }
      setUpdate(null);
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await checkForUpdate();
        if (!active) setUpdate(null);
      } catch {
        // Updates are optional; the installed app remains fully usable offline.
      }
    })();
    return () => { active = false; };
  }, []);

  return {
    update,
    checkForUpdate,
    openUpdate: () => update ? void Browser.open({ url: update.url }) : undefined,
    dismissUpdate: () => setUpdate(null),
  };
}
