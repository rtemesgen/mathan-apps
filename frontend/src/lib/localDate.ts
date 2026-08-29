const padDatePart = (value: number) => String(value).padStart(2, '0');

/** Calendar date in the device's local timezone, suitable for date-only fields. */
export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}
