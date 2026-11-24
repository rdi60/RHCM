"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/appointments", label: "Day" },
  { href: "/appointments/week", label: "Week" },
  { href: "/appointments/month", label: "Month" },
  { href: "/appointments/doctor", label: "Doctor-wise" },
];

export function ViewTabs() {
  const pathname = usePathname();
  return (
    <div className="flex w-fit gap-1 rounded-button border border-border bg-card p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-button px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-peach text-peach-foreground shadow-subtle" : "text-muted-foreground hover:bg-lavender hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
