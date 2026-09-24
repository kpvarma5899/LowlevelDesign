# Design a rate limiter

High-level design is a thin shell here. The score is the algorithm, the race between two servers, and what you do when the limiter itself is sick.

**Close on this:** decide with one atomic check-and-consume on a shared counter, answer 429 with Retry-After, and keep a Redis timeout from taking down the API the limiter is there to protect.

| | High-level design | Low-level design |
|---|---|---|
| You draw | Gateway, Redis, local deny-cache, the API behind it | Rule, TokenBucket, Store, Decision |
| You defend | Where the check sits, fail-open vs fail-closed, hot keys | Refill math, atomic consume, Retry-After |
| They are testing | Whether N servers still enforce one limit | Whether two concurrent requests can both take the last token |

| | |
|---|---|
| Algorithm to defend | Token bucket |
| Decision budget, same AZ | 1 ms |
| HTTP status when denied | 429 |
| The lock | A Lua script inside Redis |

## How you spend the 45 minutes

Start in one process so the algorithm is correct. Then add a second server and let the interviewer watch the limit become N times too large. That jump is the whole design.

## Requirements

Functional, in scope: given an identity and a rule, allow or deny this request. Identity is a user id, an API key, or an IP. A request can sit under several rules at once (10 per second and 1,000 per day; per user and per IP). On deny, the caller learns how long to wait. Rules differ by route and by plan.

Out of scope until they pull it back in: volumetric network DDoS (a scrubbing center and a WAF), billing, and a full admin UI for rules.

Non-functional: the decision is on the critical path, so budget about 1 ms inside the same availability zone. Accuracy means "a client cannot sustain more than the rule," with a small burst allowed on purpose. Availability of the limiter matters because a hung check becomes a hung API. The limit must hold across every app server. A single-process map fails that requirement.

## Estimate

10,000 requests per second at the gateway. A few million active identities. Each decision reads and writes a few dozen bytes. A couple of million keys at ~100 bytes is on the order of a few hundred MB. Storage is not the constraint. The constraint is an extra millisecond on every request, and one Redis key that a single abusive client can hammer.

| Input | Figure | What it tells you |
|---|---|---|
| Gateway traffic | 10,000 req/s | Every one of these pays for a decision |
| Hot identities | ~2 million | Key cardinality, not request log size |
| State per key | ~100 bytes | A few hundred MB total |
| Redis in-AZ round trip | ~0.5–1 ms | One script. Four round trips is already the budget. |
| Decision budget | 1 ms p99 | Timeouts have to be shorter than the API timeout |

## API

This is middleware on the gateway, plus a small internal function.

| Surface | Shape |
|---|---|
| Library | `decide(request) → { allowed, limit, remaining, retryAfterMs }` |
| Allow | Call the upstream. Set `X-RateLimit-Limit`, `Remaining`, `Reset`. |
| Deny | `429 Too Many Requests`. `Retry-After` in seconds, ceiling of `retryAfterMs`. |
| Identity | User id when authenticated, else API key, else IP. Say that order. |

`Retry-After` is an integer number of seconds in the common header. Sub-second waits still round up to 1.

## Data model

A token bucket is two numbers. Keyed by rule plus identity, for example `rl:create_url:user:42`.

| Field | Meaning |
|---|---|
| `tokens` | Fractional tokens available right now |
| `last_refill_ms` | When those tokens were last computed |
| TTL | Long enough to refill from empty to full, then the key can disappear |

An idle user costs nothing after the TTL. A missing key means a full bucket, because they have not spent anything. A missing key means "no budget left" only if you are storing a denial, never if you are storing the bucket.

## Five algorithms

Pick the token bucket. It allows a bounded burst and then enforces a steady rate, the state is O(1) per key, and the consume step is one atomic script.

| Algorithm | State per key | Burst | What you say |
|---|---|---|---|
| Token bucket | 2 numbers | Up to capacity, then the refill rate | Default. Burst is a parameter, not an accident. |
| Leaky bucket | Queue depth, or a last-leak time | Output is flat. Excess waits or is dropped. | Use when the downstream cannot accept a spike at all. |
| Fixed window | 1 counter + window start | Up to 2× the limit, straddling the boundary | Cheap, and wrong in a way you can demonstrate with two timestamps. |
| Sliding log | One timestamp per request | Exact over any window | Right answer at low QPS. Memory and CPU follow the request rate. |
| Sliding window counter | 2 counters | Approximate | The compromise when a log is too big and a fixed window is too crude. |

