export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

// Intl's "compact" notation can render inconsistently between server (Node ICU)
// and browser ICU, causing hydration mismatches - so this is formatted manually.
export function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}₦${trimZero(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}₦${trimZero(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}₦${trimZero(abs / 1e3)}K`;
  return `${sign}₦${abs.toFixed(0)}`;
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

// A due date stored with no specific time defaults to midnight - use this to
// decide whether a due-date label should also show the time of day.
export function hasTimeComponent(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function relativeDueLabel(date: Date | string | null | undefined): string {
  if (!date) return "No due date";
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days overdue`;
}
