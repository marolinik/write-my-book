// Pre-deploy check: Privacy and Terms must carry no unfilled placeholder.
// Not a CI step, because the values wait on the owner and counsel.
import { readFileSync } from "node:fs";
import { findLegalPlaceholders } from "../src/lib/legal/placeholders";

const PAGES = ["src/app/(public)/privacy/page.tsx", "src/app/(public)/terms/page.tsx"];

let open = 0;
for (const page of PAGES) {
  readFileSync(page, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const placeholder of findLegalPlaceholders(line)) {
        open += 1;
        console.error(`${page}:${index + 1}  ${placeholder}`);
      }
    });
}

if (open > 0) {
  console.error(`\n${open} legal placeholder(s) left. Fill them before deploying.`);
  process.exit(1);
}
console.log("Privacy and Terms have no placeholders.");