### The boundary bug

Rule: 10 requests in any 10 seconds. The client has a full budget, then sends 10 requests at t = 9s and another 10 at t = 10s. Fixed windows are aligned to t = 0, so those bursts fall in two different counters and both succeed. Twenty requests land in one second.

| Burst | Fixed window allowed | Sliding log allowed | Token bucket allowed (capacity 10, 1/s) |
|---|---|---|---|
| 10 requests at t = 9s | 10 | 10 | 10 |
| 10 requests at t = 10s | 10 | 0 | 1 |

<!-- widget:boundary-chart -->

The sliding log keeps every timestamp, drops those older than 10 seconds, and at t = 10s still sees the ten from t = 9s, so the second burst is fully denied. The token bucket spends all 10 tokens at t = 9s, refills one token over the next second, and allows a single request from the second burst. Same steady rate, and the burst size is exactly the capacity you configured.

### Token bucket math

Capacity is the burst. Refill rate is the sustained rate. On each request, at time `now`:

```
tokens = min(capacity, tokens + (now − last) × rate)
```

If tokens ≥ cost (usually 1), subtract the cost and allow. Otherwise deny. The wait is `(cost − tokens) / rate`. Store the new token count and `last = now`. Because refill is computed from timestamps, you do not run a background thread that drips tokens. Idle keys simply expire.

Worked consume. Capacity 5, rate 1/s. At t = 0 the bucket is full. Five requests are allowed and the bucket hits 0. A sixth request at t = 0.2s sees 0.2 tokens, is denied, and `Retry-After` is `ceil(0.8s) = 1` second. At t = 3s the bucket has 3 tokens and three requests pass.

Fractional tokens are the feature. They make a rate of 5 per second meaningful between whole requests.

Click-through you can do on paper:

1. Start full (5/5).
2. Send 5. Bucket is empty.
3. Send 1 immediately. Denied, retry after 1.0s.
4. Advance one second. One send is allowed again.

That is the burst, then the rate.

<!-- widget:token-bucket -->

### Sliding window counter

Keep the previous window's count and the current window's count.

```
estimate = previous × (1 − elapsed / window) + current
```

Window 60s, limit 100. Previous window closed at 80. We are 15s into the current window, and 20 requests have landed in it. The previous window still overlaps the sliding 60s by 45/60 = 0.75, so estimate = 80 × 0.75 + 20 = 80. The next request is allowed. If the current count were 41, estimate = 60 + 41 = 101, and you deny.

The lie in the formula: it assumes the previous window's requests were spread evenly. If all 80 arrived in the last second of that window, the true sliding count is higher than the estimate, and you let a bit too much through. Say that limitation in the same breath as the formula.

### Leaky bucket

A leaky bucket drains at a constant rate. A request either occupies a slot in a queue that empties at that rate, or it is dropped when the queue is full. The downstream sees a flat arrival rate. A token bucket lets the client spend a saved-up burst immediately, which is what you want for an interactive API. A leaky bucket is what you want in front of a database or a worker pool that falls over on spikes and is fine at a steady pace. Pick per rule, not once for the whole company.

## One limit, many servers

An in-process map is the correct low-level design for one process and the wrong system the moment a second process starts. Twenty pods each enforcing 100 requests per second allow 2,000. The configured number and the real number diverge by your replica count.

### Where the check lives

| Placement | What it actually guarantees |
|---|---|
| Client | Courtesy only. A client you do not control simply skips it. |
| API gateway, shared store | One policy for every route and every replica. This is the default. |
| Inside each service, in memory | Correct only for a limit that is allowed to scale with the number of pods. |
| Dedicated limiter service | Worth it when many languages must share one policy. It is an extra hop on the hot path. |

