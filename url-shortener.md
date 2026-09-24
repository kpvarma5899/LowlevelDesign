# Design a URL shortener

At 5 years of experience, a correct diagram is the opening. The score comes from the questions after it: how ids are generated, what happens under a race, and what you refuse to do on the hot path.

**High-level design** is the system: who talks to whom, where data lives, and what you trade away to hit scale, latency, and availability.

**Low-level design** is one box opened up: classes, method contracts, the exact algorithm, and the concurrency control. If two requests arrive at the same millisecond, what decides the winner?

Use this shape every time: requirements, estimate, API, data model, high-level diagram, deep dive, bottlenecks.

**Close on this:** the short code is an obfuscated unique id, the database unique key is the real lock, and the redirect path never writes to the link row.

| | High-level design | Low-level design |
|---|---|---|
| You draw | Clients, create service, redirect service, Redis, primary, replica, Kafka | `UrlService`, `IdGenerator`, `Encoder`, `UrlRepository` |
| You defend | 302, cache-aside, async clicks, read-your-writes | Unique constraint, bijection over the id, thread-safe id allocation |
| They are testing | Whether you protect the hot path | Whether the code stays correct when two requests race |

## 1. Requirements

Functional, in scope:

- Create a short link from a long URL.
- Resolve a short code and redirect.
- Optional custom alias.
- Optional expiry.

Out of scope unless they ask: user accounts, link preview, a full analytics product. Name them so the interviewer can pull one back in.

Non-functional:

- Redirect is the hot path. Reads dwarf writes, often around 100:1.
- Redirect latency target: a few milliseconds on a cache hit.
- Mappings are durable. A created link must still resolve after a process restart.
- Short codes are unique.
- Availability of redirect matters more than availability of create. A user can retry creation. A broken redirect is a dead link.

## 2. Estimate

- 100 million new links per month.
- Write QPS ≈ 100e6 / 2.6e6 seconds ≈ **40 writes/sec** average. Peak 10× ≈ **400 writes/sec**.
- Read QPS ≈ **4,000/sec** average, peak ≈ **40,000/sec**.
- Row size ≈ 500 bytes. Storage ≈ 50 GB/month, a few TB over several years. This is not a storage problem. It is a lookup-latency and hot-key problem.

Code space: base62 (digits, lowercase, uppercase) with 7 characters is 62⁷ ≈ 3.5 trillion codes. Six characters is already ~57 billion, enough for decades at this write rate. Seven gives room for custom aliases and for never recycling expired codes quickly.

## 3. API

```
POST /v1/urls
{ "longUrl": "...", "alias": "sale", "expireAt": "2026-12-01T00:00:00Z" }
→ 201 { "shortCode": "aZ3kP9q", "shortUrl": "https://short.ly/aZ3kP9q" }

GET /{shortCode}
→ 302 Location: https://original.example/very/long/path
→ 404 unknown, 410 expired, 409 alias taken
```

`GET` is the product. Everything else exists to make that lookup boring and fast.

## 4. Data model

One table is enough at this scale.

| Column | Role |
|---|---|
| `short_code` | Primary key. The only lookup on the hot path. |
| `long_url` | Redirect target. |
| `user_id` | Nullable. Secondary index for "my links". |
| `expire_at` | Nullable. Checked on read. |
| `created_at` | Audit. |

The redirect query is a primary-key point lookup. A unique index on `short_code`, no join, no secondary filter on the hot path.

Do not put `click_count` on this row. That decision is explained below.

SQL fits. The access pattern is point read and point write by key, with a strong uniqueness constraint. The uniqueness constraint is the reason to prefer a database that can enforce it.

## 5. High-level design

```
                create                         redirect
Client ──▶  API service ──▶ DB primary     Client ──▶ Redirect service
                │                              │
                │ write-through                ├─▶ Redis (short_code → long_url)
                ▼                              ├─▶ DB replica on miss
              Redis                            └─▶ Kafka (click event, async)
                                                   │
                                                   ▼
                                              Aggregator → analytics store
```

