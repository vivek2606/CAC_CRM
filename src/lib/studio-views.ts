import { prisma } from "@/lib/prisma";
import type { StudioView } from "@/components/chart-studio/studio";

// Chart-studio layouts saved per login (so they follow the user to any
// device): the Sales Register's views and the Team Reports tabs.

export type StudioScope = "register" | "team";
const keyFor = (scope: StudioScope, userId: string) => `studio-views:${scope}:${userId}`;

export async function getStudioViews(scope: StudioScope, userId: string): Promise<StudioView[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: keyFor(scope, userId) } });
  const v = row?.value as unknown;
  return Array.isArray(v) ? (v as StudioView[]).filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && x.cfg) : [];
}

export async function putStudioViews(scope: StudioScope, userId: string, views: StudioView[]): Promise<void> {
  const value = views as unknown as object;
  await prisma.appSetting.upsert({ where: { key: keyFor(scope, userId) }, create: { key: keyFor(scope, userId), value }, update: { value } });
}
