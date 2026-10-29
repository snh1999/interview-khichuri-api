import { lookup as dnsLookup } from "node:dns";
import { lookup as resolveHost } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import { BadRequestException } from "@nestjs/common";
import { Agent, fetch as undiciFetch } from "undici";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

const HOST_NOT_ALLOWED = "Base URL host is not allowed";

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

/** Expands an IPv6 literal to eight numeric groups; null when it is not one. */
const ipv6Groups = (value: string): number[] | null => {
  const parts = value.split("::");
  if (parts.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (!part) return [];
    const groups = part.split(":");
    if (!groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group))) return null;
    return groups.map((group) => parseInt(group, 16));
  };

  const hasTail = parts.length === 2;
  const left = parseGroups(parts[0]);
  const right = parseGroups(hasTail ? parts[1] : "");
  if (!left || !right) return null;
  if (!hasTail) return left.length === 8 ? left : null;

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
};

const ipv4FromGroups = (high: number, low: number): string =>
  `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;

const isPrivateIpv6 = (ip: string): boolean => {
  const value = ip.toLowerCase();

  // Dotted form, e.g. ::ffff:10.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(value);
  if (mapped) {
    return isPrivateIpv4(mapped[1]);
  }

  const groups = ipv6Groups(value);
  // Unparseable: block (fail closed).
  if (!groups) {
    return true;
  }

  const allZero = (from: number, to: number): boolean =>
    groups.slice(from, to).every((group) => group === 0);

  // ::/96 (covers :: and ::1) and IPv4-compatible
  if (allZero(0, 6)) {
    return isPrivateIpv4(ipv4FromGroups(groups[6], groups[7]));
  }
  // ::ffff:0:0/96 (hex IPv4-mapped)
  if (allZero(0, 5) && groups[5] === 0xffff) {
    return isPrivateIpv4(ipv4FromGroups(groups[6], groups[7]));
  }
  // 64:ff9b::/96 (NAT64)
  if (groups[0] === 0x64 && groups[1] === 0xff9b && allZero(2, 6)) {
    return isPrivateIpv4(ipv4FromGroups(groups[6], groups[7]));
  }
  // 2002::/16 (6to4): IPv4 is in groups 1 and 2
  if (groups[0] === 0x2002) {
    return isPrivateIpv4(ipv4FromGroups(groups[1], groups[2]));
  }

  const first = groups[0];
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 // ff00::/8 multicast
  );
};

export const isPrivateIp = (ip: string): boolean => {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip);
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }
  return true;
};

export const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");

  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
};

export const assertSafeProviderBaseUrl = async (
  value: string,
): Promise<string> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("Base URL is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new BadRequestException("Base URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new BadRequestException("Base URL must not include credentials");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");
  if (isBlockedHostname(hostname)) {
    throw new BadRequestException(HOST_NOT_ALLOWED);
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestException(HOST_NOT_ALLOWED);
    }
  } else {
    let addresses: { address: string }[];
    try {
      addresses = await resolveHost(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException("Base URL host could not be resolved");
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateIp(address))
    ) {
      throw new BadRequestException(HOST_NOT_ALLOWED);
    }
  }

  return url.toString().replace(/\/+$/u, "");
};

const PROVIDER_CONNECT_TIMEOUT_MS = 10_000;
const PROVIDER_HEADERS_TIMEOUT_MS = 60_000;
const PROVIDER_BODY_IDLE_TIMEOUT_MS = 60_000;

// Checks the IP that is actually connected to, so validation and connect
// cannot disagree (closes the DNS rebinding window).
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err, address, family);
      return;
    }
    const list = Array.isArray(address) ? address : [{ address, family }];
    if (list.some((entry) => isPrivateIp(entry.address))) {
      callback(new Error(HOST_NOT_ALLOWED), address, family);
      return;
    }
    callback(null, address, family);
  });
};

const guardedAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: PROVIDER_CONNECT_TIMEOUT_MS },
  headersTimeout: PROVIDER_HEADERS_TIMEOUT_MS,
  bodyTimeout: PROVIDER_BODY_IDLE_TIMEOUT_MS,
});

// Validates on every request: the host can rebind DNS after saving, and
// manual redirects stop a public host from bouncing into the private network.
export const safeProviderFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  const url = input instanceof Request ? input.url : input.toString();
  await assertSafeProviderBaseUrl(url);
  const response = await undiciFetch(input, {
    ...init,
    redirect: "manual",
    dispatcher: guardedAgent,
  });
  return response;
};
