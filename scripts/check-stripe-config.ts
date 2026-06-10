import "dotenv/config";
import { PLANS } from "../src/lib/billing/stripe-client";

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
    issues.push({ key, message: "Missing required Stripe billing variable" });
    return;
  }

  if (productionRuntime && placeholderPattern.test(current)) {
    issues.push({ key, message: "Placeholder value is not allowed in production runtime" });
  }

  if (productionRuntime && pattern && !pattern.test(current)) {
    issues.push({ key, message: `Expected ${description ?? pattern.source}` });
  }
}

requireValue("STRIPE_SECRET_KEY", /^sk_(test|live)_/, "a Stripe secret key starting with sk_test_ or sk_live_");
requireValue("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", /^pk_(test|live)_/, "a Stripe publishable key starting with pk_test_ or pk_live_");
requireValue("STRIPE_WEBHOOK_SECRET", /^whsec_/, "a Stripe webhook signing secret starting with whsec_");

const priceEnvByPlan = {
  founder: ["STRIPE_FOUNDER_MONTHLY_PRICE_ID"],
  indie: ["STRIPE_INDIE_MONTHLY_PRICE_ID", "STRIPE_INDIE_ANNUAL_PRICE_ID"],
  professional: ["STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID"],
  publisher: ["STRIPE_PUBLISHER_MONTHLY_PRICE_ID", "STRIPE_PUBLISHER_ANNUAL_PRICE_ID"],
} as const;

for (const [plan, keys] of Object.entries(priceEnvByPlan)) {
  for (const key of keys) {
    requireValue(key, /^price_/, "a Stripe price id starting with price_");
  }

  const planDef = PLANS[plan as keyof typeof PLANS];
  if (!planDef) {
    issues.push({ key: plan, message: "Plan exists in billing env matrix but not PLANS" });
    continue;
  }

  if (plan === "founder" && planDef.stripePriceIds.annual) {
    issues.push({ key: "founder", message: "Founder plan must remain monthly-only" });
  }
}

const secretKey = value("STRIPE_SECRET_KEY");
const publicKey = value("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
if (productionRuntime && secretKey.startsWith("sk_live_") && publicKey.startsWith("pk_test_")) {
  issues.push({ key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", message: "Live secret key cannot be paired with a test publishable key" });
}
if (productionRuntime && secretKey.startsWith("sk_test_") && publicKey.startsWith("pk_live_")) {
  issues.push({ key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", message: "Test secret key cannot be paired with a live publishable key" });
}

if (issues.length > 0) {
  console.error("Stripe billing configuration is invalid:");
  for (const issue of issues) {
    console.error(`- ${issue.key}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(`Stripe billing configuration OK (NODE_ENV=${process.env.NODE_ENV ?? "development"}, CI=${ci})`);
console.log(`Plans checked: ${Object.keys(priceEnvByPlan).join(", ")}`);
