import { requireUser } from "@/lib/rbac";
import { getNotifications } from "@/lib/notifications";
import { pushPublicKey } from "@/lib/push";
import { after } from "next/server";
import { runSlaEscalations } from "@/lib/service-sla";

// The bell's list - see NotificationBell.
export async function GET() {
  const user = await requireUser();
  // Complaint SLA escalations ride on the bell's refresh (every few
  // minutes for anyone signed in) - throttled to every 10 minutes.
  after(() => runSlaEscalations());
  return Response.json({ ...(await getNotifications(user)), pushKey: pushPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
