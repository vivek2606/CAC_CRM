// Pure formatting helpers for quotations / proformas - no database access,
// so the browser-side builder can use them for its live totals too.

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);
const letter = (n: number) => (n <= 26 ? String.fromCharCode(64 + n) : `A${n - 26}`);

// S/N like the BOQ format: sections A, B, C with i, ii, iii under each;
// items before any section (or with no sections at all) are 1, 2, 3.
export function serialNumbers(rows: { kind: "section" | "item" }[]): string[] {
  let section = 0;
  let inSection = 0;
  let plain = 0;
  return rows.map((r) => {
    if (r.kind === "section") {
      section++;
      inSection = 0;
      return letter(section);
    }
    if (section === 0) return String(++plain);
    return roman(++inSection);
  });
}

// e.g. SNL/VIV/20262109 - prefix / initials / year + day + month, the
// format used on existing CAC quotations.
export function defaultRef(prefix: string, userName: string, date: Date): string {
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);
  const stamp = `${date.getFullYear()}${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return [prefix, initials, stamp].filter(Boolean).join("/");
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} Hundred` : "", h && r ? "and" : "", rest].filter(Boolean).join(" ");
}

function integerInWords(n: number): string {
  if (n === 0) return "Zero";
  const last = n % 1000;
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${under1000(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  // "One Thousand and Five", not "One Thousand, Five".
  if (parts.length > 1 && last > 0 && last < 100) return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return parts.join(", ");
}

// e.g. 1,250,500.50 -> "One Million, Two Hundred and Fifty Thousand, Five Hundred Naira and Fifty Kobo Only"
export function nairaInWords(amount: number): string {
  const negative = amount < 0;
  const kobo = Math.round(Math.abs(amount) * 100);
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const words = `${integerInWords(naira)} Naira${k ? ` and ${integerInWords(k)} Kobo` : ""} Only`;
  return negative ? `Minus ${words}` : words;
}

// The availability text the Quotations builder fills in when a model is
// picked ("Available", "Not Available", "In Transit (ETA ...)").
export function isAvailabilityNote(detail: string): boolean {
  return /^(available|not available|in transit)\b/i.test(detail.trim());
}
