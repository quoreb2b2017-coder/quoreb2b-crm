import * as dns from 'dns/promises';
import { Resolver } from 'dns/promises';
import { isValidDomainFormat, normalizeDomain } from './email-patterns.util';
import { validateDomainMx, DomainMxCacheStore, DomainMxResult } from './domain-validation.util';
import { resolvePositiveInt } from './config-numbers.util';

export interface DomainDnsResult extends DomainMxResult {
  domainExists: boolean;
  hasDnsRecords: boolean;
}

const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];

let publicResolver: Resolver | null = null;

function getPublicResolver(): Resolver {
  if (!publicResolver) {
    publicResolver = new Resolver();
    publicResolver.setServers(PUBLIC_DNS);
  }
  return publicResolver;
}

async function domainHasAnyDnsRecords(domain: string): Promise<boolean> {
  const resolver = getPublicResolver();
  const checks = [
    () => resolver.resolve4(domain).then((r) => r.length > 0),
    () => resolver.resolve6(domain).then((r) => r.length > 0),
    () => resolver.resolveMx(domain).then((r) => r.length > 0),
    () => resolver.resolveTxt(domain).then((r) => r.length > 0),
    () => resolver.resolveNs(domain).then((r) => r.length > 0),
    () => dns.resolve4(domain).then((r) => r.length > 0),
    () => dns.resolveNs(domain).then((r) => r.length > 0),
  ];

  for (const check of checks) {
    try {
      if (await check()) return true;
    } catch {
      // try next record type
    }
  }

  return false;
}

export async function validateDomainDns(
  domain: string,
  cacheTtlMs: number,
  negativeCacheTtlMs?: number,
  cacheStore?: DomainMxCacheStore,
): Promise<DomainDnsResult> {
  const normalized = normalizeDomain(domain);
  const negativeTtl = resolvePositiveInt(
    negativeCacheTtlMs,
    resolvePositiveInt(undefined, 300_000),
  );

  if (!isValidDomainFormat(normalized)) {
    return {
      domain: normalized,
      valid: false,
      domainExists: false,
      hasDnsRecords: false,
      mxHosts: [],
      error: 'invalid_format',
    };
  }

  const mx = await validateDomainMx(normalized, cacheTtlMs, negativeTtl, cacheStore);
  if (mx.valid) {
    return {
      ...mx,
      domainExists: true,
      hasDnsRecords: true,
    };
  }

  const domainExists = await domainHasAnyDnsRecords(normalized);

  return {
    domain: normalized,
    valid: false,
    domainExists,
    hasDnsRecords: domainExists,
    mxHosts: [],
    error: mx.error === 'dns_error' ? 'dns_error' : domainExists ? 'no_mx' : 'domain_not_found',
  };
}
