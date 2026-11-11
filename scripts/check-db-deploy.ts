import "dotenv/config";
import { existsSync } from "node:fs";
import { dbDeployIssues } from "../src/lib/deploy/db-deploy-preflight";

/**
 * Preflight for every schema change (npm run db:diff / db:apply). A remote
 * DATABASE_URL needs DB_DEPLOY_APPROVED=true and a backup confirmed within two
 * hours, whatever NODE_ENV says (P1-18).
 */
const issues = dbDeployIssues(process.env, new Date(), {
  mode: process.argv.includes("--diff") ? "diff" : "apply",
});
if (!existsSync("prisma/schema.prisma")) {
  issues.push({ key: "prisma/schema.prisma", message: "Prisma schema file not found" });
}

if (issues.length > 0) {
  console.error("Database deploy preflight failed:");
  for (const issue of issues) console.error(`- ${issue.key}: ${issue.message}`);
  process.exit(1);
}
console.log("Database deploy preflight OK");
