"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { EntitySwitcher } from "./entity-switcher";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, refetch } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await api.post("/auth/logout");
    refetch();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <button className="md:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <EntitySwitcher />
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>
    </header>
  );
}
