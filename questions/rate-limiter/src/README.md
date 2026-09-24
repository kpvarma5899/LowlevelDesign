# Rate limiter

Source for this question lives in this folder. The problem is the [note](../README.md). The readable page is https://kpvarma5899.github.io/LowlevelDesign/rate-limiter/.

The implementation is not written yet. When it is, these are the patterns:

- **Strategy.** `TokenBucket` is the algorithm you defend. Fixed window, sliding log, sliding window, and leaky bucket are the other strategies, not the default.
- **Repository.** `TokenBucketStore.tryConsume` is one atomic check-and-consume. `InMemoryTokenBucket` comes first. Redis, behind the same interface, is the shared store.
- **Decorator.** A local deny-cache sits in front of the store so a client that was just rejected does not stampede Redis. Allows are not cached.
- **Service.** `RateLimiter.decide` returns allow, or `429` with `Retry-After`. A store timeout must not hang the caller.

Tests pass time in explicitly, and show that two concurrent consumes cannot both take the last token.
