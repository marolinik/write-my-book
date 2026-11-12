import { execFile, type ChildProcess, type ExecFileOptions } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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
 */
export async function runConverter(
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number }
): Promise<{ stdout: string; stderr: string }> {
  const posix = process.platform !== "win32";
  // promisify(execFile) attaches the ChildProcess to the returned promise.
  // execFile hands its options to spawn, which honours `detached`; the typings
  // for execFile just do not list it.
  const execOptions: ExecFileOptions & { detached?: boolean } = {
    cwd: options.cwd,
    // A new process group on POSIX, so -pid reaches pandoc's children too.
    detached: posix,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  };
  const run = execFileAsync(command, [...args], execOptions) as Promise<{ stdout: string | Buffer; stderr: string | Buffer }> & {
    child?: ChildProcess;
  };
  const child = run.child;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      if (posix && child?.pid) process.kill(-child.pid, "SIGKILL");
      else child?.kill("SIGKILL");
    } catch {
      child?.kill("SIGKILL");
    }
  }, options.timeoutMs);
  timer.unref?.();
  try {
    const { stdout, stderr } = await run;
    return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (error) {
    if (timedOut) throw new ConverterTimeoutError(options.timeoutMs);
    const e = error as { code?: unknown; stderr?: unknown };
    if (typeof e.code === "number") throw new ConverterExitError(e.code, String(e.stderr ?? ""));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