Draw the gateway in front of the API. The gateway calls Redis with one script and, on allow, forwards upstream. Next to that, a small in-process cache of active denials: if this identity is already rejected until time T, return 429 without a network call. That cache is an optimization against retry storms. The source of truth stays in Redis.

### The race

Two gateway nodes, one token left. Each does GET, sees 1, decides to allow, then SET 0. Two requests pass. The budget was one.

| Step | Server A | Server B | Redis tokens |
|---|---|---|---|
| Read | sees 1 | sees 1 | 1 |
| Decide | allow | allow | 1 |
| Write | SET 0 | SET 0 | 0 |
| Outcome | allowed | allowed | 2 spends of 1 token |

Stop splitting the read and the write across the network. Redis runs the refill and the decrement inside one Lua script, and Redis runs that script atomically on the key. The second caller sees the first caller's result. An application mutex orders threads inside one process. It does not order two processes.

`INCR` plus `EXPIRE` is atomic enough for a fixed-window counter, and it is still the wrong algorithm because of the boundary bug. For a token bucket, `INCR` cannot express "add the elapsed refill, then subtract one, and do both or neither."

A `SETNX` lock is a second round trip, a lock TTL to get wrong, and a deadlock risk. The script does not need a lock because the Redis event loop is the lock.

### Several rules on one request

A create-link call might face a per-user rule and a per-IP rule. If the IP rule is going to deny, consuming the user's tokens charges them for a request you rejected. Evaluate every rule inside one script and commit every decrement only if all of them allow. One round trip, all or nothing.

Order identities as user, then API key, then IP. A global ceiling per pod, held in memory, sits in front of Redis as a coarse fuse. It is allowed to be approximate because its job is to keep one box from melting, not to implement the customer's plan.

### Redis is slow or down

| Traffic | On timeout | Why |
|---|---|---|
| Ordinary product API | Fail open, behind a local emergency cap | A limiter outage should not become a full API outage. The local cap stops an unbounded flood while Redis is gone. |
| Login, OTP, password reset, payment create | Fail closed | Abuse during the outage costs more than a short period of 429s. |

The timeout is a few milliseconds, shorter than the request deadline. A Redis that answers in 800 ms is a failed Redis. Waiting on it moves the outage into every API call. Record fail-open events as a metric. A silent fail-open hides a long Redis incident behind healthy API graphs.

### The hot key

One API key at 50,000 requests per second lands on one Redis key, and in cluster mode on one slot and one node. The rest of the cluster is idle.

Mitigations, in the order to say them:

1. The local deny-cache absorbs the retries after the first denial.
2. A per-pod pre-limit sheds load before Redis.
3. For a global limit that must stay exact under that much traffic, shard the counter and accept a more complicated sum.

Most product limits never need the third step.

## Classes

Four types. The service does not know Redis. The store does not know HTTP. Tests run against an in-memory store that implements the same atomic consume.

```
RateLimitRule — id, capacity, refillPerSecond, cost, failClosed
Decision — allowed, limit, remaining, retryAfterMs
TokenBucketStore.tryConsume(key, rule, nowMs) → Decision
RateLimiter.decide(request, nowMs) → Decision
```

`RedisLuaTokenBucket` and `InMemoryTokenBucket` both implement `TokenBucketStore`. `LocalDenyCache` sits in `RateLimiter`, in front of the store.

### decide

1. Resolve the identity.
2. If the local deny-cache says this key is blocked until a future time, return 429 with the remaining wait.
3. Build the list of rules that apply.
4. Call `tryConsume` once with all of them.
5. If the decision is a denial, cache it until `now + retryAfter`.
6. If the store timed out, follow the rule's fail mode: a local emergency cap for fail-open, a denial for fail-closed.
7. Translate a denial into HTTP 429 and `Retry-After = ceil(retryAfterMs / 1000)`.

### tryConsume

Inside the atomic section, for a single rule:

| Step | Operation |
|---|---|
| 1 | Read tokens and `last_refill_ms`. Missing key → tokens = capacity, last = now. |
| 2 | `elapsed = max(0, now − last)`. Guard a backwards clock. |
| 3 | `tokens = min(capacity, tokens + elapsed × rate)` |
| 4 | If tokens < cost, return denied. `retry = (cost − tokens) / rate`. Do not write a spend. |
| 5 | Else tokens = tokens − cost, write both fields, refresh TTL, return allowed. |

