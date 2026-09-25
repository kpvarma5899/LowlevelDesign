package com.lld.ratelimit;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Many identities. ConcurrentHashMap is the structure because unrelated keys
 * must not share a lock, and HashMap is not safe when two gateway threads
 * insert the same key. The map does not make the bucket update atomic by
 * itself. compute holds the bin lock for that key while tryAcquire runs, so
 * the read-modify-write does not need a second lock and does not lock every
 * other user.
 */
public final class KeyedTokenBuckets {
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();
    private final double capacity;
    private final double refillPerSecond;

    public KeyedTokenBuckets(double capacity, double refillPerSecond) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerSecond;
    }

    public Decision tryAcquire(String key, long nowMs) {
        Decision[] box = new Decision[1];
        buckets.compute(key, (ignored, existing) -> {
            TokenBucket bucket = existing != null
                    ? existing
                    : new TokenBucket(capacity, refillPerSecond);
            box[0] = bucket.tryAcquire(nowMs);
            return bucket;
        });
        return box[0];
    }
}
