# Rate limiter

Source for this question. The problem is the [note](../README.md). The page is https://kpvarma5899.github.io/LowlevelDesign/rate-limiter/.

Each algorithm is one class, and the fields of that class are the data structure. The comment on the class says why.

| Class | Structure | Why |
|---|---|---|
| `FixedWindow` | one `int`, plus the bucket start | The clock bucket is the only thing you count. You discarded the timestamps. |
| `SlidingWindowLog` | `ArrayDeque` of timestamps | Oldest at the front. Expire and append are O(1). |
| `SlidingWindowCounter` | previous count and current count | You will not store every request. The weight assumes they were spread evenly. |
| `TokenBucket` | `tokens`, `lastRefillMs` | The closed form of a bucket. No drip thread. |
| `LeakyBucket` | level, `lastLeakMs` | The queue in the diagram, stored as its level. |
| `KeyedTokenBuckets` | `ConcurrentHashMap` | `compute` is the per-key lock. A `HashMap` is not safe. One global lock couples strangers. |
| `redis/sliding-window-log.lua` | Redis sorted set | Score is time. Member is a unique id. Trim, count, and add are one script. |
| `RedissonRateLimiters` | Redisson `RRateLimiter` and `RScript` | The library's limiter is a token bucket. The exact window is still your Lua. Needs the Redisson jar. |

From this directory:

```bash
javac -d out src/java/com/lld/ratelimit/*.java src/java/com/lld/ratelimit/redis/SlidingWindowLogScript.java
java -cp out com.lld.ratelimit.AlgorithmDemo
```

`AlgorithmDemo` checks the boundary (fixed window allows 20, the log allows 10, the bucket allows 11) and that 32 threads cannot all take the last token.