For several rules, run steps 1–4 for every rule first. If any rule denies, write nothing. If all allow, apply every decrement and then return.

`now` is an argument, not a hidden call to the system clock. Tests advance time explicitly. Production passes the gateway's clock. The timestamp that matters is the one Redis uses if you move `now` into the script, so two app servers with drifting clocks cannot both refill the bucket from their own watches. Prefer `Redis TIME` inside the script, or accept app-server time and keep servers on NTP with a skew far below the window.

### Concurrency inside one process

The in-memory store still has threads. One lock per key, or a striped lock, covers the read-modify-write of that bucket. A single global lock serializes unrelated users. The Redis implementation takes no application lock around the script. Holding a lock while you wait on the network stalls every other request that hashes to the same stripe.

### What you monitor

| Signal | Why it pages |
|---|---|
| Decision latency p99 | The limiter is on the critical path |
| Redis timeout rate | Fail-open may be hiding a down dependency |
| Deny rate by rule | A bad rule deploy looks like an outage |
| Hot-key request rate | One identity pinning one Redis node |
| Fail-open count | Must show up on the dashboard |

## Follow-ups

### Why token bucket, in one sentence?

It enforces a sustained rate, the burst is an explicit capacity you chose, and the state is two numbers so the atomic update stays cheap. A fixed window hides a 2× burst on the boundary. A sliding log is exact and stores every request. A leaky bucket is the right tool when the thing behind you cannot take a burst. It is the wrong default for an interactive API that should feel responsive after a quiet period.

### The limit is 100 per second and you run 20 pods

An in-memory limiter allows 2,000 per second. State the real number out loud. Shared Redis brings it back to 100. A per-pod ceiling still belongs in the design as a fuse, set high enough that normal traffic never hits it and low enough that one pod cannot exhaust the box. It is a different rule, with a different job, from the customer's 100 per second.

### How do you compute Retry-After?

Deficit divided by refill rate. Cost is 1, tokens left are 0.2, rate is 2 per second: wait is 0.8 / 2 = 0.4 seconds. The HTTP header is whole seconds, so you send `Retry-After: 1`. Also return the precise millisecond value in a body or in `X-RateLimit-Reset` if the client is yours. A client that retries immediately is the reason for the local deny-cache.

### Whose clock refills the bucket?

Two app servers with clocks a few seconds apart will each compute a generous refill and both write it back. Take the time inside Redis, in the same script as the update, so there is one clock. If you pass the app's timestamp, NTP has to keep skew well under the smallest window you enforce. `elapsed = max(0, now − last)` guards a backwards step.

### A client retries the same payment. Does it count twice?

A rate limiter counts attempts, not successful business outcomes. The retry is another request and it spends another token. That is what you want against a client looping on purpose. Idempotency is a different mechanism: an `Idempotency-Key` makes the second payment a no-op in the payment service. You still rate-limit the HTTP call.

### Do you need Raft?

No. You need atomic read-modify-write on one key. Redis already gives you that. Consensus would order the decision across a quorum and add tens of milliseconds to a check you budgeted at one. Reach for a stronger store only if the limit is a financial control that cannot fail open and cannot tolerate Redis's failover story. Even then you are buying a single-key atomic update, not a distributed agreement on every request.

### Where does this sit on the URL shortener?

Limit create, per user and per IP. Creation is the abuse path: filling the key space, using you as an open redirect factory, scanning aliases. The redirect path is the product and is much hotter, so give it a much higher ceiling whose job is to blunt random code scanning. A viral link is one short code being read, which is a cache problem. Put the limiter on the gateway in front of `POST /v1/urls`. Fail open on Redis trouble for ordinary create. Fail closed on anonymous create if that endpoint is the one being farmed.

### What breaks first at 10×?

Not memory. The first break is Redis CPU on the hottest keys, then the gateway thread pool if a slow Redis is allowed to occupy a thread per request. The change you make is a tight timeout, a local deny-cache, and collapsing every rule for a request into one script. A bigger Redis comes after the working set of keys has actually outgrown memory.
