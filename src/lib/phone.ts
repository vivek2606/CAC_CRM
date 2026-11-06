// Nigerian phone numbers: stored the same way however they're typed, so
// WhatsApp links and duplicate checks work. 0803 123 4567, 08031234567,
// 2348031234567 and +234 803 123 4567 all become "+234 803 123 4567".
// Anything else (a foreign or short number) is kept as typed.
export function formatNgPhone(raw: string | null | undefined): string | null {
  const typed = (raw ?? "").trim();
  if (!typed) return null;
  const d = typed.replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("0") ? d.slice(1) : d.length === 13 && d.startsWith("234") ? d.slice(3) : d.length === 10 && /^[789]/.test(d) && !typed.startsWith("+") ? d : null;
  if (!local) return typed;
  return `+234 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

// A number that looks like a mistyped Nigerian mobile - a digit short or
// over (0803 123 456), a 234 number of the wrong length - or too short to
// be any number. Only a hint, never blocking: landlines (01-2345678) and
// foreign numbers (+44...) are fine.
export function phoneLooksWrong(raw: string | null | undefined): boolean {
  const typed = (raw ?? "").trim();
  if (!typed) return false;
  const d = typed.replace(/\D/g, "");
  if (d.length < 7) return true;
  if (typed.startsWith("+") && !d.startsWith("234")) return false;
  if (d.startsWith("234")) return d.length !== 13;
  if (/^0[789]/.test(d)) return d.length !== 11;
  return false;
}