- **Create path.** Validate the URL, allocate an id, encode it, insert the row, put the mapping in cache, return the short URL.
- **Redirect path.** Cache lookup, then primary-key read, then `302`. Publishing the click is asynchronous and must not sit on the latency budget.
- **Services are stateless.** Any instance can serve any code. Scale redirect horizontally behind a load balancer. Health checks remove a bad instance.
- **Split create and redirect** once traffic justifies it. They have different SLOs. Redirect must stay up when create is rate-limited or the primary is struggling.

What fails first: the database, if every redirect misses cache, or a single hot key, if one viral link is requested far above everyone else. Cache hit rate is the design.

## 6. Low-level design

```
UrlService
  create(CreateRequest) → ShortUrl
  resolve(shortCode) → Redirect | NotFound | Expired

IdGenerator.nextId() → long          // unique, thread-safe
Encoder.encode(long) → String        // base62
Encoder.decode(String) → long        // only if the code is a pure encoding

UrlRepository.insert(code, url)      // uniqueness enforced by the DB
UrlRepository.find(code) → Row?

Cache.get / Cache.put                // Redis, shared across instances
ClickPublisher.publish(ClickEvent)   // non-blocking
```

`create` without a custom alias:

1. Reject non-`http`/`https` URLs (`javascript:` and `data:` are an open-redirect bug).
2. `id = idGenerator.nextId()`.
3. `code = encoder.encode(obfuscate(id))`.
4. `repository.insert(code, longUrl, expireAt)`.
5. `cache.put(code, longUrl, ttl)`.
6. Return the short URL.

`resolve`:

1. `cache.get(code)`. On hit, fire the click event and return `302`.
2. On miss, `repository.find(code)`.
3. Missing row → `404`. `expire_at` in the past → `410`. Do not delete on the read path.
4. Populate cache, fire the click event, return `302`.

Concurrency rules:

- `IdGenerator` is thread-safe. A shared counter needs an atomic increment, or no shared in-process counter at all.
- Alias uniqueness is a **unique constraint**, not a check-then-insert in memory. Two app servers will not see each other's in-memory set.
- The cache is Redis. A local `HashMap` is invisible to the other instances and dies with the process. A local cache is only an optional L1 in front of Redis.

## Follow-ups

### How do you generate the short code?

**Counter, then base62.** A monotonic id `125` becomes something like `cb`. No collisions, shortest codes, trivial to debug. A raw counter is guessable: `cb`, `cc`, `cd` walks the entire table. It also funnels every create through one sequence.

**Hash the long URL (MD5 or SHA-256), keep the first 7 characters.** The same URL always maps to the same code, which gives dedup for free. Collisions are real. Two different URLs can share a 7-character prefix, and you must read-before-write or retry with a longer prefix. Dedup is often wrong anyway: the same URL for two users, or the same URL with two expiry dates, should be two links.

**Distributed unique id, then base62.** This is the answer to give. Each app server generates a unique 64-bit id with no per-request database round trip, then encodes it.

A Snowflake-style id is:

- 41 bits of timestamp
- 10 bits of machine id
- 12 bits of per-machine sequence (4096 ids per millisecond per machine)

At 400 writes/sec this is idle. Uniqueness holds as long as machine ids are distinct and the clock does not jump backwards. Codes are still roughly time-ordered, so still guessable.

### How do you stop people enumerating every link?

Keep the counter. Hide it with a **bijection**.

Run the id through a reversible mix (a Feistel permutation, or a small block cipher over the id space) and then base62-encode the result. Every id maps to exactly one code, every code maps back to exactly one id, and neighboring ids land far apart. No collision handling, no hash table of used codes, and scanning `aaaaaaa`, `aaaaaab` does not walk creation order.

Uniqueness comes from the id being unique. Opacity comes from the permutation. The database unique key is the safety net.

### Why base62 and not base64?

Base64 uses `+`, `/`, and `=`. Those are awkward in a path. Base62 is `[0-9a-zA-Z]`, safe in a URL with no encoding. Base58 drops `0`, `O`, `l`, `I` if links will be typed by hand. For a click-only link, base62 is the usual choice.

### Two users request the alias `sale` at the same time

Check-then-insert loses. Both requests see "alias free", both insert, and one mapping disappears or you throw a 500 that depends on timing.

Insert directly and treat a unique-constraint violation as `409 Conflict`. The database is the lock. The unique index is the serialization point. You do not take an application-level lock across servers to protect one row.

