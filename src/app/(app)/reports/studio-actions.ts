"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { getStudioViews, putStudioViews, type StudioScope } from "@/lib/studio-views";
import type { StudioView } from "@/components/chart-studio/studio";
import type { StudioConfig } from "@/components/chart-studio/engine";

// Saving, renaming, ordering and deleting chart-studio layouts (Sales
// Register views, Team Reports tabs) - each user's own.

const MAX_VIEWS = 40;
const SCOPES: StudioScope[] = ["register", "team"];
const pathOf = (scope: StudioScope) => (scope === "team" ? "/reports" : "/reports/sales-register");

function check(scope: StudioScope, name?: string, cfg?: unknown): string | null {
  if (!SCOPES.includes(scope)) return "Unknown place.";
  if (name !== undefined && (!name.trim() || name.trim().length > 60)) return "Give it a name (up to 60 characters).";
  if (cfg !== undefined && (typeof cfg !== "object" || cfg === null || JSON.stringify(cfg).length > 20000)) return "That layout can't be saved.";
  return null;
}

// New (no id) or an update of an existing one. Returns its id.
export async function saveStudioView(scope: StudioScope, view: { id?: string | null; name: string; cfg: StudioConfig }): Promise<{ id?: string; views?: StudioView[]; error?: string }> {
  const user = await requireUser();
  const err = check(scope, view.name, view.cfg);
  if (err) return { error: err };
  const list = await getStudioViews(scope, user.id);
  const name = view.name.trim();
  let id = view.id ?? null;
  if (id && list.some((v) => v.id === id)) {
    const next = list.map((v) => (v.id === id ? { ...v, name, cfg: view.cfg } : v));
    await putStudioViews(scope, user.id, next);
    revalidatePath(pathOf(scope));
    return { id, views: next };
  }
  if (list.length >= MAX_VIEWS) return { error: `Up to ${MAX_VIEWS} can be saved - delete one first.` };
  id = crypto.randomUUID().slice(0, 12);
  const next = [...list, { id, name, cfg: view.cfg }];
  await putStudioViews(scope, user.id, next);
  revalidatePath(pathOf(scope));
  return { id, views: next };
}

export async function renameStudioView(scope: StudioScope, id: string, name: string): Promise<{ views?: StudioView[]; error?: string }> {
  const user = await requireUser();
  const err = check(scope, name);
  if (err) return { error: err };
  const next = (await getStudioViews(scope, user.id)).map((v) => (v.id === id ? { ...v, name: name.trim() } : v));
  await putStudioViews(scope, user.id, next);
  revalidatePath(pathOf(scope));
  return { views: next };
}

export async function moveStudioView(scope: StudioScope, id: string, by: -1 | 1): Promise<{ views?: StudioView[]; error?: string }> {
  const user = await requireUser();
  const err = check(scope);
  if (err) return { error: err };
  const list = await getStudioViews(scope, user.id);
  const i = list.findIndex((v) => v.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return { views: list };
  [list[i], list[j]] = [list[j], list[i]];
  await putStudioViews(scope, user.id, list);
  revalidatePath(pathOf(scope));
  return { views: list };
}

export async function deleteStudioView(scope: StudioScope, id: string): Promise<{ views?: StudioView[]; error?: string }> {
  const user = await requireUser();
  const err = check(scope);
  if (err) return { error: err };
  const next = (await getStudioViews(scope, user.id)).filter((v) => v.id !== id);
  await putStudioViews(scope, user.id, next);
  revalidatePath(pathOf(scope));
  return { views: next };
}
