// P1-18: the deploy preflight enforced approval and a fresh backup only when
// NODE_ENV=production was exported in the operator's shell, and the documented
// fallback was `db push --accept-data-loss`, which accepts every destructive
// change. The preflight now keys on the database host, and production schema
// changes are a reviewed SQL diff.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dbDeployIssues } from "@/lib/deploy/db-deploy-preflight";

const NOW = new Date("2026-11-11T12:00:00Z");
const REMOTE = "postgresql://wmb:secret@db.hetzner.internal:5432/wmb";

describe("dbDeployIssues", () => {
  it("enforces approval and a fresh backup for a remote database even with NODE_ENV unset", () => {
    const keys = dbDeployIssues({ DATABASE_URL: REMOTE }, NOW).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["DB_DEPLOY_APPROVED", "DB_BACKUP_CONFIRMED_AT", "DB_BACKUP_LOCATION"]));
  });

  it("passes a remote deploy that is approved with a backup from the last two hours", () => {
    const issues = dbDeployIssues(
      {
        DATABASE_URL: REMOTE,
        DB_DEPLOY_APPROVED: "true",
        DB_BACKUP_CONFIRMED_AT: "2026-11-11T11:30:00Z",
        DB_BACKUP_LOCATION: "b2://wmb-offsite/dumps/2026-11-11T1130.sql.gz",
      },
      NOW
    );
    expect(issues).toEqual([]);
  });

  it("rejects a backup older than two hours", () => {
    const keys = dbDeployIssues(
      {
        DATABASE_URL: REMOTE,
        DB_DEPLOY_APPROVED: "true",
        DB_BACKUP_CONFIRMED_AT: "2026-11-11T08:00:00Z",
        DB_BACKUP_LOCATION: "b2://x",
      },
      NOW
    ).map((i) => i.key);
    expect(keys).toContain("DB_BACKUP_CONFIRMED_AT");
  });

  it("skips approval and backup for a local database", () => {
    expect(dbDeployIssues({ DATABASE_URL: "postgresql://wmb:wmb@localhost:5432/wmb" }, NOW)).toEqual([]);
  });
});

describe("no forced schema push anywhere", () => {
  const ROOT = join(__dirname, "..", "..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "superpowers" ? [] : files(full);
      return /\.(md|ts|json|yml|sh)$/.test(name) ? [full] : [];
    });

  it("no doc, script or package script tells anyone to --accept-data-loss", () => {
    const offenders = [...files(join(ROOT, "docs")), ...files(join(ROOT, "scripts")), join(ROOT, "package.json")].filter(
      (file) => readFileSync(file, "utf-8").includes("--accept-data-loss")
    );
    expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
  });

  it("production schema changes go through a reviewed diff", () => {
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).scripts as Record<string, string>;
    expect(scripts["db:diff"]).toContain("prisma migrate diff");
    expect(scripts["db:apply"]).toContain("repair-duplicate-documents.ts --execute");
    expect(scripts["db:push:prod"] ?? "").not.toContain("db push");
  });
});