Same pattern if a generated code hits the unique index: allocate a new id and retry.

### The user creates a link and immediately clicks it. The click 404s

You wrote to the primary and the redirect read a replica that has not applied the insert yet. Replication lag.

Fixes, in the order to say them:

- On create, write the cache entry yourself. The click never needs the replica.
- For a short window, reads of a just-created code can go to the primary.
- The client already knows the long URL from the create response. The product does not need to round-trip the new code to display it.

Redirect is **eventually consistent** for older links and **read-your-writes** for the creator, achieved by the cache fill on the write path.

### 301 or 302?

**302 Found** (or 307 if you want to preserve the method).

A 301 is cached by browsers and intermediaries as permanent. The next click never reaches you, so expiry, takedown, and click analytics silently stop working, and you cannot change the target.

Use 301 only when the product explicitly wants a permanent mapping and you have accepted that you will not see those clicks again.

### A celebrity tweet gets 500,000 clicks in a minute

The mapping is one key. That is fine for Redis and for a primary-key read. It is fatal if every click does `UPDATE urls SET click_count = click_count + 1 WHERE short_code = ?`. That is one hot row, row locks, and write amplification on the same table that must serve redirects.

Do this instead:

- The redirect handler appends a click event to Kafka and returns. Append is cheap and partitioned.
- A consumer aggregates counts in a window and writes them to an analytics store, keyed by `(short_code, minute)`.
- Unique visitors can be an approximation (HyperLogLog). Exact uniques at this volume are a different system.

If the hot key expires in Redis at the peak, every request falls through to the database together. That is a cache stampede. Mitigations: do not TTL a key that is being hit; use a single-flight lock so one request reloads and the rest wait; or refresh the TTL on access for hot keys.

### How does the id generator stay correct with many app servers?

**Snowflake on each server.** No coordination per id. You must assign machine ids and refuse to issue ids if the clock moves backwards.

**Range allocation from a database sequence.** The sequence is the source of truth, and each app server leases a block, for example 10,000 ids, with one sequence jump per block. Servers then hand out ids from memory. A crash loses the unused tail of the block. Gaps are acceptable. Contention on the sequence drops by the block size. This is the same idea as a sequence cache.

At 40–400 writes/sec, either design is comfortable. The bottleneck you removed is a network round trip to the database on every create.

### What if the same long URL is submitted twice?

Default: **two short codes.** Callers have different owners, expiries, and analytics. Deduping by URL couples strangers together and makes deletion wrong: user A deletes "their" link and breaks user B.

If the product wants dedup, it is a separate feature with an explicit key `(user_id, long_url)`, not an accident of hashing.

### How do expired links get cleaned up?

On the read path, compare `expire_at` and return 410.

A scheduled job deletes or archives rows that expired days ago, in batches, off the hot path. Recycling a code immediately is dangerous: caches, browser history, and shared posts will send people to a new destination. Quarantine codes for a long time, or never reuse them. The code space is large enough.

### The primary database is down. What still works?

Redirects for cached codes keep working. That is most of the traffic if the hit rate is high.

Creates fail. Fail them fast with a timeout rather than queueing unboundedly.

Uncached codes fail until the primary or a promotable replica is back. A read replica can serve misses only if it is caught up enough for the staleness budget. It cannot accept the unique insert.

### What do you rate-limit, and where?

Creation, per user and per IP. Redirects are sometimes abused by bots scanning the code space. A cheap reject for obviously invalid codes (wrong length, bad alphabet) happens before Redis. A bloom filter of known codes is a later optimization, not the core design.

See [rate-limiter.md](rate-limiter.md) for the limiter itself. Limit `POST /v1/urls`. Give `GET /{shortCode}` a much higher ceiling whose job is to blunt random scanning. A viral link is a cache problem, not a rate-limit problem.

## Last five minutes

- **Single points of failure:** the id lease service if you chose ranges; the primary for creates. Redirect is designed to survive without either, for cached keys.
- **What you monitor:** redirect p99, cache hit rate, create error rate, unique-constraint conflicts, Kafka consumer lag, replication lag.
- **What breaks at 10×:** not storage. Hot keys, cache stampede, and click-event volume. The next design change is partitioning the analytics stream and treating the top keys as their own cache tier.
