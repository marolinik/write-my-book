import "dotenv/config";
import { existsSync } from "node:fs";

interface Issue {
  key: string;
  message: string;
}

const ci = process.env.CI === "true";
const productionRuntime = process.env.NODE_ENV === "production" && !ci;
const placeholderPattern = /placeholder|changeme|replace_me|ci-placeholder|your[_-]|example/i;
const issues: Issue[] = [];

function value(key: string) {
  return process.env[key]?.trim() ?? "";
}

function requireValue(key: string) {
  const current = value(key);
  if (!current) {
    issues.push({ key, message: "Missing required database deploy variable" });
    return "";
  }
  if (productionRuntime && placeholderPattern.test(current)) {
    issues.push({ key, message: "Placeholder value is not allowed for production database deploy" });
  }
  return current;
}

const databaseUrl = requireValue("DATABASE_URL");

if (!existsSync("prisma/schema.prisma")) {
  issues.push({ key: "prisma/schema.prisma", message: "Prisma schema file not found" });
}

if (databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      issues.push({ key: "DATABASE_URL", message: "DATABASE_URL must be a PostgreSQL URL" });
    }
    if (productionRuntime && ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
      issues.push({ key: "DATABASE_URL", message: "Production database deploy must not target a local host" });
    }
  } catch {
    issues.push({ key: "DATABASE_URL", message: "DATABASE_URL is not a valid URL" });
  }
}

if (productionRuntime) {
  if (value("DB_DEPLOY_APPROVED") !== "true") {
    issues.push({ key: "DB_DEPLOY_APPROVED", message: "Set DB_DEPLOY_APPROVED=true after reviewing schema changes" });
  }

  const backupAt = requireValue("DB_BACKUP_CONFIRMED_AT");
  requireValue("DB_BACKUP_LOCATION");

  if (backupAt) {
    const ms = Date.parse(backupAt);
    if (Number.isNaN(ms)) {
      issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Must be an ISO timestamp" });
    } else {
      const ageMinutes = (Date.now() - ms) / 60_000;
      if (ageMinutes < -5) {
        issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Backup timestamp is in the future" });
      }
      if (ageMinutes > 120) {
        issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Backup confirmation is older than 2 hours" });
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Database deploy preflight failed:");
  for (const issue of issues) console.error(`- ${issue.key}: ${issue.message}`);
  process.exit(1);
}

console.log(`Database deploy preflight OK (NODE_ENV=${process.env.NODE_ENV ?? "development"}, CI=${ci})`);
if (ci) console.log("CI mode: schema file and DATABASE_URL contract checked; production backup confirmation not required.");
