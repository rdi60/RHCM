import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-card border transition-shadow", {
  variants: {
    surface: {
      default: "border-border bg-card text-card-foreground shadow-subtle",
      lavender: "border-primary/10 bg-lavender text-lavender-foreground shadow-subtle",
      peach: "border-peach-highlight/15 bg-peach text-peach-foreground shadow-subtle",
      lilac: "border-primary/10 bg-lilac text-foreground shadow-subtle",
    },
  },
  defaultVariants: { surface: "default" },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, surface, ...props }: CardProps) {
  return <div className={cn(cardVariants({ surface }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-heading-section leading-none tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-support text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
