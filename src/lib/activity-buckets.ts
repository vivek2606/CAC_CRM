// Shared by the Activities list and the Task Queue - the priority order a
// rep should work through pending activities in, bucketed by calendar day
// (not exact time) so a stretch of hours overdue still reads as simply
// "Overdue" rather than a separate tier.
export const BUCKET_ORDER = ["Overdue", "Today", "This Week", "Later", "No Due Date"] as const;
export type Bucket = (typeof BUCKET_ORDER)[number];

export function bucketFor(dueAt: Date | null): Bucket {
  if (!dueAt) return "No Due Date";
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (dueAt < todayStart) return "Overdue";
  if (dueAt < tomorrowStart) return "Today";
  if (dueAt < weekEnd) return "This Week";
  return "Later";
}
