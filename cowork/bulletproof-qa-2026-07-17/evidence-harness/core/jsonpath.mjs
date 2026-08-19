// core/jsonpath.mjs — tiny, dependency-free JSONPath resolver.
//
// Supports exactly what the scenario specs need (design §3.1 examples):
//   $                       root
//   $.a.b                   object member access
//   $.a[0]                  array index
//   $.arr[*].field          wildcard over array -> array of results
//   $["key with space"]     bracketed string member
//
// Returns an array of matches (so `[*]` composes). A single-value path returns a
// one-element array. No filters, no recursion, no scripts — intentionally.
//
// Node built-ins only.

/**
 * @param {any} root
 * @param {string} path
 * @returns {any[]} matches
 */
export function jsonPath(root, path) {
  if (typeof path !== "string" || path.length === 0) return [];
  const tokens = tokenize(path);
  let current = [root];
  for (const tok of tokens) {
    /** @type {any[]} */
    const next = [];
    for (const node of current) {
      if (node === undefined || node === null) continue;
      if (tok.type === "member") {
        if (typeof node === "object" && !Array.isArray(node) && tok.name in node) {
          next.push(node[tok.name]);
        } else if (Array.isArray(node) && tok.name in node) {
          next.push(node[tok.name]);
        }
      } else if (tok.type === "index") {
        if (Array.isArray(node) && tok.index >= 0 && tok.index < node.length) {
          next.push(node[tok.index]);
        }
      } else if (tok.type === "wildcard") {
        if (Array.isArray(node)) {
          for (const el of node) next.push(el);
        } else if (typeof node === "object") {
          for (const k of Object.keys(node)) next.push(node[k]);
        }
      }
    }
    current = next;
  }
  return current;
}

/** Convenience: first match or undefined. */
export function jsonPathOne(root, path) {
  const r = jsonPath(root, path);
  return r.length > 0 ? r[0] : undefined;
}

function tokenize(path) {
  /** @type {Array<{type:string,name?:string,index?:number}>} */
  const tokens = [];
  let i = 0;
  if (path[0] === "$") i = 1;
  while (i < path.length) {
    const c = path[i];
    if (c === ".") {
      i += 1;
      let name = "";
      while (i < path.length && /[a-zA-Z0-9_$]/.test(path[i])) {
        name += path[i];
        i += 1;
      }
      if (name.length === 0) throw new Error(`jsonpath: empty member at ${i} in "${path}"`);
      tokens.push({ type: "member", name });
    } else if (c === "[") {
      i += 1;
      if (path[i] === "*") {
        tokens.push({ type: "wildcard" });
        i += 1;
      } else if (path[i] === '"' || path[i] === "'") {
        const q = path[i];
        i += 1;
        let name = "";
        while (i < path.length && path[i] !== q) {
          name += path[i];
          i += 1;
        }
        i += 1; // closing quote
        tokens.push({ type: "member", name });
      } else {
        let num = "";
        while (i < path.length && /[0-9]/.test(path[i])) {
          num += path[i];
          i += 1;
        }
        tokens.push({ type: "index", index: Number.parseInt(num, 10) });
      }
      if (path[i] !== "]") throw new Error(`jsonpath: expected ] at ${i} in "${path}"`);
      i += 1;
    } else {
      throw new Error(`jsonpath: unexpected char '${c}' at ${i} in "${path}"`);
    }
  }
  return tokens;
}
