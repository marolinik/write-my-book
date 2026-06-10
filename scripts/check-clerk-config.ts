import "dotenv/config";

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

function requireValue(key: string, pattern?: RegExp, description?: string) {
  const current = value(key);
  if (!current) {
    issues.push({ key, message: "Missing required Clerk auth variable" });
    return;
  }
  if (productionRuntime && placeholderPattern.test(current)) {
    issues.push({ key, message: "Placeholder value is not allowed in production runtime" });
  }
  if (productionRuntime && pattern && !pattern.test(current)) {
    issues.push({ key, message: `Expected ${description ?? pattern.source}` });
  }
}

requireValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", /^pk_(test|live)_/, "a Clerk publishable key starting with pk_test_ or pk_live_");
requireValue("CLERK_SECRET_KEY", /^sk_(test|live)_/, "a Clerk secret key starting with sk_test_ or sk_live_");
requireValue("CLERK_WEBHOOK_SECRET", /^whsec_/, "a Clerk webhook signing secret starting with whsec_");

const signInUrl = value("NEXT_PUBLIC_CLERK_SIGN_IN_URL") || "/login";
const signUpUrl = value("NEXT_PUBLIC_CLERK_SIGN_UP_URL") || "/signup";
if (!signInUrl.startsWith("/") && !/^https:\/\//.test(signInUrl)) {
  issues.push({ key: "NEXT_PUBLIC_CLERK_SIGN_IN_URL", message: "Must be a relative path or HTTPS URL" });
}
if (!signUpUrl.startsWith("/") && !/^https:\/\//.test(signUpUrl)) {
  issues.push({ key: "NEXT_PUBLIC_CLERK_SIGN_UP_URL", message: "Must be a relative path or HTTPS URL" });
}

if (productionRuntime && process.env["DEV_AUTH_BYPASS"] === "true") {
  issues.push({ key: "DEV_AUTH_BYPASS", message: "Dev auth bypass must be disabled in production" });
}

const publicKey = value("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
const secretKey = value("CLERK_SECRET_KEY");
if (productionRuntime && publicKey.startsWith("pk_live_") && secretKey.startsWith("sk_test_")) {
  issues.push({ key: "CLERK_SECRET_KEY", message: "Live publishable key cannot be paired with test secret key" });
}
if (productionRuntime && publicKey.startsWith("pk_test_") && secretKey.startsWith("sk_live_")) {
  issues.push({ key: "CLERK_SECRET_KEY", message: "Test publishable key cannot be paired with live secret key" });
}

if (issues.length > 0) {
  console.error("Clerk authentication configuration is invalid:");
  for (const issue of issues) console.error(`- ${issue.key}: ${issue.message}`);
  process.exit(1);
}

console.log(`Clerk authentication configuration OK (NODE_ENV=${process.env.NODE_ENV ?? "development"}, CI=${ci})`);
console.log(`Sign-in URL: ${signInUrl}; sign-up URL: ${signUpUrl}`);
