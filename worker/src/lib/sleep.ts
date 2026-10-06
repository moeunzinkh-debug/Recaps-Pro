/**
 * Waiting inside a Worker.
 *
 * `scheduler.wait()` is the Workers-native way to pause without burning CPU time
 * (it is also allowed inside `ctx.waitUntil`), with a `setTimeout` fallback for
 * older compatibility dates / runtimes.
 */
export async function sleep(ms: number): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { wait?: (ms: number) => Promise<void> } }).scheduler;
  if (scheduler && typeof scheduler.wait === 'function') {
    await scheduler.wait(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
