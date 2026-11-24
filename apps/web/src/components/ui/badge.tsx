import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-support font-medium", {
  variants: {
    variant: {
      default: "bg-lavender text-primary",
      muted: "bg-muted text-muted-foreground",
      destructive: "bg-destructive/10 text-destructive",
      success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      peach: "bg-peach text-peach-highlight",
      lilac: "bg-lilac text-primary",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
