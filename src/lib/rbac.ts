import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "HEAD" | "SALES_MANAGER" | "COORDINATOR";
  avatarColor: string;
};

/** Requires a logged-in user, redirects to /login otherwise. Use in server components/pages. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user as SessionUser;
}

/**
 * Back office = the Head of Sales or the Sales Coordinator: both see every
 * record, can enter leads/deals for any sales person, do the data entry
 * (imports, stock, targets, prices...) and see team reports. Head-only areas
 * (team logins, incentives, discount approval) use requireHead() /
 * role === "HEAD" instead.
 */
export function isBackOffice(user: Pick<SessionUser, "role">): boolean {
  return user.role === "HEAD" || user.role === "COORDINATOR";
}

/** Requires the Head of Sales or the Sales Coordinator. */
export async function requireBackOffice(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isBackOffice(user)) redirect("/");
  return user;
}

/** Requires the current user to be the Head of Sales. */
export async function requireHead(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "HEAD") redirect("/");
  return user;
}

/**
 * Returns the list of user ids whose records the current user is allowed to see.
 * Head / Sales Coordinator: everyone on the team. SALES_MANAGER: only themself.
 */
export async function visibleOwnerIds(user: SessionUser): Promise<string[]> {
  if (isBackOffice(user)) {
    const users = await prisma.user.findMany({ select: { id: true } });
    return users.map((u) => u.id);
  }
  return [user.id];
}

/** Returns true if the given record ownerId is visible/editable by the current user. */
export function canAccessOwner(user: SessionUser, ownerId: string): boolean {
  return isBackOffice(user) || user.id === ownerId;
}
