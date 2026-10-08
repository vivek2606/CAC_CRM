import { requireUser } from "@/lib/rbac";
import { getNotifications } from "@/lib/notifications";
import { pushPublicKey } from "@/lib/push";

// The bell's list - see NotificationBell.
export async function GET() {
  const user = await requireUser();
  return Response.json({ ...(await getNotifications(user)), pushKey: pushPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
