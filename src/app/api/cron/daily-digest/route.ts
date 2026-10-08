import { prisma } from "@/lib/prisma";
import { getNotifications } from "@/lib/notifications";
import { sendPush, subscribedUserIds } from "@/lib/push";

// Morning reminder push (Vercel Cron, see vercel.json): everyone with
// notifications on gets a summary of what needs their attention today.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const ids = await subscribedUserIds();
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, name: true, email: true, role: true, avatarColor: true },
  });
  let sent = 0;
  for (const u of users) {
    const n = await getNotifications(u);
    if (n.total === 0) continue;
    const lines = n.groups.slice(0, 4).map((g) => `${g.count} · ${g.label}`);
    sent += await sendPush([u.id], {
      title: `Good morning${u.name ? `, ${u.name.split(" ")[0]}` : ""} - ${n.total} thing${n.total === 1 ? "" : "s"} need${n.total === 1 ? "s" : ""} attention`,
      body: lines.join("\n"),
      url: "/",
      tag: "daily-digest",
    });
  }
  return Response.json({ users: users.length, sent });
}
