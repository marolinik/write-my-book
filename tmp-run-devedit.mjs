// Run dev-edit on chapters 7-18 sequentially
import http from 'http';

const BOOK_ID = "b6b3e176-1788-4230-93ea-f22c3d6dc475";
const CHAPTERS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOpts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForCompletion(chapterNum, maxWaitMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(15000);
    try {
      const findings = await fetch(`http://localhost:3000/api/books/${BOOK_ID}/editorial/findings?chapterNumber=${chapterNum}&agentType=dev-editor`);
      const count = findings.findings ? findings.findings.length : 0;

      const chapters = await fetch(`http://localhost:3000/api/books/${BOOK_ID}/chapters`);
      const ch = chapters.find(c => c.chapterNumber === chapterNum);
      const status = ch ? ch.status : 'unknown';

      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  [${elapsed}s] Ch.${chapterNum}: ${count} findings, status=${status}`);

      if (status === 'dev_edited') {
        return { success: true, findings: count, duration: elapsed };
      }
    } catch (e) {
      console.log(`  [poll error] ${e.message}`);
    }
  }
  return { success: false, findings: 0, duration: Math.round(maxWaitMs / 1000) };
}

const results = [];
for (const ch of CHAPTERS) {
  console.log(`\n=== Dev-edit Chapter ${ch} ===`);
  try {
    const resp = await fetch(`http://localhost:3000/api/books/${BOOK_ID}/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: 'dev-edit', chapterNumber: ch }),
    });

    if (resp.sessionId) {
      console.log(`  Session: ${resp.sessionId}`);
      const result = await waitForCompletion(ch);
      results.push({ chapter: ch, ...result });
      console.log(`  Result: ${result.success ? 'PASS' : 'TIMEOUT'} (${result.findings} findings in ${result.duration}s)`);
    } else {
      console.log(`  ERROR starting session:`, JSON.stringify(resp));
      results.push({ chapter: ch, success: false, findings: 0, error: JSON.stringify(resp) });
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    results.push({ chapter: ch, success: false, findings: 0, error: e.message });
  }
}

console.log('\n=== RESULTS SUMMARY ===');
let totalFindings = 0;
for (const r of results) {
  totalFindings += r.findings || 0;
  console.log(`Ch.${r.chapter}: ${r.success ? 'PASS' : 'FAIL'} - ${r.findings} findings (${r.duration || 0}s)${r.error ? ' ERROR: ' + r.error : ''}`);
}
console.log(`Total: ${results.filter(r=>r.success).length}/${results.length} passed, ${totalFindings} findings`);
