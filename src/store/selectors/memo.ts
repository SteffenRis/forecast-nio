/**
 * Reference-equality memoizer. Returns a cached result when every argument is
 * `Object.is`-equal to a prior call's. This is the memoization boundary that
 * makes the engine selectors cheap: because slice actions update entities
 * immutably (immer), an input object's reference changes iff a field changed,
 * so the cache hits exactly when nothing relevant changed.
 *
 * The cache is a small LRU keyed by the argument tuple — sized to comfortably
 * hold one entry per fund/portfolio in a realistic dataset.
 */
export function memoizeByRef<A extends unknown[], R>(
  fn: (...args: A) => R,
  cacheSize = 64,
): (...args: A) => R {
  const cache: { args: A; result: R }[] = []
  return (...args: A): R => {
    for (let i = 0; i < cache.length; i++) {
      const entry = cache[i]
      if (
        entry.args.length === args.length &&
        entry.args.every((a, j) => Object.is(a, args[j]))
      ) {
        if (i > 0) {
          cache.splice(i, 1)
          cache.unshift(entry)
        }
        return entry.result
      }
    }
    const result = fn(...args)
    cache.unshift({ args, result })
    if (cache.length > cacheSize) cache.pop()
    return result
  }
}
