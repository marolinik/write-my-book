// P1-21 / D8: manuscripts (MinIO) and their Postgres dumps lived on one host
// volume and nothing copied them off the host. An offsite-mirror service now
// mirrors the whole bucket to an off-host S3 target (Backblaze B2, EU), refuses
// to run without its OFFSITE_* settings, and checks the offsite copy is fresh.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const compose = readFileSync(join(ROOT, "docker-compose.prod.yml"), "utf-8");

function service(name: string): string {
  const start = compose.indexOf(`\n  ${name}:`);
  expect(start).toBeGreaterThan(-1);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\r?\n {2}[a-z][\w-]*:\r?\n/);
  return next > 0 ? rest.slice(0, next) : rest;
}

describe("offsite-mirror", () => {
  const mirror = service("offsite-mirror");

  it("mirrors the whole manuscript bucket, deletions included, to the offsite target", () => {
    expect(mirror).toMatch(/mc mirror[^\n]*--remove[^\n]*wmb\/wmb-projects offsite\//);
  });

  it("uses the pinned object-store client image", () => {
    expect(mirror).toMatch(/image: ghcr\.io\/marolinik\/wmb-mc@sha256:[0-9a-f]{64}/);
  });

  it("refuses to run without its OFFSITE_* settings", () => {
    for (const key of ["OFFSITE_S3_ENDPOINT", "OFFSITE_S3_BUCKET", "OFFSITE_S3_ACCESS_KEY_ID", "OFFSITE_S3_SECRET_ACCESS_KEY"]) {
      expect(mirror).toContain(key);
    }
    expect(mirror).toContain("OFFSITE MIRROR NOT CONFIGURED");
    expect(mirror).toMatch(/exit 1/);
  });

  it("checks that the offsite copy holds a recent hourly dump", () => {
    expect(mirror).toMatch(/mc find offsite\/[^\n]*backups\/hourly[^\n]*--newer-than/);
    expect(mirror).toContain("OFFSITE STALE");
  });
});

describe("operator docs", () => {
  it(".env.example names the offsite settings", () => {
    const env = readFileSync(join(ROOT, ".env.example"), "utf-8");
    expect(env).toMatch(/OFFSITE_S3_ENDPOINT=/);
    expect(env).toMatch(/OFFSITE_S3_BUCKET=/);
  });

  it("the launch doc makes the offsite mirror a blocking step", () => {
    const launch = readFileSync(join(ROOT, "docs", "LAUNCH-2026-10.md"), "utf-8");
    expect(launch).toMatch(/offsite mirror[^\n]*blocking/i);
  });
});
