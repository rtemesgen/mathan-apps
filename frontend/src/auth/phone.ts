export const PHONE_COUNTRIES = [
  { code: '+256', name: 'Uganda' },
  { code: '+211', name: 'South Sudan' },
  { code: '+254', name: 'Kenya' },
  { code: '+255', name: 'Tanzania' },
  { code: '+250', name: 'Rwanda' },
  { code: '+251', name: 'Ethiopia' },
  { code: '+27', name: 'South Africa' },
  { code: '+234', name: 'Nigeria' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+1', name: 'United States / Canada' },
] as const;

/** Store every phone as +countrycode plus national digits, without trunk zeros. */
export function normalizePhone(phone: string, countryCode: string): string {
  const raw = phone.trim().replace(/[\s().-]/g, '');
  const digits = raw.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return `+${digits.slice(1).replace(/\D/g, '')}`;
  const countryDigits = countryCode.replace(/\D/g, '');
  return `+${countryDigits}${digits.replace(/^0+/, '')}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
