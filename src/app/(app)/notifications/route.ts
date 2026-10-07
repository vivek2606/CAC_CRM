import { requireUser } from "@/lib/rbac";
import { getNotifications } from "@/lib/notifications";

// The bell's list - see NotificationBell.
export async function GET() {
  const user = await requireUser();
  return Response.json(await getNotifications(user), { headers: { "Cache-Control": "no-store" } });
}
