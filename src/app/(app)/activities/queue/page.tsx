import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BUCKET_ORDER, bucketFor } from "@/lib/activity-buckets";
import { TaskQueue } from "./task-queue";

// A personal work queue, HubSpot's Task Queue - always scoped to the
// current user's own pending activities regardless of role, since "work my
// day" is inherently a first-person tool, not a team-oversight view (that's
// what the main Activities list + owner filter already is).
export default async function TaskQueuePage() {
  const user = await requireUser();

  const activities = await prisma.activity.findMany({
    where: { ownerId: user.id, status: "PENDING" },
    include: {
      lead: { select: { id: true, title: true } },
      deal: { select: { id: true, title: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      account: { select: { id: true, name: true } },
    },
  });

  const sorted = [...activities].sort((a, b) => {
    const bucketDiff = BUCKET_ORDER.indexOf(bucketFor(a.dueAt)) - BUCKET_ORDER.indexOf(bucketFor(b.dueAt));
    if (bucketDiff !== 0) return bucketDiff;
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    return 0;
  });

  return (
    <div>
      <PageHeader
        title="Task Queue"
        description="Work through your pending activities one at a time, in priority order"
      />
      <div className="p-6">
        <TaskQueue activities={sorted} />
      </div>
    </div>
  );
}
