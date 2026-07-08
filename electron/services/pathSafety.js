import path from 'node:path';

const BLOCKED_PREFIXES = [
  '/etc', '/var', '/System', '/Library/Preferences',
  '/Windows/System32', '/usr',
].map(p => path.resolve(p));

export function isPathSafe(requestedPath) {
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) return false;
  try {
    const normalized = path.resolve(requestedPath);
    for (const prefix of BLOCKED_PREFIXES) {
      if (normalized.startsWith(prefix)) return false;
    }
    if (normalized.includes('/../') || normalized.includes('\\..\\')) return false;
    return true;
  } catch {
    return false;
  }
}
