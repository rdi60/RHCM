"use client";

import { useAuth } from "@/lib/auth-context";

export function EntitySwitcher() {
  const { user, selectedEntityId, setSelectedEntityId } = useAuth();

  if (!user || user.access.length === 0) return null;

  if (user.access.length === 1) {
    return <span className="rounded-full bg-lavender px-3 py-1 text-sm font-medium text-primary">{user.access[0].entityCode}</span>;
  }

  return (
    <select
      value={selectedEntityId ?? ""}
      onChange={(e) => setSelectedEntityId(e.target.value)}
      className="h-9 rounded-button border border-border bg-lavender px-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label="Active entity"
    >
      {user.access
        .filter((grant, idx, arr) => arr.findIndex((g) => g.entityId === grant.entityId) === idx)
        .map((grant) => (
          <option key={grant.entityId} value={grant.entityId}>
            {grant.entityCode}
          </option>
        ))}
    </select>
  );
}
