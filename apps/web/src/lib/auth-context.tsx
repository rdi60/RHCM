"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { CurrentUser } from "./types";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  selectedEntityId: string | null;
  setSelectedEntityId: (entityId: string) => void;
  currentGrant: CurrentUser["access"][number] | null;
  hasPermission: (code: string) => boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SELECTED_ENTITY_STORAGE_KEY = "rhcm.selectedEntityId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityIdState] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api.get<CurrentUser>("/auth/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  useEffect(() => {
    if (!user) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SELECTED_ENTITY_STORAGE_KEY);
    } catch {
      // localStorage can throw in private browsing / blocked storage contexts.
    }
    const valid = user.access.find((a) => a.entityId === stored);
    setSelectedEntityIdState(valid ? valid.entityId : (user.access[0]?.entityId ?? null));
  }, [user]);

  function setSelectedEntityId(entityId: string) {
    setSelectedEntityIdState(entityId);
    try {
      localStorage.setItem(SELECTED_ENTITY_STORAGE_KEY, entityId);
    } catch {
      // Best-effort only; selection still works for this render via state.
    }
  }

  const currentGrant = useMemo(
    () => user?.access.find((a) => a.entityId === selectedEntityId) ?? null,
    [user, selectedEntityId],
  );

  const hasPermission = (code: string) => currentGrant?.permissions.includes(code) ?? false;

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    selectedEntityId,
    setSelectedEntityId,
    currentGrant,
    hasPermission,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
