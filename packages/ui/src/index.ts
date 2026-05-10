/**
 * @danilurist/ui — общие React-компоненты (shadcn/ui based).
 *
 * **Реализация Phase 1+** (apps/web shell). Содержит cn() helper и реэкспорт
 * базовых shadcn-компонентов (Button, Dialog, Input, Tooltip, Toaster, Tabs).
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Утилита для conditionаl класс-неймов: cn("p-4", isActive && "bg-blue-500"). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
