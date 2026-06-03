import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

let domainSet: Set<string> | null = null;

function readDomainsFromJsonFile(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Resolve bundled list in dev (src) and prod (dist) builds. */
function resolveBuiltinDisposableListPath(): string | null {
  const candidates = [
    join(__dirname, '..', 'data', 'disposable-domains.json'),
    join(
      process.cwd(),
      'dist',
      'modules',
      'bulk-email-verification',
      'data',
      'disposable-domains.json',
    ),
    join(
      process.cwd(),
      'src',
      'modules',
      'bulk-email-verification',
      'data',
      'disposable-domains.json',
    ),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function loadDisposableDomains(extraPath?: string): Set<string> {
  const set = new Set<string>();

  const builtinPath = resolveBuiltinDisposableListPath();
  if (builtinPath) {
    for (const domain of readDomainsFromJsonFile(builtinPath)) {
      set.add(domain);
    }
  }

  if (extraPath) {
    for (const domain of readDomainsFromJsonFile(resolve(extraPath))) {
      set.add(domain);
    }
  }

  return set;
}

export function initDisposableDomains(extraPath?: string): void {
  domainSet = loadDisposableDomains(extraPath);
}

export function isDisposableDomain(domain: string): boolean {
  if (!domainSet) {
    domainSet = loadDisposableDomains();
  }
  const normalized = domain.trim().toLowerCase();
  if (domainSet.has(normalized)) return true;

  const parts = normalized.split('.');
  for (let i = 1; i < parts.length; i += 1) {
    const parent = parts.slice(i).join('.');
    if (domainSet.has(parent)) return true;
  }
  return false;
}

export function disposableDomainCount(): number {
  if (!domainSet) domainSet = loadDisposableDomains();
  return domainSet.size;
}
