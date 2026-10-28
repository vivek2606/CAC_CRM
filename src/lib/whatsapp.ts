// A phone number as WhatsApp's wa.me link wants it: digits with the country
// code, no "+" - Nigerian numbers typed locally (0803...) get 234.
export function waNumber(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = `234${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function whatsappLink(phone: string, text: string): string {
  const n = waNumber(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}
