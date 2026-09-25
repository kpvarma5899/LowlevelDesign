package com.lld.ratelimit;

/**
 * One counter and the start of the clock bucket it belongs to.
 *
 * A counter is enough because every request inside [start, start + window)
 * is treated as the same. The structure throws away each request's real
 * timestamp, which is why 10 requests at the end of one bucket and 10 at
 * the start of the next both pass a limit of 10.
 *
 * An int is the count. A long is the bucket start. A list of timestamps
 * would remove the bug and would no longer be a fixed window.
 */
public final class FixedWindow implements Limiter {
    private final long windowMs;
    private final int limit;
    private long windowStart;
    private int count;
    private boolean initialized;

    public FixedWindow(long windowMs, int limit) {
        this.windowMs = windowMs;
        this.limit = limit;
    }

    @Override
    public synchronized Decision tryAcquire(long nowMs) {
        long start = Math.floorDiv(nowMs, windowMs) * windowMs;
        if (!initialized || start != windowStart) {
            windowStart = start;
            count = 0;
            initialized = true;
        }
        if (count >= limit) {
            return Decision.deny(limit, 0, windowStart + windowMs - nowMs);
        }
        count++;
        return Decision.allow(limit, limit - count);
    }
}
