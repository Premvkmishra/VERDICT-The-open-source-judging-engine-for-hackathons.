/**
 * Small tolerant readers for endpoints whose exact JSON shape the contract
 * describes in prose rather than schema (dashboard progress, explain chain).
 * They never invent a request — they only read whichever of several plausible
 * field names the backend actually returned, and fall back to a graceful
 * empty state.
 */

type Obj = Record<string, unknown>;

export function asObject(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

export function pick<T>(source: unknown, keys: string[]): T | undefined {
  const obj = asObject(source);
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

export function pickNumber(source: unknown, keys: string[]): number | undefined {
  const value = pick<unknown>(source, keys);
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && !Number.isNaN(num) ? num : undefined;
}

export function pickString(source: unknown, keys: string[]): string | undefined {
  const value = pick<unknown>(source, keys);
  return typeof value === "string" ? value : undefined;
}

export function pickArray<T = unknown>(source: unknown, keys: string[]): T[] {
  const value = pick<unknown>(source, keys);
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Turns {yes: 3, maybe: 1} or [{value:'yes',count:3}] into pairs. */
export function toDistribution(value: unknown): { key: string; count: number }[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const obj = asObject(entry);
        if (!obj) return null;
        const key = (obj['key'] ?? obj['value'] ?? obj['label'] ?? obj['name']) as string | undefined;
        const count = Number(obj['count'] ?? obj['n'] ?? obj['total'] ?? 0);
        return key ? { key, count } : null;
      })
      .filter((v): v is { key: string; count: number } => Boolean(v));
  }
  const obj = asObject(value);
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([, v]) => typeof v === "number")
    .map(([key, v]) => ({ key, count: v as number }));
}
