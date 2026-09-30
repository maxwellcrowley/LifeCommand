export type CloudConfig = { url: string; anonKey: string };

export function cloudConfig(url?: string, anonKey?: string): CloudConfig | null {
  if (!url?.trim() || !anonKey?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return { url: parsed.origin, anonKey: anonKey.trim() };
  } catch { return null; }
}
