import { readStorage, removeStorage, writeStorage } from '../lib/safeStorage';

const GUEST_MODE_KEY = 'mathan_erp_guest_mode';

export function isGuestMode() {
  return readStorage(GUEST_MODE_KEY) === 'true';
}

export function enableGuestMode() {
  writeStorage(GUEST_MODE_KEY, 'true');
}

export function disableGuestMode() {
  removeStorage(GUEST_MODE_KEY);
}
