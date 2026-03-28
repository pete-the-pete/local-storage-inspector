import type { StorageEntry } from "@/shared/types";

export function filterEntries(entries: StorageEntry[], query: string): StorageEntry[] {
  if (query === "") return entries;
  const lower = query.toLowerCase();
  return entries.filter((entry) => entry.key.toLowerCase().includes(lower));
}
