import { spawn } from "node:child_process";

/**
 * P2-76 / D19: exports run pandoc (and Typst under it) inside the request.
 * Until they move to a queue, a writer may have ONE export running at a time
 * in this process: a proxy timeout followed by the writer pressing Export
 * again used to stack converter processes.
 */
const running = new Set<string>();

/** Runs `fn` holding the writer's export slot, or returns null when it is taken. */
export async function withExportSlot<T>(writerId: string, fn: () => Promise<T>): Promise<{ value: T } | null> {
  if (running.has(writerId)) return null;
  running.add(writerId);
  try {
    return { value: await fn() };
  } finally {
    running.delete(writerId);
  }
}

export class ConverterTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`converter did not finish within ${timeoutMs} ms`);
    this.name = "ConverterTimeoutError";
  }
}

export class ConverterExitError extends Error {
  constructor(
    public readonly code: number | null,
    public readonly stderr: string
  ) {
    super(`converter exited with code ${code}: ${stderr.slice(0, 2000)}`);
    this.name = "ConverterExitError";
  }
}

/**
 * Run a converter with no shell (argv array, D-18) in its OWN process group,
 * and on timeout kill the whole group: execFile's timeout sent SIGTERM to
 * pandoc only, so the Typst child it spawned for a PDF kept running.
 * spawn, not execFile: execFile hands spawn only a fixed set of options and
 * drops `detached`, so the child never became a group leader.
 */
export function runConverter(
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const posix = process.platform !== "win32";
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: false,
      detached: posix, // a new process group, so -pid reaches the children too
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 1_000_000) stderr += chunk.toString();
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (posix && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new ConverterTimeoutError(options.timeoutMs));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new ConverterExitError(code, stderr));
    });
  });
}
