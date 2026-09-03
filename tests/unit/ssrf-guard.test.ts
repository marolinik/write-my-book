import { describe, it, expect } from "vitest";
import { assertSafeExternalUrl } from "@/lib/ssrf-guard";

/**
 * SSRF guard policy tests (launch hardening C1/C2). DNS-backed hostnames are
 * exercised only in the always-blocked-literal sense; numeric literals give
 * deterministic coverage of every range rule without network access.
 */
describe("assertSafeExternalUrl", () => {
  const expectBlocked = async (url: string, allowPrivate = false) => {
    await expect(assertSafeExternalUrl(url, { allowPrivate })).rejects.toThrow();
  };

  it("blocks cloud metadata in every shape", async () => {
    await expectBlocked("http://169.254.169.254/latest/meta-data/iam/security-credentials/#");
    await expectBlocked("http://169.254.169.254/latest/meta-data/", true); // literal stays blocked even w/ private opt-in
    await expectBlocked("http://169.254.169.254.nip.io/x"); // strict: resolvable-or-not, it never passes
    await expectBlocked("http://[fd00:ec2::254]/x");
  });

  it("blocks loopback and private ranges by default", async () => {
    await expectBlocked("http://127.0.0.1:6379/");
    await expectBlocked("http://localhost:3000/admin");
    await expectBlocked("http://10.33.0.153:8888/v1");
    await expectBlocked("http://192.168.1.5:11434/v1");
    await expectBlocked("http://172.16.0.9/x");
    await expectBlocked("http://vllm.local/v1");
    await expectBlocked("http://[::1]:6379/");
    await expectBlocked("http://redis/x"); // single-label host, no dot → internal
  });

  it("keeps always-block ranges blocked even with private opt-in", async () => {
    await expectBlocked("http://169.254.10.10/x", true); // link-local
    await expectBlocked("http://0.0.0.0/x", true);
    await expectBlocked("http://224.0.0.1/x", true); // multicast
    await expectBlocked("http://[fe80::1]/x", true);
  });

  it("allows private LAN ranges only under the self-host opt-in", async () => {
    // Literal IPs need no DNS.
    await expect(
      assertSafeExternalUrl("http://10.33.0.153:8888/v1", { allowPrivate: true })
    ).resolves.toBeDefined();
    await expect(
      assertSafeExternalUrl("http://192.168.1.5:11434/v1", { allowPrivate: true })
    ).resolves.toBeDefined();
  });

  it("blocks non-http schemes and embedded credentials", async () => {
    await expectBlocked("file:///etc/passwd");
    await expectBlocked("gopher://10.0.0.1:11211/");
    await expectBlocked("http://user:pass@8.8.8.8/");
  });

  it("blocks IPv4 smuggled through IPv6 forms", async () => {
    await expectBlocked("http://[::ffff:169.254.169.254]/x"); // mapped metadata
    await expectBlocked("http://[::ffff:127.0.0.1]/x"); // mapped loopback (strict)
    await expectBlocked("http://[2002:7f00:0001::]/x"); // 6to4 → 127.0.0.1
    await expectBlocked("http://[2001:0000:1234:5678::1]/x"); // teredo
  });
});
