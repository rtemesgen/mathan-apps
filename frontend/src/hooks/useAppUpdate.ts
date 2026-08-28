import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { emitAppNotification } from '../lib/notifications';

const RELEASES_API = 'https://api.github.com/repos/rtemesgen/mathan-apps/releases/latest';
type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'ready' | 'error';
type UpdateInfo = { version: string; url: string; downloadUrl: string };

interface AppUpdaterPlugin {
  scheduleUpdateChecks(): Promise<void>;
  downloadAndInstall(options: { url: string; filename?: string }): Promise<{ downloadId?: number }>;
  installDownloaded(): Promise<void>;
  getDownloadProgress(): Promise<{ progress: number; downloaded: number; total: number; status: string }>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');
const AppUpdateContext = createContext<ReturnType<typeof useUpdateController> | null>(null);

function versionParts(value: string) {
  return value.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(latest: string, current: string) {
  const next = versionParts(latest);
  const installed = versionParts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0);
  }
  return false;
}

function downloadStateKey(version: string) {
  return `mathan_update_download_state_${version}`;
}

function readDownloadStatus(version: string): DownloadStatus {
  const value = localStorage.getItem(downloadStateKey(version));
  return value === 'downloading' || value === 'paused' || value === 'ready' || value === 'error' ? value : 'idle';
}

function writeDownloadStatus(version: string, state: DownloadStatus) {
  if (state === 'idle') localStorage.removeItem(downloadStateKey(version));
  else localStorage.setItem(downloadStateKey(version), state);
}

function useUpdateController() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'error'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [noticeVisible, setNoticeVisible] = useState(false);

  const startDownload = useCallback(async (next: UpdateInfo) => {
    const currentState = readDownloadStatus(next.version);
    if (currentState === 'downloading' || currentState === 'ready') {
      setDownloadStatus(currentState);
      return;
    }
    setDownloadStatus('downloading');
    setDownloadProgress(0);
    writeDownloadStatus(next.version, 'downloading');
    try {
      await AppUpdater.downloadAndInstall({ url: next.downloadUrl, filename: `mathan-erp-${next.version}.apk` });
      // Completion is decided by getDownloadProgress after DownloadManager
      // verifies the final APK URI; enqueueing alone is not completion.
    } catch {
      setDownloadStatus('error');
      writeDownloadStatus(next.version, 'error');
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (Capacitor.getPlatform() !== 'android') return null;
    setStatus('checking');
    setNoticeVisible(false);
    try {
      const info = await CapacitorApp.getInfo();
      const bundledVersion = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim();
      // The Android package manager is authoritative. A web asset can be
      // cached or accidentally built with a stale VITE_APP_VERSION, which
      // must never make an already-installed APK prompt for itself.
      const installedVersion = info.version?.trim() || bundledVersion || '0.0.0';
      const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) { setStatus('error'); return null; }
      const release = await response.json() as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean; assets?: Array<{ name?: string; browser_download_url?: string }> };
      const apk = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.apk'));
      if (release.tag_name && release.html_url && apk?.browser_download_url && !release.draft && !release.prerelease && isNewerVersion(release.tag_name, installedVersion)) {
        const next = { version: release.tag_name.replace(/^v/i, ''), url: release.html_url, downloadUrl: apk.browser_download_url };
        setUpdate(next);
        setStatus('available');
        setDownloadProgress(0);
        setDownloadStatus(readDownloadStatus(next.version));
        setNoticeVisible(true);
        const notification = { title: 'Mathan ERP update available', body: `Version ${next.version} is ready to download. Tap to open Mathan ERP.`, url: '/' };
        emitAppNotification(notification);
        return next;
      }
      setUpdate(null);
      setDownloadStatus('idle');
      setDownloadProgress(0);
      setStatus('up-to-date');
      return null;
    } catch {
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let active = true;
    void AppUpdater.scheduleUpdateChecks().catch(() => undefined);
    void checkForUpdate();
    const resume = CapacitorApp.addListener('resume', () => { if (active) void checkForUpdate(); });
    const timer = window.setInterval(() => { if (active) void checkForUpdate(); }, 6 * 60 * 60 * 1000);
    return () => { active = false; void resume.then((handle) => handle.remove()); window.clearInterval(timer); };
  }, [checkForUpdate]);

  const downloadUpdate = useCallback(() => {
    if (update) void startDownload(update);
  }, [startDownload, update]);

  const installUpdate = useCallback(() => {
    if (!update) return;
    if (downloadStatus !== 'ready') {
      downloadUpdate();
      return;
    }
    void AppUpdater.installDownloaded().catch(() => setDownloadStatus('error'));
  }, [downloadStatus, downloadUpdate, update]);

  useEffect(() => {
    if (downloadStatus !== 'downloading' || !update) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await AppUpdater.getDownloadProgress();
        if (!active) return;
        if (result.status === 'successful') {
          setDownloadProgress(100);
          setDownloadStatus('ready');
          writeDownloadStatus(update.version, 'ready');
        } else if (result.status === 'failed' || result.status === 'missing' || result.status === 'none') {
          setDownloadStatus('error');
          writeDownloadStatus(update.version, 'error');
        } else if (result.status === 'paused') {
          setDownloadStatus('paused');
          writeDownloadStatus(update.version, 'paused');
        } else if (Number.isFinite(result.progress)) {
          setDownloadProgress(Math.max(0, Math.min(99, result.progress)));
        }
      } catch {
        // Progress is optional; the download state remains visible.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 700);
    return () => { active = false; window.clearInterval(timer); };
  }, [downloadStatus, update]);

  return { update, status, checkForUpdate, downloadStatus, downloadProgress, noticeVisible, downloadUpdate, installUpdate, dismissUpdate: () => setNoticeVisible(false) };
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const controller = useUpdateController();
  return React.createElement(AppUpdateContext.Provider, { value: controller }, children);
}

export function useAppUpdate() {
  const context = useContext(AppUpdateContext);
  if (!context) throw new Error('useAppUpdate must be used inside AppUpdateProvider');
  return context;
}
