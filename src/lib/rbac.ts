import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "HEAD" | "SALES_MANAGER";
  avatarColor: string;
};

/** Requires a logged-in user, redirects to /login otherwise. Use in server components/pages. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user as SessionUser;
}

/** Requires the current user to be the Head of Sales. */
export async function requireHead(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "HEAD") redirect("/");
  return user;
}

/**
 * Returns the list of user ids whose records the current user is allowed to see.
 * HEAD: everyone on the team. SALES_MANAGER: only themself.
 */
export async function visibleOwnerIds(user: SessionUser): Promise<string[]> {
  if (user.role === "HEAD") {
    const users = await prisma.user.findMany({ select: { id: true } });
    return users.map((u) => u.id);
  }
  return [user.id];
}

/** Returns true if the given record ownerId is visible/editable by the current user. */
export function canAccessOwner(user: SessionUser, ownerId: string): boolean {
  return user.role === "HEAD" || user.id === ownerId;
}
