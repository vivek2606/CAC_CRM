import { Phone, Mail, Users, CheckSquare, StickyNote } from "lucide-react";
import type { ActivityType } from "@prisma/client";

const ICONS: Record<ActivityType, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  TASK: CheckSquare,
  NOTE: StickyNote,
};

export function ActivityTypeIcon({ type, className }: { type: ActivityType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className ?? "h-3.5 w-3.5"} />;
}
