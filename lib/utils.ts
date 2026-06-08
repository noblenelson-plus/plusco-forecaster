// lib/utils.ts

/**
 * `cn()` — merge conditional class names and resolve Tailwind conflicts.
 * Standard shadcn/ui helper: clsx flattens the arguments, tailwind-merge keeps
 * the last of any conflicting utilities (e.g. `p-2 p-4` → `p-4`).
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
