// Starts a query now, to be awaited further down - so queries that don't
// depend on each other run at the same time instead of one after another.
// (The catch only stops an "unhandled" warning in between; awaiting the
// result still throws.)
export function early<T>(p: T | PromiseLike<T>): Promise<T> {
  const started = Promise.resolve(p);
  started.catch(() => {});
  return started;
}
