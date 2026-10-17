import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** join class names; later Tailwind classes override earlier ones (shadcn convention) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
