export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysAgoISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function sortByDateAsc<T extends { tradeDate?: string; date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.tradeDate || a.date).localeCompare(String(b.tradeDate || b.date)));
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
