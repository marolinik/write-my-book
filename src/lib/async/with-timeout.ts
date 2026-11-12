/**
 * P2-44: a store call on an agent's path (vector search, graph query, the
 * prompt's graph section) must not pin a worker slot for the client's own
 * multi-minute timeout. The losing promise is left to settle on its own.
 */
export class StoreTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${ms} ms`);
    this.name = "StoreTimeoutError";
  }
}

/** The agent-path budget for one store call. */
export const STORE_CALL_TIMEOUT_MS = 10_000;

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StoreTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
