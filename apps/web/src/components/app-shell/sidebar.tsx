"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { currentGrant } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.anyOf) return true;
    return item.anyOf.some((code) => currentGrant?.permissions.includes(code));
  });

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <img src="/icons/icon-192.png" alt="" className="h-8 w-8 shrink-0 rounded-sm shadow-subtle" />
        {!collapsed && <span className="truncate text-heading-section font-semibold text-sidebar-foreground">RHCM</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-peach text-peach-foreground shadow-subtle"
                  : "text-sidebar-foreground/85 hover:bg-white/10 hover:text-sidebar-foreground",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-peach-highlight" : "text-sidebar-foreground/85")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        className="hidden h-10 items-center justify-center border-t border-white/10 text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground md:flex"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
