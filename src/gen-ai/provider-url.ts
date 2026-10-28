import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { BadRequestException } from "@nestjs/common";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

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

const isPrivateIpv6 = (ip: string): boolean => {
  const value = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(value);
  if (mapped) {
    return isPrivateIpv4(mapped[1]);
  }

  // URL parsing rewrites `::ffff:10.0.0.1` to `::ffff:a00:1`, so the dotted
  // form above never sees it; without this a mapped private address gets in.
  const groups = ipv6Groups(value);
  if (
    groups &&
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    const high = groups[6];
    const low = groups[7];
    return isPrivateIpv4(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
    );
  }

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff")
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

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new BadRequestException("Base URL host is not allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new BadRequestException("Base URL host is not allowed");
    }
  } else {
    // ponytail: only the initial lookup is checked. A host that redirects or
    // rebinds DNS to a private address can still bypass this; pin the resolved
    // IP or route through an egress proxy if that threat matters.
    let addresses: { address: string }[];
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException("Base URL host could not be resolved");
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateIp(address))
    ) {
      throw new BadRequestException("Base URL host is not allowed");
    }
  }

  return url.toString().replace(/\/+$/u, "");
};

// Validates on every request, not just when the URL is saved: the host can
// rebind DNS after saving, and manual redirects stop a public host from
// bouncing the server into the private network.
export const safeProviderFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  const url = input instanceof Request ? input.url : input.toString();
  await assertSafeProviderBaseUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Provider request timed out"));
  }, 60_000);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetch(input, { ...init, redirect: "manual", signal });
  } finally {
    clearTimeout(timeout);
  }
};
