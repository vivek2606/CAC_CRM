import { COMPETITOR_BRANDS } from "@/lib/constants";

// Picker for the competing brand. A brand saved before the list existed
// (typed in freely) stays selectable so it isn't lost on save.
export function CompetitorBrandSelect({
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Pick a brand…",
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (brand: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const current = value ?? defaultValue ?? "";
  const legacy = current && !(COMPETITOR_BRANDS as readonly string[]).includes(current) ? current : null;
  return (
    <select name={name} value={value} defaultValue={value === undefined ? current : undefined} onChange={onChange ? (e) => onChange(e.target.value) : undefined} className={className}>
      <option value="">{placeholder}</option>
      {COMPETITOR_BRANDS.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
      {legacy && <option value={legacy}>{legacy} (old entry)</option>}
    </select>
  );
}
