export interface DbDeployIssue {
  key: string;
  message: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "postgres"]);
const PLACEHOLDER = /placeholder|changeme|replace_me|ci-placeholder|your[_-]|example/i;
const MAX_BACKUP_AGE_MINUTES = 120;

/**
 * What blocks a schema deploy against `env.DATABASE_URL` (P1-18). Approval and
 * a fresh backup are required whenever the target is a remote host, whatever
 * NODE_ENV the operator's shell exports (they used to apply only with
 * NODE_ENV=production). A local or compose-internal database needs neither.
 */
export function dbDeployIssues(env: Record<string, string | undefined>, now: Date = new Date()): DbDeployIssue[] {
  const issues: DbDeployIssue[] = [];
  const value = (key: string) => env[key]?.trim() ?? "";
  const databaseUrl = value("DATABASE_URL");
  if (!databaseUrl) return [{ key: "DATABASE_URL", message: "Missing required database deploy variable" }];

  let host: string;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return [{ key: "DATABASE_URL", message: "DATABASE_URL must be a PostgreSQL URL" }];
    }
    host = parsed.hostname;
  } catch {
    return [{ key: "DATABASE_URL", message: "DATABASE_URL is not a valid URL" }];
  }
  if (LOCAL_HOSTS.has(host)) return issues;

  if (PLACEHOLDER.test(databaseUrl)) {
    issues.push({ key: "DATABASE_URL", message: "Placeholder value is not allowed for a remote database deploy" });
  }
  if (value("DB_DEPLOY_APPROVED") !== "true") {
    issues.push({ key: "DB_DEPLOY_APPROVED", message: "Set DB_DEPLOY_APPROVED=true after reviewing prisma/pending-change.sql" });
  }
  const location = value("DB_BACKUP_LOCATION");
  if (!location) issues.push({ key: "DB_BACKUP_LOCATION", message: "Record where the pre-deploy backup is" });
  const backupAt = value("DB_BACKUP_CONFIRMED_AT");
  if (!backupAt) {
    issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Record when the pre-deploy backup was taken (ISO time)" });
  } else {
    const ms = Date.parse(backupAt);
    if (Number.isNaN(ms)) {
      issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Must be an ISO timestamp" });
    } else {
      const ageMinutes = (now.getTime() - ms) / 60_000;
      if (ageMinutes < -5) issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Backup timestamp is in the future" });
      if (ageMinutes > MAX_BACKUP_AGE_MINUTES) {
        issues.push({ key: "DB_BACKUP_CONFIRMED_AT", message: "Backup confirmation is older than 2 hours" });
      }
    }
  }
  return issues;
}
