import { blockServiceManager } from "@/lib/service-access";

// Not for the Service Manager (service-only view - see service-access.ts).
export default async function SalesOnlyLayout({ children }: { children: React.ReactNode }) {
  await blockServiceManager();
  return children;
}
