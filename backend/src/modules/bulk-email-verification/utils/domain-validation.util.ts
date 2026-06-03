import * as dns from 'dns/promises';
import { Resolver } from 'dns/promises';
import { isValidDomainFormat, normalizeDomain } from './email-patterns.util';
import { resolvePositiveInt } from './config-numbers.util';

export interface DomainMxResult {
  domain: string;
  valid: boolean;
  mxHosts: string[];
  error?: string;
}

interface CacheEntry {
  expiresAt: number;
  result: DomainMxResult;
}

const mxCache = new Map<string, CacheEntry>();

/** Fast resolvers first — avoid 30s+ sequential lookups under load. */
const FAST_RESOLVERS = [
  ['8.8.8.8', '8.8.4.4'],
  ['1.1.1.1', '1.0.0.1'],
];

const RESOLVE_TIMEOUT_MS = 4_000;
const RESOLVE_TRIES = 2;

function normalizeMxHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function isNullMxHost(host: string): boolean {
  const h = normalizeMxHost(host);
  return h === '.' || h === '' || h === '0.0.0.0';
}

function cacheResult(
  key: string,
  result: DomainMxResult,
  positiveTtlMs: number,
  negativeTtlMs: number,
): DomainMxResult {
  const ttl = result.valid
    ? positiveTtlMs
    : result.error === 'no_mx' || result.error === 'null_mx'
      ? negativeTtlMs
      : 45_000;
  mxCache.set(key, { expiresAt: Date.now() + ttl, result });
  return result;
}

function buildMxResult(domain: string, mxHosts: string[], error?: string): DomainMxResult {
  const unique = [...new Set(mxHosts.map(normalizeMxHost).filter((h) => h && !isNullMxHost(h)))];
  return {
    domain,
    valid: unique.length > 0,
    mxHosts: unique,
    error,
  };
}

function parseMxRecords(records: Array<{ priority: number; exchange: string }>): string[] {
  return [...records]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => normalizeMxHost(r.exchange))
    .filter((h) => h && !isNullMxHost(h));
}

async function resolveMxWithServers(domain: string, servers: string[]): Promise<string[]> {
  const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT_MS, tries: RESOLVE_TRIES });
  resolver.setServers(servers);
  try {
    const mx = await resolver.resolveMx(domain);
    return parseMxRecords(mx);
  } catch {
    return [];
  }
}

async function resolveMxViaDoH(domain: string): Promise<string[]> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
      const res = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const json = (await res.json()) as {
        Answer?: Array<{ type: number; data: string }>;
        Status?: number;
      };
      if (json.Status !== 0 || !json.Answer?.length) continue;

      const hosts: string[] = [];
      for (const answer of json.Answer) {
        if (answer.type !== 15) continue;
        const data = answer.data.trim();
        const space = data.indexOf(' ');
        const host = space >= 0 ? data.slice(space + 1) : data;
        const normalized = normalizeMxHost(host);
        if (normalized && !isNullMxHost(normalized)) hosts.push(normalized);
      }
      if (hosts.length) return hosts;
    } catch {
      // next provider
    }
  }
  return [];
}

async function lookupMxHosts(domain: string): Promise<{ hosts: string[]; source: string }> {
  for (const servers of FAST_RESOLVERS) {
    const hosts = await resolveMxWithServers(domain, servers);
    if (hosts.length) return { hosts, source: 'mx' };
  }

  try {
    const system = parseMxRecords(await dns.resolveMx(domain));
    if (system.length) return { hosts: system, source: 'mx_system' };
  } catch {
    // continue
  }

  const dohHosts = await resolveMxViaDoH(domain);
  if (dohHosts.length) return { hosts: dohHosts, source: 'doh_mx' };

  return { hosts: [], source: 'none' };
}

export async function validateDomainMx(
  domain: string,
  cacheTtlMs: number,
  negativeCacheTtlMs?: number,
): Promise<DomainMxResult> {
  const normalized = normalizeDomain(domain);
  const positiveTtl = resolvePositiveInt(cacheTtlMs, 3_600_000);
  const negativeTtl = resolvePositiveInt(negativeCacheTtlMs, 120_000);

  if (!normalized || !isValidDomainFormat(normalized)) {
    return buildMxResult(normalized, [], 'invalid_format');
  }

  const cached = mxCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const { hosts, source } = await lookupMxHosts(normalized);
  if (hosts.length > 0) {
    return cacheResult(normalized, buildMxResult(normalized, hosts, source), positiveTtl, negativeTtl);
  }

  return cacheResult(
    normalized,
    buildMxResult(normalized, [], 'no_mx'),
    positiveTtl,
    negativeTtl,
  );
}

export function clearDomainMxCache(): void {
  mxCache.clear();
}
