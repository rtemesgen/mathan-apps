const GUEST_MODE_KEY = 'mathan_erp_guest_mode';

export function isGuestMode() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(GUEST_MODE_KEY) === 'true';
}

export function enableGuestMode() {
  localStorage.setItem(GUEST_MODE_KEY, 'true');
}

export function disableGuestMode() {
  localStorage.removeItem(GUEST_MODE_KEY);
}
