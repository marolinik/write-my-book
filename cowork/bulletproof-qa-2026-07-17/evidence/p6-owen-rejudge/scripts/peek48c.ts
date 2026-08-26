import { chromium } from "playwright";
const SECRET = process.env.E2E_TEST_SECRET as string;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p6" };
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: H });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3001/settings/billing", { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.waitForTimeout(9000);
  const t = await p.evaluate(`(function(){ return document.body.innerText.length; })()`);
  console.log("bodyLen", t);
  const has = await p.evaluate(`(function(){ var b=document.body.innerText; return { spend: b.indexOf("Your AI Spend"), savings: b.indexOf("Your Key Savings"), byModel: b.indexOf("Usage by Model"), banner: b.indexOf("Cost estimates may be inaccurate"), head: b.slice(0,160) }; })()`);
  console.log(JSON.stringify(has, null, 1));
  const obj = await p.evaluate(`(function(){ var body=document.body.innerText; function block(l,n){var i=body.indexOf(l); return i<0?null:body.slice(i,i+n);} return { spendCard: block("Your AI Spend",320), emDashCount: (body.match(/\u2014/g)||[]).length }; })()`);
  console.log("obj", JSON.stringify(obj));
  await b.close();
})();
