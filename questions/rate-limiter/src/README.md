# Rate limiter implementation

Not written yet.

When this is built, it follows the note beside this folder:

- `RateLimiter.decide` and `TokenBucketStore.tryConsume`
- `InMemoryTokenBucket` and, later, a Redis-backed store behind the same interface
- One atomic check-and-consume
- `429` with `Retry-After`
- A store timeout that does not hang the caller

Tests should pass time in explicitly, and show that two concurrent consumes cannot both take the last token.
