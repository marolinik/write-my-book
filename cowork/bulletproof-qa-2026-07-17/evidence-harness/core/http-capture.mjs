// core/http-capture.mjs — the only way the harness drives the app (W-F3 §1.3).
//
// Every call produces a req/res artifact PAIR written verbatim to the store BEFORE
// any assertion reads them. Response bodies are captured as raw bytes — NO
// JSON.parse -> re-stringify round trip (that is itself a paraphrase, §0.2).
//
// Headers: x-e2e-test-secret + x-e2e-clerk-id (persona/harness user). Mapping in
// src/lib/auth.ts:54-70; middleware gate src/middleware.ts:26-31.
//
// Node built-ins only (global fetch, Node 22).

import { now } from "./clock.mjs";

/**
 * @param {{ baseUrl?: string, secret: string, clerkId: string, store: any }} cfg
 */
export function createHttpClient(cfg) {
  const baseUrl = (cfg.baseUrl || "http://localhost:3002").replace(/\/$/, "");
  const secret = cfg.secret;
  const clerkId = cfg.clerkId;
  const store = cfg.store;

  function baseHeaders(extra) {
    return {
      "x-e2e-test-secret": secret,
      "x-e2e-clerk-id": clerkId,
      ...(extra ?? {}),
    };
  }

  /**
   * Capture one request/response as an artifact pair.
   * @param {string} label  short step label (e.g. "f001-findings")
   * @param {{ method?: string, path: string, headers?: object, body?: any, bracket?: string|null, measurement?: boolean }} opts
   */
  async function request(label, opts) {
    const method = opts.method ?? "GET";
    const url = opts.path.startsWith("http") ? opts.path : baseUrl + opts.path;
    const headers = baseHeaders(opts.headers);
    let bodyBytes = null;
    if (opts.body !== undefined && opts.body !== null) {
      if (Buffer.isBuffer(opts.body)) bodyBytes = opts.body;
      else if (typeof opts.body === "string") bodyBytes = Buffer.from(opts.body);
      else {
        bodyBytes = Buffer.from(JSON.stringify(opts.body));
        if (!headers["content-type"]) headers["content-type"] = "application/json";
      }
    }

    // Persist the request artifact (headers redacted by the store's redactor).
    store.writeJson(
      { method, url, headers, bodyBase64: bodyBytes ? bodyBytes.toString("base64") : null },
      { label: `req-${label}`, kind: "http-req", bracket: opts.bracket ?? null, meta: { step: label } },
    );

    const sent = now();
    let res;
    try {
      res = await fetch(url, { method, headers, body: bodyBytes ?? undefined });
    } catch (e) {
      const errArt = store.writeJson(
        { error: e.message, url, method },
        { label: `res-${label}-error`, kind: "http-res-error", bracket: opts.bracket ?? null, meta: { step: label } },
      );
      return { ok: false, status: 0, error: e.message, resArtifact: errArt };
    }
    const firstByte = now();
    const resBuf = Buffer.from(await res.arrayBuffer());
    const done = now();

    const resHeaders = {};
    for (const [k, v] of res.headers.entries()) resHeaders[k] = v;

    const resArtifact = store.writeRaw(resBuf, {
      label: `res-${label}`,
      kind: "http-res",
      ext: ".bin",
      bracket: opts.bracket ?? null,
      meta: {
        step: label,
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        timing: { sentUtc: sent.utc, sentMono: sent.mono, firstByteMono: firstByte.mono, doneMono: done.mono },
        measurement: opts.measurement === true,
      },
    });

    return { ok: res.ok, status: res.status, headers: resHeaders, bodyBytes: resBuf, resArtifact };
  }

  /**
   * Capture an SSE stream verbatim + a sidecar index of per-event monotonic times.
   * @param {string} label
   * @param {{ path: string, headers?: object, bracket?: string|null }} opts
   */
  async function stream(label, opts) {
    const url = opts.path.startsWith("http") ? opts.path : baseUrl + opts.path;
    const headers = baseHeaders({ accept: "text/event-stream", ...(opts.headers ?? {}) });
    const sent = now();
    const res = await fetch(url, { method: "GET", headers });
    const chunks = [];
    const index = [];
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of res.body) {
      const t = now();
      chunks.push(Buffer.from(chunk));
      buffered += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffered.indexOf("\n")) !== -1) {
        const evLine = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        if (evLine.startsWith("data:")) index.push({ mono: t.mono, utc: t.utc, preview: evLine.slice(0, 120) });
      }
    }
    const raw = Buffer.concat(chunks);
    const streamArtifact = store.writeRaw(raw, { label: `sse-${label}`, kind: "sse-stream", ext: ".txt", bracket: opts.bracket ?? null, meta: { step: label, status: res.status, sentUtc: sent.utc } });
    store.writeJson({ events: index.length, index }, { label: `sse-${label}-index`, kind: "sse-index", bracket: opts.bracket ?? null, meta: { step: label } });
    return { events: index.length, streamArtifact };
  }

  return { request, stream, baseUrl, clerkId };
}
