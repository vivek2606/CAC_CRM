import { prisma } from "@/lib/prisma";
import { custNameMatchKey } from "@/lib/import/sales-register";

export type DupAccount = {
  id: string;
  name: string;
  code: string | null;
  owner: string;
  city: string | null;
  deals: number;
  contacts: number;
  leads: number;
  lastSale: string | null;
};
export type DupGroup = { key: string; accounts: DupAccount[]; differentCodes: boolean };

// Letter-pair (Dice) similarity of two match keys, 0..1.
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const pairs = (s: string) => {
    const x = s.replace(/ /g, "");
    const out = new Map<string, number>();
    for (let i = 0; i < x.length - 1; i++) out.set(x.slice(i, i + 2), (out.get(x.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let both = 0;
  let total = 0;
  for (const [k, n] of pa) {
    both += Math.min(n, pb.get(k) ?? 0);
    total += n;
  }
  for (const n of pb.values()) total += n;
  return total ? (2 * both) / total : 0;
}

// Accounts that look like the same customer: names equal once case,
// punctuation and company suffixes are ignored ("CINEMA 21 LIMITED" /
// "Cinema 21 Ltd"), one name extending the other ("SONNEX PACKAGING" /
// "SONNEX PACKAGING NIGERIA LIMITED"), or close spellings ("PHILIP
// PHARMACEUTICAL" / "PHILLIP PHARMACEUTICALS") - compared within the same
// first word.
export async function findDuplicateGroups(): Promise<DupGroup[]> {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      owner: { select: { name: true } },
      _count: { select: { deals: true, contacts: true, leads: true } },
      deals: { where: { stage: "WON" }, orderBy: { closedAt: "desc" }, take: 1, select: { closedAt: true } },
    },
  });
  const keyed = accounts.map((a) => ({ a, key: custNameMatchKey(a.name) })).filter((x) => x.key.length >= 3);
  const parent = new Map<string, string>(keyed.map((x) => [x.a.id, x.a.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const union = (x: string, y: string) => parent.set(find(x), find(y));

  const blocks = new Map<string, typeof keyed>();
  for (const x of keyed) {
    const first = x.key.split(" ")[0];
    const list = blocks.get(first) ?? [];
    list.push(x);
    blocks.set(first, list);
  }
  for (const list of blocks.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [p, q] = [list[i].key, list[j].key];
        const extends_ = (s: string, t: string) => t.startsWith(s + " ") && s.split(" ").length >= 2;
        if (p === q || extends_(p, q) || extends_(q, p) || similarity(p, q) >= 0.88) union(list[i].a.id, list[j].a.id);
      }
    }
  }
  const groups = new Map<string, DupAccount[]>();
  for (const { a } of keyed) {
    const root = find(a.id);
    const list = groups.get(root) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      code: a.code,
      owner: a.owner.name,
      city: a.city,
      deals: a._count.deals,
      contacts: a._count.contacts,
      leads: a._count.leads,
      lastSale: a.deals[0]?.closedAt?.toISOString().slice(0, 10) ?? null,
    });
    groups.set(root, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const sorted = list.sort((x, y) => y.deals - x.deals || x.name.localeCompare(y.name));
      return { key, accounts: sorted, differentCodes: new Set(sorted.map((s) => s.code).filter(Boolean)).size > 1 };
    })
    .sort((x, y) => x.accounts[0].name.localeCompare(y.accounts[0].name));
}

// Names and codes of accounts merged away, so a later Sales Register
// upload bills them to the account they were merged into instead of
// recreating them.
const ALIAS_KEY = "account-aliases";
type Aliases = { names: Record<string, string>; codes: Record<string, string> };

export async function getAccountAliases(): Promise<Aliases> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ALIAS_KEY } });
    const v = row?.value as Partial<Aliases> | undefined;
    return { names: v?.names ?? {}, codes: v?.codes ?? {} };
  } catch {
    return { names: {}, codes: {} };
  }
}

export async function addAccountAliases(intoId: string, names: string[], codes: string[]) {
  const a = await getAccountAliases();
  for (const n of names) a.names[custNameMatchKey(n)] = intoId;
  for (const c of codes) a.codes[c.trim()] = intoId;
  // Anything that pointed at a merged-away account now points here too.
  const value = JSON.parse(JSON.stringify(a));
  await prisma.appSetting.upsert({ where: { key: ALIAS_KEY }, create: { key: ALIAS_KEY, value }, update: { value } });
}

export async function repointAliases(fromIds: string[], intoId: string) {
  const a = await getAccountAliases();
  for (const k of Object.keys(a.names)) if (fromIds.includes(a.names[k])) a.names[k] = intoId;
  for (const k of Object.keys(a.codes)) if (fromIds.includes(a.codes[k])) a.codes[k] = intoId;
  const value = JSON.parse(JSON.stringify(a));
  await prisma.appSetting.upsert({ where: { key: ALIAS_KEY }, create: { key: ALIAS_KEY, value }, update: { value } });
}
