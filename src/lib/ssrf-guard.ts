/**
 * SSRF guard — shared URL policy for every server-side fetch of a
 * user/LLM-supplied URL (custom OpenAI-compatible providers, the
 * FetchWebPage agent tool).
 *
 * Threat: an attacker-supplied URL turns our own server into a proxy into
 * the internal network — cloud metadata (169.254.169.254 → IAM creds),
 * Redis/Postgres/Neo4j admin ports, internal dashboards. A blind fetch is
 * still exploitable via status/error oracles; a fetching tool that returns
 * the body (FetchWebPage) is full-read exfiltration.
 *
 * Policy:
 * - http/https only, no embedded credentials;
 * - hostname resolved via DNS and EVERY returned address checked against
 *   blocklisted ranges (IPv4 + IPv6, incl. IPv4-mapped and 6to4 carriers);
 * - link-local/metadata (169.254.0.0/16, fe80::/10), multicast, reserved,
 *   and unspecified ranges are blocked UNCONDITIONALLY;
 * - private LAN ranges (RFC1918, loopback, ULA, CGNAT/Tailscale, .local /
 *   .internal names) are blocked too, except for the saved-model-provider
 *   path where a self-hosting operator opts in once with
 *   WMB_ALLOW_PRIVATE_MODEL_HOSTS=1 (LAN vLLM boxes are a supported
 *   feature; multi-tenant/hosted deployments must leave this off);
 * - redirects are never followed implicitly: `safeExternalFetch` uses
 *   `redirect: "manual"` and re-validates every hop (max 3).
 *
 * Residual risk (documented, accepted at launch): between the DNS check and
 * the socket connect an attacker-controlled DNS zone could rebind to an
 * internal address. Full closure needs connection-time IP pinning (custom
 * undici Connector). The rebinding payoff only exists where private ranges
 * are already opted-in, and metadata/link-local stay blocked regardless.
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Deployment-wide opt-in for private-IP LLM endpoints (self-hosters only). */
export function allowPrivateModelHosts(): boolean {
  return process.env.WMB_ALLOW_PRIVATE_MODEL_HOSTS === "1";
}

function parseOctets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function v4Blocked(ip: string, allowPrivate: boolean): boolean {
  const o = parseOctets(ip);
  if (!o) return true; // malformed → block
  const [a, b] = o;
  // Always-blocked, even for opted-in private hosts:
  if (a === 0) return true; // "this" network / 0.0.0.0
  if (a === 169 && b === 254) return true; // link-local incl. cloud IMDS
  if (a === 192 && b === 0 && (o[2] === 0 || o[2] === 2)) return true; // IETF-assigned / TEST-NET-1
  if (a === 198 && (b === 16 || b === 17 || (b >= 18 && b <= 19))) return true; // TEST-NET / benchmarking
  if (a >= 224) return true; // multicast + reserved
  // Private ranges — opt-in territory:
  if (a === 127) return !allowPrivate; // loopback
  if (a === 10) return !allowPrivate; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return !allowPrivate; // RFC1918
  if (a === 192 && b === 168) return !allowPrivate; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return !allowPrivate; // CGNAT (Tailscale etc.)
  return false;
}

function hexGroup(s: string, start: number, len = 4): number {
  return parseInt(s.slice(start, start + len), 16) || 0;
}

function hexToOctets(hexGroup: string): [number, number] {
  const g = parseInt(hexGroup.padStart(4, "0"), 16);
  return [(g >> 8) & 0xff, g & 0xff];
}

function v6Blocked(ip: string, allowPrivate: boolean): boolean {
  const s = ip.toLowerCase().split("%")[0];
  if (!s) return true;
  if (s === "::") return true; // unspecified
  if (s === "::1") return !allowPrivate; // loopback
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true; // link-local fe80::/10 — always blocked
  if (s.startsWith("ff")) return true; // multicast
  if (s.startsWith("fc") || s.startsWith("fd")) return !allowPrivate; // ULA fc00::/7

  // IPv4-mapped ::ffff:a.b.c.d (and the bare ::a.b.c.d form)
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/) || s.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return v4Blocked(mapped[1], allowPrivate);

  // 6to4 2002::/16 embeds the IPv4 address in the next two groups
  if (s.startsWith("2002:")) {
    const m = s.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/);
    if (m) {
      const [a, b] = hexToOctets(m[1]);
      const [c, d] = hexToOctets(m[2]);
      return v4Blocked(`${a}.${b}.${c}.${d}`, allowPrivate);
    }
    return true;
  }

  // Teredo 2001:0000::/32 smuggles v4 addresses in client/computed form —
  // no legitimate use for model endpoints or web research; block outright.
  if (/^2001:0{0,3}0::/.test(s) || s.startsWith("2001:0")) return true;

  return false;
}

function ipBlocked(ip: string, allowPrivate: boolean): boolean {
  const kind = isIP(ip);
  if (kind === 6) return v6Blocked(ip, allowPrivate);
  if (kind === 4) return v4Blocked(ip, allowPrivate);
  return true; // not an IP → block by default
}

/**
 * Validate a user/LLM-supplied URL. Throws UnsafeUrlError when the URL (or
 * any address its hostname resolves to) points at internal ranges.
 * Returns the parsed URL when safe.
 */
export async function assertSafeExternalUrl(
  raw: string,
  opts: { allowPrivate?: boolean } = {}
): Promise<URL> {
  const allowPrivate = opts.allowPrivate ?? false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("Hostname is missing");

  const isInternalName =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".");

  if (isInternalName) {
    if (!allowPrivate) {
      throw new UnsafeUrlError("Private/internal hostnames are not allowed");
    }
    // Opt-in self-host territory: name-based LAN hosts are the supported
    // feature (e.g. vllm.local); resolved IPs still must dodge always-block
    // ranges below when resolvable.
  }

  let ips: string[] = [];
  if (isIP(host)) {
    ips = [host];
  } else {
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      ips = records.map((r) => r.address);
    } catch {
      if (allowPrivate) return url; // unresolvable private name w/ opt-in: let the OS resolver try
      throw new UnsafeUrlError("Hostname does not resolve");
    }
  }
  if (ips.length === 0) throw new UnsafeUrlError("Hostname does not resolve");

  for (const ip of ips) {
    if (ipBlocked(ip, allowPrivate)) {
      throw new UnsafeUrlError(
        "That address is a private or internal range and cannot be used"
      );
    }
  }
  return url;
}

/**
 * fetch() with the URL policy applied to the initial URL AND every redirect
 * hop (redirects are followed manually, max `maxRedirects` by default 3).
 */
export async function safeExternalFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { allowPrivate?: boolean; maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 3;
  let next = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertSafeExternalUrl(next, opts);
    const res = await fetch(url.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      next = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects");
}

/**
 * Read a response body as text with a hard byte ceiling — enforced DURING
 * the read (streaming), not after buffering. Oversized bodies are cancelled.
 */
export async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new UnsafeUrlError(`Response larger than ${Math.floor(maxBytes / 1024)}KB`);
  }
  if (!res.body) {
    const text = await res.text();
    if (text.length > maxBytes) throw new UnsafeUrlError(`Response larger than ${Math.floor(maxBytes / 1024)}KB`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new UnsafeUrlError(`Response larger than ${Math.floor(maxBytes / 1024)}KB`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}
