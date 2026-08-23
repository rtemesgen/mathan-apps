import { deleteOffline, readOffline, writeOffline } from '../lib/localStore';

const CACHE_KEY = 'mathan_erp_guest_workspaces_v1';
export const GUEST_DATA_DOMAINS = [
  ['cash_book', 'books'], ['cash_book', 'transactions'],
  ['payroll', 'employees'], ['payroll', 'transactions'], ['payroll', 'custom-apps'],
] as const;

export interface GuestWorkspace {
  id: string;
  name: string;
  accent_color: string;
  createdAt: string;
  importedFingerprint?: string;
  importedAt?: string;
  importId?: string;
}

export interface GuestWorkspaceCache {
  version: 1;
  memberships: GuestWorkspace[];
  selectedWorkspaceId: string;
  cachedAt: string;
}

export interface GuestWorkspaceExport {
  version: 1;
  importId: string;
  guestWorkspaceId: string;
  guestWorkspaceName: string;
  exportedAt: string;
  fingerprint: string;
  snapshots: Record<string, unknown[]>;
  truck: { trucks: unknown[]; owners: unknown[]; transactions: unknown[] };
}

const makeWorkspace = (name = 'Guest Company'): GuestWorkspace => ({ id: crypto.randomUUID(), name, accent_color: '#10b981', createdAt: new Date().toISOString() });

function persist(cache: GuestWorkspaceCache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, cachedAt: new Date().toISOString() }));
}

export function readGuestWorkspaceCache(): GuestWorkspaceCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as GuestWorkspaceCache | null;
    if (parsed?.version === 1 && parsed.memberships.length > 0) {
      if (!parsed.memberships.some((item) => item.id === parsed.selectedWorkspaceId)) parsed.selectedWorkspaceId = parsed.memberships[0].id;
      return parsed;
    }
  } catch { /* create a clean guest workspace */ }
  const workspace = makeWorkspace();
  const cache: GuestWorkspaceCache = { version: 1, memberships: [workspace], selectedWorkspaceId: workspace.id, cachedAt: new Date().toISOString() };
  persist(cache);
  return cache;
}

export function createGuestWorkspace(name: string) {
  const cache = readGuestWorkspaceCache();
  const workspace = makeWorkspace(name.trim() || `Guest Company ${cache.memberships.length + 1}`);
  const next = { ...cache, memberships: [...cache.memberships, workspace], selectedWorkspaceId: workspace.id };
  persist(next);
  return next;
}

export function selectGuestWorkspace(id: string) {
  const cache = readGuestWorkspaceCache();
  if (!cache.memberships.some((item) => item.id === id)) return cache;
  const next = { ...cache, selectedWorkspaceId: id };
  persist(next);
  return next;
}

export function renameGuestWorkspace(id: string, name: string, accentColor?: string) {
  const cache = readGuestWorkspaceCache();
  const next = { ...cache, memberships: cache.memberships.map((item) => item.id === id ? { ...item, name: name.trim() || item.name, accent_color: accentColor ?? item.accent_color } : item) };
  persist(next);
  return next;
}

const snapshotKey = (workspaceId: string, domain: string, key: string) => `standalone:${workspaceId}:${domain}:${key}`;
const truckKey = (workspaceId: string) => `truck:guest:${workspaceId}`;

export async function migrateLegacyGuestData(workspaceId: string) {
  for (const [domain, key] of GUEST_DATA_DOMAINS) {
    const destination = snapshotKey(workspaceId, domain, key);
    if (await readOffline(destination) !== null) continue;
    const indexedLegacy = await readOffline(`standalone:none:${domain}:${key}`);
    const browserKey = domain === 'cash_book' ? `mathan_erp_book_${key === 'books' ? 'books' : 'transactions'}_v1` : `mathan_erp_payroll_${key.replace('-', '_')}_v1`;
    let browserLegacy: unknown = null;
    try { browserLegacy = JSON.parse(localStorage.getItem(browserKey) ?? 'null'); } catch { /* ignore malformed legacy data */ }
    const value = indexedLegacy ?? browserLegacy;
    if (value !== null) await writeOffline(destination, value);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(stable(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function exportGuestWorkspace(workspace: GuestWorkspace): Promise<GuestWorkspaceExport> {
  const snapshots: Record<string, unknown[]> = {};
  for (const [domain, key] of GUEST_DATA_DOMAINS) snapshots[`${domain}:${key}`] = (await readOffline<unknown[]>(snapshotKey(workspace.id, domain, key))) ?? [];
  const truck = (await readOffline<GuestWorkspaceExport['truck']>(truckKey(workspace.id))) ?? { trucks: [], owners: [], transactions: [] };
  const payload = { snapshots, truck };
  const fingerprint = await digest(payload);
  const importId = `${fingerprint.slice(0, 8)}-${fingerprint.slice(8, 12)}-4${fingerprint.slice(13, 16)}-a${fingerprint.slice(17, 20)}-${fingerprint.slice(20, 32)}`;
  return { version: 1, importId, guestWorkspaceId: workspace.id, guestWorkspaceName: workspace.name, exportedAt: new Date().toISOString(), fingerprint, ...payload };
}

export async function guestWorkspaceHasData(workspace: GuestWorkspace) {
  const payload = await exportGuestWorkspace(workspace);
  return Object.values(payload.snapshots).some((items) => items.length > 0) || payload.truck.trucks.length > 0 || payload.truck.owners.length > 0 || payload.truck.transactions.length > 0;
}

export function markGuestWorkspaceImported(id: string, fingerprint: string, importId: string) {
  const cache = readGuestWorkspaceCache();
  const next = { ...cache, memberships: cache.memberships.map((item) => item.id === id ? { ...item, importedFingerprint: fingerprint, importedAt: new Date().toISOString(), importId } : item) };
  persist(next);
  return next;
}

export async function clearGuestWorkspaceData(id: string) {
  for (const [domain, key] of GUEST_DATA_DOMAINS) {
    await deleteOffline(snapshotKey(id, domain, key));
    await deleteOffline(`${snapshotKey(id, domain, key)}:revision`);
  }
  await deleteOffline(truckKey(id));
  localStorage.removeItem(`mathan_truck_preferences_${id}`);
  localStorage.removeItem(`mathan_settings_section_guest_${id}`);
}

export async function deleteGuestWorkspace(id: string) {
  const cache = readGuestWorkspaceCache();
  await clearGuestWorkspaceData(id);
  let memberships = cache.memberships.filter((item) => item.id !== id);
  if (memberships.length === 0) memberships = [makeWorkspace()];
  const next = { ...cache, memberships, selectedWorkspaceId: cache.selectedWorkspaceId === id ? memberships[0].id : cache.selectedWorkspaceId };
  persist(next);
  return next;
}
