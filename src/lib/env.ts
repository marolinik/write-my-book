/**
 * Server-side runtime environment validation.
 *
 * CI/builds may use harmless placeholders so TypeScript/Next can compile.
 * Real production runtime must provide real values through the deployment
 * platform; placeholder values fail closed when CI !== "true".
 */

export type RuntimeTarget = "web" | "worker" | "ci";
export type EnvSeverity = "error" | "warning";

export interface EnvIssue {
  key: string;
  severity: EnvSeverity;
  message: string;
}

export interface EnvValidationResult {
  ok: boolean;
  target: RuntimeTarget;
  nodeEnv: string;
  ci: boolean;
  issues: EnvIssue[];
  checkedAt: string;
}

const REQUIRED_WEB_ENV = [
  "DATABASE_URL",
  "API_KEY_ENCRYPTION_SECRET",
  "REDIS_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_FOUNDER_MONTHLY_PRICE_ID",
  "STRIPE_INDIE_MONTHLY_PRICE_ID",
  "STRIPE_INDIE_ANNUAL_PRICE_ID",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
  "STRIPE_PRO_ANNUAL_PRICE_ID",
  "STRIPE_PUBLISHER_MONTHLY_PRICE_ID",
  "STRIPE_PUBLISHER_ANNUAL_PRICE_ID",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
] as const;

const REQUIRED_WORKER_ENV = [
  "DATABASE_URL",
  "API_KEY_ENCRYPTION_SECRET",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
] as const;

const OPTIONAL_PRODUCTION_ENV = [
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "NEXT_PUBLIC_SENTRY_DSN",
  "QDRANT_URL",
  "NEO4J_URI",
] as const;

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /changeme/i,
  /replace_me/i,
  /ci-placeholder/i,
  /your[_-]/i,
  /example/i,
];

function isMissing(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function isPlaceholder(value: string | undefined): boolean {
  if (isMissing(value)) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value ?? ""));
}

function redactedUrlHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function requiredKeysFor(target: RuntimeTarget): readonly string[] {
  if (target === "worker") return REQUIRED_WORKER_ENV;
  if (target === "ci") return ["DATABASE_URL"];
  return REQUIRED_WEB_ENV;
}

export function validateEnv(target: RuntimeTarget = "web"): EnvValidationResult {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const ci = process.env.CI === "true";
  const productionRuntime = nodeEnv === "production" && !ci;
  const issues: EnvIssue[] = [];

  for (const key of requiredKeysFor(target)) {
    const value = process.env[key];
    if (isMissing(value)) {
      issues.push({ key, severity: productionRuntime ? "error" : "warning", message: "Missing required environment variable" });
      continue;
    }
    if (productionRuntime && isPlaceholder(value)) {
      issues.push({ key, severity: "error", message: "Placeholder value is not allowed in production runtime" });
    }
  }

  if (productionRuntime) {
    if (process.env["DEV_AUTH_BYPASS"] === "true") {
      issues.push({ key: "DEV_AUTH_BYPASS", severity: "error", message: "DEV_AUTH_BYPASS must be disabled in production" });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        const parsed = new URL(appUrl);
        const local = ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
        if (parsed.protocol !== "https:" && !local) {
          issues.push({ key: "NEXT_PUBLIC_APP_URL", severity: "error", message: "Production app URL must use HTTPS" });
        }
      } catch {
        issues.push({ key: "NEXT_PUBLIC_APP_URL", severity: "error", message: "Invalid URL" });
      }
    }

    const dbHost = redactedUrlHost(process.env.DATABASE_URL);
    if (!dbHost) {
      issues.push({ key: "DATABASE_URL", severity: "error", message: "Invalid database URL" });
    }

    for (const key of OPTIONAL_PRODUCTION_ENV) {
      if (isMissing(process.env[key])) {
        issues.push({ key, severity: "warning", message: "Optional production integration is not configured" });
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    target,
    nodeEnv,
    ci,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export function assertEnvReady(target: RuntimeTarget = "web"): EnvValidationResult {
  const result = validateEnv(target);
  if (!result.ok) {
    const details = result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.key}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid production environment (${target}): ${details}`);
  }
  return result;
}

export function envHealth(target: RuntimeTarget = "web") {
  const result = validateEnv(target);
  return {
    ok: result.ok,
    target: result.target,
    nodeEnv: result.nodeEnv,
    ci: result.ci,
    checkedAt: result.checkedAt,
    errors: result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => ({ key: issue.key, message: issue.message })),
    warnings: result.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => ({ key: issue.key, message: issue.message })),
  };
}
