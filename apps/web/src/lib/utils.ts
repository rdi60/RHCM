import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "IN_TREATMENT" -> "In treatment". Display formatting only — never compare against this value. */
export function formatStatus(value: string): string {
  const words = value.split("_").filter(Boolean);
  if (words.length === 0) return value;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}
