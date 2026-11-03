import Link from "next/link";

type Tab = "complaints" | "units" | "amc" | "claims";

// Service: complaints, the installed base, AMC contracts and warranty claims.
export function ServiceTabs({ active }: { active: Tab }) {
  const tab = (key: Tab, href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
      {tab("complaints", "/service", "Complaints")}
      {tab("units", "/service/units", "Installed units & warranty")}
      {tab("amc", "/service/amc", "AMC contracts")}
      {tab("claims", "/service/claims", "Warranty claims")}
    </div>
  );
}
