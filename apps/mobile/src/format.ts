/** Format an integer amount with dot thousand separators (e.g. -1250000 -> "-1.250.000"). */
export function formatVndDigits(value: number): string {
  const sign = value < 0 ? '-' : '';
  const grouped = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped}`;
}

/** Format integer VND as "1.250.000 ₫" without relying on device Intl data. */
export function formatVnd(value: number): string {
  return `${formatVndDigits(value)} ₫`;
}
