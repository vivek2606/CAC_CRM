// Birthdays and other dates to remember (wedding / company anniversary...)
// on contacts: only the day and month matter - stored in the year 2000
// (a leap year, so 29 February works). Safe to use in the browser.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const SPECIAL_LABELS = ["Wedding anniversary", "Company anniversary", "Work anniversary"];

export function dayMonth(d: Date | null | undefined): { day: number; month: number } | null {
  return d ? { day: d.getUTCDate(), month: d.getUTCMonth() + 1 } : null;
}
export function fromDayMonth(day: unknown, month: unknown): Date | null {
  const dd = Number(day);
  const mm = Number(month);
  if (!dd || !mm) return null;
  const d = new Date(Date.UTC(2000, mm - 1, dd));
  return d.getUTCMonth() === mm - 1 ? d : null;
}
export const dayMonthLabel = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;

// Days from `today` (a Lagos YYYY-MM-DD) to the next time this day and month
// comes round (0 = today). 29 Feb falls on 28 Feb in other years.
export function daysUntil(d: Date, today: string): number {
  const [y, m, dd] = today.split("-").map(Number);
  const t = Date.UTC(y, m - 1, dd);
  const on = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = d.getUTCMonth() === 1 && d.getUTCDate() === 29 && !leap ? 28 : d.getUTCDate();
    return Date.UTC(year, d.getUTCMonth(), day);
  };
  const next = on(y) >= t ? on(y) : on(y + 1);
  return Math.round((next - t) / 86400000);
}

export function greeting(o: { firstName: string; kind: string; from: string; company: string }) {
  const what = o.kind === "Birthday" ? "Happy birthday" : `Happy ${o.kind.toLowerCase()}`;
  return `Dear ${o.firstName},\n\n${what}! Wishing you joy, good health and success in the year ahead.\n\nWarm regards,\n${o.from}\n${o.company}`;
}
